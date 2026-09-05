import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { listContents, unzip } from 'react-native-zip-archive';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { bookSchema, type Book, type LibraryRepository } from '@glassleaf/library';

const root = () => new Directory(Paths.document, 'library');
export function fileURI(path: string) { return new File(root(), path).uri; }
export async function readText(path: string) { return new File(root(), path).text(); }
export async function writeExport(name: string, value: unknown) { const file = new File(Paths.cache, name); file.write(JSON.stringify(value, null, 2)); return file.uri; }
export async function readExternal(uri: string) { return new File(uri).text(); }
export function hasFile(path: string) { return new File(root(), path).exists; }
export function nativeFile(path: string) { return new File(root(), path); }
export async function installDownload(path: string, url: string, headers: Record<string, string>) {
  const destination = new File(root(), path);
  destination.parentDirectory.create({ intermediates: true, idempotent: true });
  await File.downloadFileAsync(url, destination, { headers, idempotent: true });
}
export async function unpack(book: Book) {
  if (book.format !== 'pdf') await safeUnzip(nativeFile(book.asset.path), new Directory(root(), book.id, 'content'));
}
function safePath(path: string) {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..') && !/^[a-z]+:/i.test(path);
}
async function safeUnzip(source: File, target: Directory) {
  const entries = await listContents(source.uri);
  if (entries.length > 50000 || entries.reduce((sum, e) => sum + e.size, 0) > 2 * 1024 ** 3 || entries.some(e => !safePath(e.path) || e.isEncrypted || e.size > 128 * 1024 ** 2)) throw new Error('This archive is encrypted, unsafe, or exceeds the extraction limit.');
  target.create({ intermediates: true, idempotent: true });
  await unzip(source.uri, target.uri);
  return entries;
}
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, processEntities: false });
const itemSchema = z.object({ '@id': z.string(), '@href': z.string(), '@media-type': z.string().optional(), '@properties': z.string().optional() });
const asArray = (input: unknown): unknown[] => input === undefined ? [] : Array.isArray(input) ? input : [input];
const text = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'object' && value !== null && '#text' in value ? String(value['#text']) : '';
export async function importBook(uri: string, filename: string, repository: LibraryRepository): Promise<Book> {
  const format = filename.split('.').pop()?.toLowerCase();
  if (format !== 'epub' && format !== 'pdf' && format !== 'cbz') throw new Error('Choose an EPUB, PDF, or CBZ comic. CBR/RAR archives are not supported yet.');
  const id = randomUUID(); const directory = new Directory(root(), id);
  directory.create({ intermediates: true });
  try {
    const original = new File(directory, `original.${format}`); new File(uri).copy(original);
    if (!original.size) throw new Error('This file is empty.');
    let title = filename.replace(/\.[^.]+$/, '').replaceAll('_', ' '); let author = 'Unknown author'; let language = ''; let direction: Book['direction'] = 'ltr';
    const pages: string[] = []; const chapters: Book['asset']['chapters'] = []; let cover: string | null = null;
    if (format !== 'pdf') {
      const content = new Directory(directory, 'content'); const entries = await safeUnzip(original, content);
      if (format === 'cbz') {
        pages.push(...entries.filter(e => !e.isDirectory && !e.path.startsWith('__MACOSX/') && /\.(png|jpe?g|webp|gif)$/i.test(e.path)).map(e => e.path).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
        if (!pages.length) throw new Error('This comic contains no supported page images.');
        cover = `${id}/content/${pages[0]}`;
      } else {
        const container = z.object({ container: z.object({ rootfiles: z.object({ rootfile: z.union([z.object({ '@full-path': z.string() }), z.array(z.object({ '@full-path': z.string() }))]) }) }) }).parse(parser.parse(await new File(content, 'META-INF/container.xml').text()));
        const paths = asArray(container.container.rootfiles.rootfile); const opfPath = z.object({ '@full-path': z.string() }).parse(paths[0])['@full-path'];
        if (!safePath(opfPath)) throw new Error('Invalid publication path.');
        const opf = z.object({ package: z.object({ metadata: z.record(z.string(), z.unknown()), manifest: z.object({ item: z.unknown() }), spine: z.object({ itemref: z.unknown(), '@page-progression-direction': z.string().optional() }) }) }).parse(parser.parse(await new File(content, opfPath).text())).package;
        const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
        const items = asArray(opf.manifest.item).map(v => itemSchema.parse(v));
        title = text(opf.metadata.title) || title; author = asArray(opf.metadata.creator).map(text).filter(Boolean).join(', ') || author;
        language = text(opf.metadata.language); direction = opf.spine['@page-progression-direction'] === 'rtl' ? 'rtl' : 'ltr';
        for (const ref of asArray(opf.spine.itemref)) {
          const key = z.object({ '@idref': z.string() }).parse(ref)['@idref']; const item = items.find(i => i['@id'] === key);
          if (!item || !safePath(base + item['@href'])) throw new Error('Invalid reading order.');
          chapters.push({ path: base + item['@href'], title: `Chapter ${chapters.length + 1}` });
        }
        if (!chapters.length) throw new Error('This EPUB has no readable chapters.');
        const coverItem = items.find(i => i['@properties']?.split(' ').includes('cover-image'));
        if (coverItem && safePath(base + coverItem['@href'])) cover = `${id}/content/${base}${coverItem['@href']}`;
      }
    } else {
      const handle = original.open();
      try { if (new TextDecoder().decode(handle.readBytes(5)) !== '%PDF-') throw new Error('This file is not a PDF.'); } finally { handle.close(); }
    }
    const now = new Date().toISOString();
    const book = bookSchema.parse({ id, title, author, kind: format === 'cbz' ? 'comic' : format === 'pdf' ? 'document' : 'novel', format, tags: [], collections: [], series: '', volume: null, language, direction, layout: format === 'epub' ? 'scroll' : 'pages', favorite: false, status: 'unread', progress: 0, locator: '', addedAt: now, updatedAt: now, revision: 1, device: await repository.setting('device') ?? 'local', deletedAt: null, asset: { path: `${id}/original.${format}`, hash: original.md5, bytes: original.size, cover, pages, chapters } });
    await repository.add(book); return book;
  } catch (error) { directory.delete(); throw error; }
}
