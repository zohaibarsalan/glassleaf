import {
  bookSchema,
  type Book,
  type LibraryRepository,
} from "@glassleaf/library";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

const databaseName = "glassleaf-files-v1";
const storeName = "files";
// Browser imports share the native archive contract, but use lower caps to
// avoid turning a tab into a multi-gigabyte decompressor.
const maxArchiveEntries = 20_000;
const maxArchiveBytes = 512 * 1024 ** 2;
const maxEntryBytes = 64 * 1024 ** 2;
const objectURLs = new Map<string, string>();

type StoredFile = { path: string; blob: Blob };

function openFilesDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "path" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open browser storage."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openFilesDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result!: T;
      request.onsuccess = () => {
        // A request can succeed before the transaction is durably committed.
        // Return only after oncomplete so callers can safely use the result as
        // evidence that a write survived the transaction.
        result = request.result;
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Browser storage failed."));
      transaction.oncomplete = () => resolve(result);
      const rejectTransaction = () =>
        reject(transaction.error ?? new Error("Browser storage failed."));
      transaction.onerror = rejectTransaction;
      transaction.onabort = rejectTransaction;
    });
  } finally {
    db.close();
  }
}

async function storeFile(path: string, blob: Blob) {
  await withStore("readwrite", (store) =>
    store.put({ path, blob } satisfies StoredFile),
  );
  setObjectURL(path, blob);
}

export async function readFile(path: string): Promise<Blob | undefined> {
  const record = await withStore(
    "readonly",
    (store) => store.get(path) as IDBRequest<StoredFile | undefined>,
  );
  return record?.blob;
}

function setObjectURL(path: string, blob: Blob) {
  const previous = objectURLs.get(path);
  if (previous) URL.revokeObjectURL(previous);
  objectURLs.set(path, URL.createObjectURL(blob));
}

function cachedCover(path: string) {
  try {
    return localStorage.getItem(`glassleaf-cover:${path}`);
  } catch {
    return null;
  }
}

async function cacheCover(path: string, blob: Blob) {
  if (blob.size > 1_000_000) return;
  try {
    const value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    localStorage.setItem(`glassleaf-cover:${path}`, value);
  } catch {
    // Covers are an enhancement. IndexedDB remains the canonical local copy.
  }
}

export function fileURI(path: string) {
  return objectURLs.get(path) ?? cachedCover(path) ?? "";
}

export async function readText(path: string) {
  const file = await readFile(path);
  if (!file) throw new Error("This file is not stored in this browser.");
  return file.text();
}

export async function writeExport(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return url;
}

export async function readExternal(uri: string) {
  const response = await fetch(uri);
  if (!response.ok)
    throw new Error(`Could not read the selected file (${response.status}).`);
  return response.text();
}

export async function hasFile(path: string) {
  if (objectURLs.has(path) || !!cachedCover(path)) return true;
  return Boolean(await readFile(path));
}

export async function removeFile(path: string) {
  await withStore("readwrite", (store) => store.delete(path));
  const url = objectURLs.get(path);
  if (url) URL.revokeObjectURL(url);
  objectURLs.delete(path);
  try {
    localStorage.removeItem(`glassleaf-cover:${path}`);
  } catch {
    // A missing cover cache must not make the canonical file removal fail.
  }
}

export async function removeFile(path: string) {
  await withStore("readwrite", (store) => store.delete(path));
  const url = objectURLs.get(path);
  if (url) URL.revokeObjectURL(url);
  objectURLs.delete(path);
}

export async function hashFile(path: string) {
  const file = await readFile(path);
  if (!file) throw new Error("This file is not stored in this browser.");
  return md5(file);
}

export async function installDownload(
  path: string,
  url: string,
  headers: Record<string, string>,
) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  await storeFile(path, await responseBlob(response));
}

export function bookFileReady(book: Book) {
  return hasFile(book.asset.path);
}

export async function unpack(book: Book) {
  const source = await readFile(book.asset.path);
  if (!source) throw new Error("This book is not stored in this browser.");
  if (book.format !== "pdf") await unpackArchive(book.id, source);
}

function safePath(path: string) {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    !/^[a-z]+:/i.test(path)
  );
}

async function unpackArchive(
  id: string,
  source: Blob,
  writtenPaths?: string[],
) {
  const zip = await JSZip.loadAsync(source);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (
    entries.length > maxArchiveEntries ||
    entries.some((entry) => !safePath(entry.name))
  )
    throw new Error("This archive is unsafe or exceeds the extraction limit.");

  let declaredTotal = 0;
  for (const entry of entries) {
    const declared = declaredUncompressedSize(entry);
    if (declared === undefined) continue;
    if (declared > maxEntryBytes || declaredTotal > maxArchiveBytes - declared)
      throw new Error(
        "This archive is unsafe or exceeds the extraction limit.",
      );
    declaredTotal += declared;
  }

  let total = 0;
  const written = writtenPaths ?? [];
  for (const entry of entries) {
    const blob = await readZipEntry(
      entry,
      Math.min(maxEntryBytes, maxArchiveBytes - total),
    );
    total += blob.size;
    const path = `${id}/content/${entry.name}`;
    try {
      await storeFile(path, blob);
      written.push(path);
    } catch (error) {
      await Promise.allSettled(written.map(removeFile));
      throw error;
    }
  }
  return entries;
}

function declaredUncompressedSize(entry: JSZip.JSZipObject) {
  const data = (
    entry as JSZip.JSZipObject & {
      _data?: { uncompressedSize?: unknown };
    }
  )._data;
  const size = data?.uncompressedSize;
  return typeof size === "number" && Number.isSafeInteger(size) && size >= 0
    ? size
    : undefined;
}

async function readZipEntry(entry: JSZip.JSZipObject, limit: number) {
  return new Promise<Blob>((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    const stream = (
      entry as JSZip.JSZipObject & {
        internalStream: (
          type: "uint8array",
        ) => JSZip.JSZipStreamHelper<Uint8Array>;
      }
    ).internalStream("uint8array");
    let size = 0;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      stream.pause();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    stream
      .on("data", (chunk) => {
        if (settled) return;
        size += chunk.byteLength;
        if (size > limit) {
          fail(
            new Error(
              "This archive is unsafe or exceeds the extraction limit.",
            ),
          );
          return;
        }
        chunks.push(copyChunk(chunk));
      })
      .on("error", fail)
      .on("end", () => {
        if (settled) return;
        settled = true;
        resolve(new Blob(chunks));
      })
      .resume();
  });
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  processEntities: false,
});

const asArray = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (value && typeof value === "object" && "#text" in value)
    return String(value["#text"]);
  return "";
}

function valueAt(object: unknown, key: string): unknown {
  return object && typeof object === "object"
    ? (object as Record<string, unknown>)[key]
    : undefined;
}

function relative(base: string, target: string) {
  const url = new URL(target, `https://publication/${base}`);
  if (url.origin !== "https://publication")
    throw new Error("Invalid publication path.");
  return decodeURIComponent(url.pathname.slice(1));
}

async function responseBlob(response: Response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxArchiveBytes)
    throw new Error("This file exceeds the browser import limit.");
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > maxArchiveBytes)
      throw new Error("This file exceeds the browser import limit.");
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      if (!chunk) break;
      total += chunk.byteLength;
      if (total > maxArchiveBytes) {
        await reader.cancel();
        throw new Error("This file exceeds the browser import limit.");
      }
      chunks.push(copyChunk(chunk));
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: response.headers.get("content-type") ?? "" });
}

function copyChunk(chunk: Uint8Array) {
  const copy = new ArrayBuffer(chunk.byteLength);
  new Uint8Array(copy).set(chunk);
  return copy;
}

async function md5(blob: Blob) {
  const input = new Uint8Array(await blob.arrayBuffer());
  const length = input.length;
  const paddedLength = (length + 9 + 63) & ~63;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, (length << 3) >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(length / 0x20000000), true);

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) =>
      view.getUint32(offset + index * 4, true),
    );
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const k = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
      const rotated = (a + f + k + words[g]!) >>> 0;
      const shift = shifts[i]!;
      const next =
        (b + ((rotated << shift) | (rotated >>> (32 - shift)))) >>> 0;
      a = d;
      d = c;
      c = b;
      b = next;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0]
    .flatMap((word) => [0, 8, 16, 24].map((shift) => (word >>> shift) & 0xff))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function selectedBlob(uri: string) {
  const response = await fetch(uri);
  if (!response.ok)
    throw new Error(`Could not read the selected file (${response.status}).`);
  return responseBlob(response);
}

export async function importBook(
  uri: string,
  filename: string,
  repository: LibraryRepository,
): Promise<Book> {
  const format = filename.split(".").pop()?.toLowerCase();
  if (format !== "epub" && format !== "pdf" && format !== "cbz")
    throw new Error(
      "Choose an EPUB, PDF, or CBZ comic. CBR/RAR archives are not supported yet.",
    );

  const original = await selectedBlob(uri);
  if (!original.size) throw new Error("This file is empty.");
  if (original.size > maxArchiveBytes)
    throw new Error("This file exceeds the browser import limit.");

  const id = crypto.randomUUID();
  const originalPath = `${id}/original.${format}`;
  await storeFile(originalPath, original);
  const extractedPaths: string[] = [];

  try {
    let title = filename.replace(/\.[^.]+$/, "").replaceAll("_", " ");
    let author = "Unknown author";
    let language = "";
    let direction: Book["direction"] = "ltr";
    const pages: string[] = [];
    const chapters: Book["asset"]["chapters"] = [];
    let cover: string | null = null;

    if (format === "pdf") {
      if (
        new TextDecoder().decode(await original.slice(0, 5).arrayBuffer()) !==
        "%PDF-"
      )
        throw new Error("This file is not a PDF.");
    } else {
      const entries = await unpackArchive(id, original, extractedPaths);
      if (format === "cbz") {
        pages.push(
          ...entries
            .map((entry) => entry.name)
            .filter(
              (path) =>
                !path.startsWith("__MACOSX/") &&
                /\.(png|jpe?g|webp|gif)$/i.test(path),
            )
            .sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
        );
        if (!pages.length)
          throw new Error("This comic contains no supported page images.");
        cover = `${id}/content/${pages[0]}`;
        const comicInfo = entries.find((entry) =>
          /(^|\/)ComicInfo\.xml$/i.test(entry.name),
        );
        if (comicInfo) {
          const info = parser.parse(
            await readText(`${id}/content/${comicInfo.name}`),
          );
          const comic = valueAt(info, "ComicInfo");
          title = text(valueAt(comic, "Title")) || title;
          author = text(valueAt(comic, "Writer")) || author;
          language = text(valueAt(comic, "LanguageISO"));
          if (
            text(valueAt(comic, "Manga")).toLowerCase() === "yesandrighttoleft"
          )
            direction = "rtl";
        }
      } else {
        const container = parser.parse(
          await readText(`${id}/content/META-INF/container.xml`),
        );
        const rootfiles = valueAt(
          valueAt(valueAt(container, "container"), "rootfiles"),
          "rootfile",
        );
        const root = asArray(rootfiles)[0] as
          Record<string, unknown> | undefined;
        const opfPath = root?.["@full-path"];
        if (typeof opfPath !== "string" || !safePath(opfPath))
          throw new Error("Invalid publication path.");
        const packageData = valueAt(
          parser.parse(await readText(`${id}/content/${opfPath}`)),
          "package",
        );
        const metadata = valueAt(packageData, "metadata");
        const manifest = asArray(
          valueAt(valueAt(packageData, "manifest"), "item"),
        ) as Record<string, unknown>[];
        const spine = valueAt(packageData, "spine") as
          Record<string, unknown> | undefined;
        const base = opfPath.includes("/")
          ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
          : "";
        title = text(valueAt(metadata, "title")) || title;
        author =
          asArray(valueAt(metadata, "creator"))
            .map(text)
            .filter(Boolean)
            .join(", ") || author;
        language = text(valueAt(metadata, "language"));
        direction =
          spine?.["@page-progression-direction"] === "rtl" ? "rtl" : "ltr";
        for (const ref of asArray(spine?.itemref) as Record<
          string,
          unknown
        >[]) {
          const item = manifest.find(
            (candidate) => candidate["@id"] === ref["@idref"],
          );
          const href = item?.["@href"];
          if (typeof href !== "string") continue;
          const path = relative(base, href);
          if (safePath(path))
            chapters.push({ path, title: `Chapter ${chapters.length + 1}` });
        }
        if (!chapters.length)
          throw new Error("This EPUB has no readable chapters.");
        const coverItem = manifest.find((item) =>
          String(item["@properties"] ?? "")
            .split(" ")
            .includes("cover-image"),
        );
        if (typeof coverItem?.["@href"] === "string")
          cover = `${id}/content/${relative(base, coverItem["@href"] as string)}`;
      }
    }

    const now = new Date().toISOString();
    const book = bookSchema.parse({
      id,
      title,
      author,
      kind:
        format === "cbz" ? "comic" : format === "pdf" ? "document" : "novel",
      format,
      tags: [],
      collections: [],
      series: "",
      volume: null,
      language,
      direction,
      layout: format === "epub" ? "scroll" : "pages",
      favorite: false,
      status: "unread",
      progress: 0,
      locator: "",
      addedAt: now,
      updatedAt: now,
      revision: 1,
      device: (await repository.setting("device")) ?? "web",
      deletedAt: null,
      asset: {
        path: originalPath,
        hash: await md5(original),
        bytes: original.size,
        cover,
        pages,
        chapters,
      },
    });
    await repository.add(book);
    if (cover) {
      const coverBlob = await readFile(cover);
      if (coverBlob) await cacheCover(cover, coverBlob);
    }
    return book;
  } catch (error) {
    await Promise.allSettled(
      [originalPath, ...extractedPaths].map((path) => removeFile(path)),
    );
    throw error;
  }
}
