import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pwaCacheId } from "./pwa-cache-id.mjs";

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

const precacheFiles = (await files(output))
  .map((file) => ({
    file,
    path: `/${relative(output, file).split(sep).join("/")}`,
  }))
  .filter(
    ({ path }) =>
      /\.(?:html|m?js|wasm|ttf|ico|json)$/.test(path) && path !== "/sw.js",
  )
  .sort((left, right) => left.path.localeCompare(right.path));
const precache = precacheFiles.map(({ path }) => path);
const source = await readFile(join(root, "apps/mobile/public/sw.js"), "utf8");
const cacheId = pwaCacheId(
  source,
  await Promise.all(
    precacheFiles.map(async ({ file, path }) => ({
      path,
      bytes: await readFile(file),
    })),
  ),
);
if (!source.includes('const CACHE = "glassleaf-shell-dev";')) {
  throw new Error("Service worker cache placeholder is missing.");
}
await writeFile(
  join(output, "sw.js"),
  source
    .replace(
      'const CACHE = "glassleaf-shell-dev";',
      `const CACHE = ${JSON.stringify(cacheId)};`,
    )
    .replace(
      '["/", "/index.html", "/manifest.json", "/favicon.ico"]',
      JSON.stringify(precache),
    ),
);
console.log(`Generated ${cacheId} with ${precache.length} immutable files.`);
