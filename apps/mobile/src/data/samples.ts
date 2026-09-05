import type { LibraryRepository } from "@glassleaf/library";
import { Asset } from "expo-asset";
import manifest from "../../assets/samples/manifest.json";
import { importBook } from "./files";
const samples = [
  {
    file: require("../../assets/samples/the-quiet-atlas.epub"),
    name: "the-quiet-atlas.epub",
    kind: "novel",
  },
  {
    file: require("../../assets/samples/blue-hour.cbz"),
    name: "blue-hour.cbz",
    kind: "manga",
  },
  {
    file: require("../../assets/samples/field-notes.pdf"),
    name: "field-notes.pdf",
    kind: "document",
  },
  {
    file: require("../../assets/samples/a-small-infinity.epub"),
    name: "a-small-infinity.epub",
    kind: "light-novel",
  },
  {
    file: require("../../assets/samples/wild-islands.cbz"),
    name: "wild-islands.cbz",
    kind: "comic",
  },
  {
    file: require("../../assets/samples/the-long-way.epub"),
    name: "the-long-way.epub",
    kind: "novel",
  },
  {
    file: require("../../assets/samples/moon-garden.cbz"),
    name: "moon-garden.cbz",
    kind: "manga",
  },
  {
    file: require("../../assets/samples/the-shape-of-light.epub"),
    name: "the-shape-of-light.epub",
    kind: "novel",
  },
] as const;
export async function loadSamples(repo: LibraryRepository) {
  for (const sample of samples) {
    if (await repo.setting(`sample:${sample.name}`)) continue;
    const asset = await Asset.fromModule(sample.file).downloadAsync();
    const book = await importBook(
      asset.localUri ?? asset.uri,
      sample.name,
      repo,
    );
    const metadata = manifest.find((item) =>
      sample.name.startsWith(item.slug + "."),
    );
    await repo.update(book.id, {
      title: metadata?.title ?? book.title,
      author: metadata?.author ?? book.author,
      kind: sample.kind,
      direction: sample.kind === "manga" ? "rtl" : "ltr",
      collections: ["Glassleaf originals"],
    });
    await repo.setSetting(`sample:${sample.name}`, book.id);
  }
}
