import type { LibraryRepository } from "@glassleaf/library";
import { XMLParser } from "fast-xml-parser";
import { nativeFile, readText } from "./files";
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
  let indexed = 0;
  while (!signal.aborted) {
    const jobs = await repo.pendingChapters();
    if (!jobs.length) break;
    for (const { book, index, path: relative } of jobs) {
      if (signal.aborted) return;
      const path = `${book.id}/content/${relative}`;
      try {
        if (
          !nativeFile(path).exists ||
          nativeFile(path).size > 2 * 1024 * 1024
        ) {
          await repo.skipChapter(book.id, relative);
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
        if (signal.aborted) return;
        await repo.skipChapter(book.id, relative);
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  if (!signal.aborted) {
    const skipped = await repo.unavailableChapters();
    status(
      skipped
        ? `${skipped} chapters are unavailable. Retry after downloading their files.`
        : "Local EPUB chapters are searchable.",
    );
  }
}
