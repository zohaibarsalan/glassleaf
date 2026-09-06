import type { LibraryRepository } from "@glassleaf/library";
import { XMLParser } from "fast-xml-parser";
import { bookFileReady, nativeFile, readText } from "./files";
const parser = new XMLParser({
  ignoreAttributes: true,
  processEntities: false,
  ignoreDeclaration: true,
});
function flatten(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (value && typeof value === "object")
    return Object.entries(value)
      .filter(([k]) => !["script", "style", "head"].includes(k))
      .map(([, v]) => flatten(v))
      .join(" ");
  return "";
}
export async function indexLocalChapters(
  repo: LibraryRepository,
  signal: AbortSignal,
  status: (message: string) => void,
) {
  let offset = 0,
    indexed = 0,
    skipped = 0;
  while (!signal.aborted) {
    const books = await repo.list({
      format: "epub",
      sort: "title",
      limit: 20,
      offset,
    });
    if (!books.length) break;
    offset += books.length;
    for (const book of books) {
      if (signal.aborted) return;
      if (!bookFileReady(book)) {
        skipped += book.asset.chapters.length;
        continue;
      }
      for (const [index, chapter] of book.asset.chapters.entries()) {
        if (signal.aborted) return;
        if (await repo.chapterIndexed(book, chapter.path)) continue;
        try {
          const path = `${book.id}/content/${chapter.path}`;
          if (nativeFile(path).size > 2 * 1024 * 1024) {
            skipped++;
            continue;
          }
          const body = flatten(parser.parse(await readText(path)) as unknown)
            .replace(/\s+/g, " ")
            .trim();
          if (signal.aborted) return;
          await repo.indexChapter(book, index, body);
          indexed++;
          status(`Making chapters searchable · ${indexed} indexed`);
        } catch {
          skipped++;
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }
  }
  if (!signal.aborted)
    status(
      skipped
        ? `${skipped} chapters unavailable or too large to index. Local EPUB text is searchable.`
        : "Local EPUB chapters are searchable.",
    );
}
