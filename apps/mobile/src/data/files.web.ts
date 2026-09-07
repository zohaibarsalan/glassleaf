import {
  bookSchema,
  type Book,
  type LibraryRepository,
} from "@glassleaf/library";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

const databaseName = "glassleaf-files-v1";
const storeName = "files";
const maxArchiveEntries = 50_000;
const maxArchiveBytes = 2 * 1024 ** 3;
const maxEntryBytes = 128 * 1024 ** 2;
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
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Browser storage failed."));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Browser storage failed."));
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

export function hasFile(path: string) {
  return objectURLs.has(path) || !!cachedCover(path);
}

export async function hashFile(path: string) {
  const file = await readFile(path);
  if (!file) throw new Error("This file is not stored in this browser.");
  return sha256(file);
}

export async function installDownload(
  path: string,
  url: string,
  headers: Record<string, string>,
) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  await storeFile(path, await response.blob());
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

async function unpackArchive(id: string, source: Blob) {
  const zip = await JSZip.loadAsync(source);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (
    entries.length > maxArchiveEntries ||
    entries.some((entry) => !safePath(entry.name))
  )
    throw new Error("This archive is unsafe or exceeds the extraction limit.");
  let total = 0;
  for (const entry of entries) {
    const blob = await entry.async("blob");
    total += blob.size;
    if (blob.size > maxEntryBytes || total > maxArchiveBytes)
      throw new Error(
        "This archive is unsafe or exceeds the extraction limit.",
      );
    await storeFile(`${id}/content/${entry.name}`, blob);
  }
  return entries;
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

async function sha256(blob: Blob) {
  const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function selectedBlob(uri: string) {
  const response = await fetch(uri);
  if (!response.ok)
    throw new Error(`Could not read the selected file (${response.status}).`);
  return response.blob();
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
    throw new Error("This file exceeds the 2 GB browser import limit.");

  const id = crypto.randomUUID();
  const originalPath = `${id}/original.${format}`;
  await storeFile(originalPath, original);

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
      const entries = await unpackArchive(id, original);
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

    if (cover) {
      const coverBlob = await readFile(cover);
      if (coverBlob) await cacheCover(cover, coverBlob);
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
        hash: await sha256(original),
        bytes: original.size,
        cover,
        pages,
        chapters,
      },
    });
    await repository.add(book);
    return book;
  } catch (error) {
    // IndexedDB does not provide recursive deletion; retained orphaned files are safe and can be reclaimed by browser storage controls.
    throw error;
  }
}
