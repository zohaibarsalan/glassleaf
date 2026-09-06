import type { Book } from "@glassleaf/library";
import { XMLParser } from "fast-xml-parser";
import { readText } from "./files";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
});
function nodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  const node = value as Record<string, unknown>;
  return [node, ...Object.values(node).flatMap(nodes)];
}
function label(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (!value || typeof value !== "object") return "";
  return Object.entries(value)
    .filter(([key]) => !key.startsWith("@"))
    .map(([, v]) => label(v))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
function resolve(path: string, base: string) {
  const uri = new URL(path, `https://publication/${base}`);
  if (uri.origin !== "https://publication")
    throw new Error("Invalid publication link");
  return decodeURIComponent(uri.pathname.slice(1));
}
export async function chapterTitles(
  book: Book,
): Promise<Book["asset"]["chapters"]> {
  const read = async (path: string): Promise<unknown> =>
    parser.parse(await readText(`${book.id}/content/${path}`)) as unknown;
  const container = nodes(await read("META-INF/container.xml"));
  const opfPath = container.find(
    (node) => typeof node["@full-path"] === "string",
  )?.["@full-path"];
  if (typeof opfPath !== "string") return book.asset.chapters;
  const manifest = nodes(await read(opfPath));
  const nav =
    manifest.find((node) =>
      String(node["@properties"] ?? "")
        .split(/\s+/)
        .includes("nav"),
    ) ??
    manifest.find((node) => node["@media-type"] === "application/x-dtbncx+xml");
  if (typeof nav?.["@href"] !== "string") return book.asset.chapters;
  const navPath = resolve(nav["@href"], opfPath);
  const document = await read(navPath);
  const toc =
    nodes(document).find((node) =>
      String(node["@type"] ?? "")
        .split(/\s+/)
        .includes("toc"),
    ) ?? document;
  const titles = new Map<string, string>();
  for (const node of nodes(toc)) {
    const href = node["@href"];
    if (typeof href === "string") {
      const title = label(node);
      const path = resolve(href, navPath);
      if (title && !titles.has(path)) titles.set(path, title);
    }
    const content = node.content as Record<string, unknown> | undefined;
    if (typeof content?.["@src"] === "string") {
      const path = resolve(content["@src"], navPath);
      const title = label(node.navLabel);
      if (title && !titles.has(path)) titles.set(path, title);
    }
  }
  return book.asset.chapters.map((chapter) => ({
    ...chapter,
    title: titles.get(decodeURIComponent(chapter.path)) ?? chapter.title,
  }));
}
