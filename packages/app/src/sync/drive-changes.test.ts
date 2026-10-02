import assert from "node:assert/strict";
import test from "node:test";
import type { Book, LibraryRepository } from "@glassleaf/library";
import {
  DriveSyncEngine,
  type DriveAuth,
  type DriveAssets,
} from "./drive-core";
const google: DriveAuth = {
  configured: true,
  connect: async () => ({ id: "account" }),
  disconnect: async () => {},
  accessToken: async () => "token",
  account: () => ({ id: "account" }),
};
const assets: DriveAssets = {
  hasFile: () => false,
  hashFile: async () => "",
  uploadBody: async () => "",
  installDownload: async () => {},
  removeFile: async () => {},
  bookFileReady: () => true,
  unpack: async () => {},
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const file = (id: string, type = "batch") => ({
  id,
  appProperties: { glassleaf: "v1", type },
});
function publication(id: string): Book {
  return {
    id,
    title: id,
    author: "Writer",
    kind: "novel",
    format: "epub",
    tags: [],
    collections: [],
    series: "",
    volume: null,
    language: "en",
    direction: "ltr",
    layout: "pages",
    pdfNightMode: false,
    notes: [],
    bookmarks: [],
    favorite: false,
    status: "unread",
    progress: 0,
    locator: "",
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revision: 1,
    device: "remote",
    deletedAt: null,
    asset: {
      path: `${id}/original.epub`,
      hash: "0123456789abcdef0123456789abcdef",
      bytes: 1,
      cover: null,
      pages: [],
      chapters: [],
    },
  };
}
function library(catalog?: unknown) {
  const settings = new Map<string, string>([["drive-account", "account"]]);
  if (catalog) settings.set("drive-catalog:account", JSON.stringify(catalog));
  const merged: string[] = [];
  const repo = {
    setting: async (key: string) => settings.get(key) ?? null,
    setSetting: async (key: string, value: string) => {
      settings.set(key, value);
    },
    mergeRemote: async (records: Book[]) => {
      merged.push(...records.map((x) => x.id));
    },
    mergeOrganization: async () => {},
    pending: async () => [],
    pendingOrganization: async () => [],
    snapshot: async () => ({ books: [] }),
  } as unknown as LibraryRepository;
  return { repo, settings, merged };
}
const initial = { version: 1, cursor: "old", files: [] };

test("captures the bootstrap cursor before listing and then uses only incremental changes", async () => {
  const { repo, settings } = library();
  const requests: string[] = [];
  const engine = new DriveSyncEngine(google, assets, async (url) => {
    const u = new URL(String(url));
    requests.push(u.pathname + u.search);
    if (u.pathname.endsWith("startPageToken"))
      return json({ startPageToken: "before-list" });
    if (u.pathname.endsWith("/changes"))
      return json({ changes: [], newStartPageToken: "caught-up" });
    return json({ files: [] });
  });
  await engine.sync(repo, () => {});
  assert.match(requests[0]!, /startPageToken/);
  assert.equal(
    JSON.parse(settings.get("drive-catalog:account")!).cursor,
    "before-list",
  );
  requests.length = 0;
  await engine.sync(repo, () => {});
  assert.equal(requests.length, 1);
  assert.match(requests[0]!, /pageToken=before-list/);
  assert.equal(
    JSON.parse(settings.get("drive-catalog:account")!).cursor,
    "caught-up",
  );
});

test("a failed merge retains the cursor and retry skips only committed batches", async () => {
  const { repo, settings, merged } = library(initial);
  let fail = true;
  repo.mergeRemote = async (records) => {
    const id = records[0]!.id;
    if (id === "second" && fail) throw new Error("disk full");
    merged.push(id);
  };
  const engine = new DriveSyncEngine(google, assets, async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/changes"))
      return u.searchParams.get("pageToken") === "old"
        ? json({
            changes: [{ fileId: "one", file: file("one") }],
            nextPageToken: "next",
          })
        : json({
            changes: [{ fileId: "two", file: file("two") }],
            newStartPageToken: "final",
          });
    return json([publication(u.pathname.endsWith("one") ? "first" : "second")]);
  });
  await assert.rejects(
    engine.sync(repo, () => {}),
    /disk full/,
  );
  assert.equal(
    JSON.parse(settings.get("drive-catalog:account")!).cursor,
    "old",
  );
  assert.equal(settings.get("drive-batch:account:one"), "1");
  assert.equal(settings.get("drive-batch:account:two"), undefined);
  fail = false;
  await engine.sync(repo, () => {});
  assert.deepEqual(merged, ["first", "second"]);
  assert.equal(
    JSON.parse(settings.get("drive-catalog:account")!).cursor,
    "final",
  );
});

test("an unsuccessful later changes page cannot advance the cursor", async () => {
  const { repo, settings } = library(initial);
  const engine = new DriveSyncEngine(google, assets, async (url) =>
    new URL(String(url)).searchParams.get("pageToken") === "old"
      ? json({
          changes: [{ fileId: "one", file: file("one") }],
          nextPageToken: "next",
        })
      : new Response(null, { status: 400 }),
  );
  await assert.rejects(
    engine.sync(repo, () => {}),
    /400/,
  );
  assert.equal(settings.get("drive-catalog:account"), JSON.stringify(initial));
});

test("an expired cursor bootstraps while revoked sign-in retains the existing cursor", async () => {
  const { repo, settings } = library(initial);
  let expired = true;
  let bootstraps = 0;
  const engine = new DriveSyncEngine(google, assets, async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/changes"))
      return new Response(null, { status: expired ? 410 : 401 });
    if (u.pathname.endsWith("startPageToken")) {
      bootstraps++;
      return json({ startPageToken: "fresh" });
    }
    return json({ files: [] });
  });
  await engine.sync(repo, () => {});
  assert.equal(bootstraps, 1);
  const committed = settings.get("drive-catalog:account");
  expired = false;
  await assert.rejects(
    engine.sync(repo, () => {}),
    /expired/,
  );
  assert.equal(settings.get("drive-catalog:account"), committed);
  assert.equal(bootstraps, 1);
});

test("removed Drive files leave local books intact and unrelated files are ignored", async () => {
  const { repo, settings, merged } = library({
    ...initial,
    files: [file("old-asset", "asset")],
  });
  const engine = new DriveSyncEngine(google, assets, async () =>
    json({
      changes: [
        { fileId: "old-asset", removed: true },
        {
          fileId: "other",
          file: { id: "other", appProperties: { type: "batch" } },
        },
      ],
      newStartPageToken: "new",
    }),
  );
  await engine.sync(repo, () => {});
  assert.deepEqual(
    JSON.parse(settings.get("drive-catalog:account")!).files,
    [],
  );
  assert.deepEqual(merged, []);
});
