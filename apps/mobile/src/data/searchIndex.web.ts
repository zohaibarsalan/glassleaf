import type { LibraryRepository } from "@glassleaf/library";
import { XMLParser } from "fast-xml-parser";
import { readText } from "./files";

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
      .filter(([key]) => !["script", "style", "head"].includes(key))
      .map(([, child]) => flatten(child))
      .join(" ");
  return "";
}

export async function indexLocalChapters(
  repo: LibraryRepository,
  signal: AbortSignal,
  status: (message: string) => void,
) {
  if ((await repo.setting("chapter-index-version")) !== "2") {
    await repo.retryChapters();
    await repo.setSetting("chapter-index-version", "2");
  }
  let indexed = 0;
  while (!signal.aborted) {
    const jobs = await repo.pendingChapters();
    if (!jobs.length) break;
    for (const { book, index, path } of jobs) {
      if (signal.aborted) return;
      try {
        if (/\.(jpe?g|png|gif|webp|svg)$/i.test(path))
          await repo.indexChapter(book, index, "");
        else {
          const source = await readText(`${book.id}/content/${path}`);
          if (source.length > 2 * 1024 * 1024)
            await repo.skipChapter(book.id, path);
          else
            await repo.indexChapter(
              book,
              index,
              flatten(parser.parse(source)).replace(/\s+/g, " ").trim(),
            );
        }
        indexed++;
        status(`Making chapters searchable · ${indexed} indexed`);
      } catch {
        await repo.skipChapter(book.id, path);
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  if (!signal.aborted)
    status(
      (await repo.unavailableChapters())
        ? "Some chapters are unavailable. Retry after downloading their files."
        : "Local EPUB chapters are searchable.",
    );
}
