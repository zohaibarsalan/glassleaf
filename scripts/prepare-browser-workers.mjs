import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(
  root,
  "apps/mobile/node_modules/@sqlite.org/sqlite-wasm/dist",
);
const publicDir = join(root, "apps/mobile/public");
const worker = await readFile(join(dist, "sqlite3-worker1.mjs"), "utf8");
const entrypoint =
  "sqlite3InitModule().then((sqlite3) => sqlite3.initWorker1API());";
const sahPoolEntrypoint = `sqlite3InitModule().then(async (sqlite3) => {
\tawait sqlite3.installOpfsSAHPoolVfs({ initialCapacity: 8 });
\tsqlite3.initWorker1API();
});`;

if (!worker.includes(entrypoint)) {
  throw new Error(
    "SQLite worker entrypoint changed; review the SAH pool bootstrap.",
  );
}

await mkdir(publicDir, { recursive: true });
// These are unmodified Apache-2.0 PDF.js and official SQLite WASM artifacts,
// apart from the SQLite entrypoint that installs the SAH-pool VFS before
// Worker1 begins accepting database commands.
await Promise.all([
  writeFile(
    join(publicDir, "glassleaf-sqlite-worker.mjs"),
    worker.replace(entrypoint, sahPoolEntrypoint),
  ),
  cp(join(dist, "sqlite3.wasm"), join(publicDir, "sqlite3.wasm")),
  cp(
    join(
      root,
      "apps/mobile/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ),
    join(publicDir, "pdf.worker.min.mjs"),
  ),
]);
