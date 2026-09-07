import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "apps/mobile/dist");

execFileSync("node", [join(root, "scripts/prepare-browser-workers.mjs")], {
  cwd: root,
  stdio: "inherit",
});

execFileSync(
  "pnpm",
  [
    "--filter",
    "@glassleaf/mobile",
    "exec",
    "expo",
    "export",
    "--platform",
    "web",
    "--output-dir",
    "dist",
  ],
  {
    cwd: root,
    stdio: "inherit",
  },
);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : [join(directory, entry.name)],
    ),
  );
  return nested.flat();
}

const precache = (await files(output))
  .map((file) => `/${relative(output, file).split(sep).join("/")}`)
  .filter(
    (file) =>
      /\.(?:html|m?js|wasm|ttf|ico|json)$/.test(file) && file !== "/sw.js",
  )
  .sort();
const source = await readFile(join(root, "apps/mobile/public/sw.js"), "utf8");
await writeFile(
  join(output, "sw.js"),
  source.replace(
    '["/", "/index.html", "/manifest.json", "/favicon.ico"]',
    JSON.stringify(precache),
  ),
);
console.log(`Generated offline shell with ${precache.length} immutable files.`);
