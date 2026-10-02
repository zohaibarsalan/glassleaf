import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const source = await readFile(
  new URL("../apps/web/dist/sw.js", import.meta.url),
  "utf8",
);
function shell() {
  const handlers = new Map(),
    cache = new Map(),
    precache = [];
  const cacheAPI = {
    addAll: async (paths) => {
      precache.push(...paths);
      for (const path of paths) cache.set(path, new Response(path));
    },
    match: async (path) =>
      cache.get(typeof path === "string" ? path : new URL(path.url).pathname),
  };
  const fetches = [];
  runInNewContext(source, {
    URL,
    Response,
    Set,
    Promise,
    self: {
      location: new URL("https://glassleaf.test/"),
      addEventListener: (name, fn) => handlers.set(name, fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cacheAPI,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async (request) => {
      fetches.push(request);
      throw new Error("offline");
    },
  });
  async function install() {
    let complete;
    handlers.get("install")({
      waitUntil: (p) => {
        complete = p;
      },
    });
    await complete;
  }
  function request(url, mode = "cors", method = "GET") {
    let response;
    handlers.get("fetch")({
      request: { url, mode, method },
      respondWith: (p) => {
        response = p;
      },
    });
    return response;
  }
  return { precache, fetches, install, request };
}
test("the built offline shell includes CSS, fonts, SQLite and both file/PDF workers", async () => {
  const { precache, install } = shell();
  await install();
  for (const path of [
    "/index.html",
    "/sqlite3.wasm",
    "/glassleaf-sqlite-worker.mjs",
    "/glassleaf-files-worker.js",
    "/pdf.worker.min.mjs",
    "/manifest.json",
    "/icon-180.png",
  ])
    assert.ok(precache.includes(path), `${path} is missing`);
  assert.ok(precache.some((path) => path.endsWith(".css")));
  assert.equal(precache.filter((path) => path.endsWith(".ttf")).length, 4);
  assert.ok(
    !precache.some((path) => /\.(epub|cbz|pdf)$/.test(path)),
    "Original books must be user-controlled downloads",
  );
  for (const path of precache)
    await readFile(new URL(`../apps/web/dist${path}`, import.meta.url));
});
test("offline navigation falls back to the cached app and worker assets remain readable", async () => {
  const { install, request, fetches } = shell();
  await install();
  assert.equal(
    await (await request("https://glassleaf.test/library", "navigate")).text(),
    "/index.html",
  );
  assert.equal(
    await (
      await request("https://glassleaf.test/glassleaf-files-worker.js?v=1")
    ).text(),
    "/glassleaf-files-worker.js",
  );
  assert.equal(fetches.length, 1);
});
test("the shell does not intercept OAuth, Drive or write requests", async () => {
  const { install, request, fetches } = shell();
  await install();
  assert.equal(request("https://www.googleapis.com/drive/v3/files"), undefined);
  assert.equal(
    request("https://glassleaf.test/local", "cors", "POST"),
    undefined,
  );
  assert.equal(fetches.length, 0);
});
