import assert from "node:assert/strict";
import test from "node:test";
import type { Book, LibraryRepository } from "@glassleaf/library";
import {
  DriveSyncEngine,
  type DriveAssets,
  type DriveAuth,
} from "./drive-core";

function repository(
  settings: Record<string, string> = {},
  pending: Book[] = [],
  books: Book[] = [],
) {
  const values = new Map(Object.entries(settings));
  const repo = {
    setting: async (key: string) => values.get(key) ?? null,
    setSetting: async (key: string, value: string) => {
      values.set(key, value);
    },
    pending: async () => pending,
    acknowledge: async () => undefined,
    pendingOrganization: async () => [],
    acknowledgeOrganization: async () => undefined,
    mergeRemote: async () => undefined,
    mergeOrganization: async () => undefined,
    snapshot: async () => ({ books }),
  } as unknown as LibraryRepository;
  return { repo, values };
}

function auth(): DriveAuth {
  const account = { id: "account-a", email: "a@example.com" };
  return {
    configured: true,
    connect: async () => account,
    disconnect: async () => undefined,
    accessToken: async () => "access-token",
    account: () => account,
  };
}

function assets(overrides: Partial<DriveAssets> = {}): DriveAssets {
  return {
    hasFile: () => false,
    hashFile: async () => "",
    uploadBody: async () => "",
    installDownload: async () => undefined,
    removeFile: async () => undefined,
    bookFileReady: () => true,
    unpack: async () => undefined,
    ...overrides,
  };
}

function listResponse() {
  return new Response(JSON.stringify({ files: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("coalesces concurrent sync calls for one local repository", async () => {
  const { repo } = repository({ "drive-account": "account-a" });
  let calls = 0;
  const engine = new DriveSyncEngine(auth(), assets(), async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 1));
    return listResponse();
  });
  const first = engine.sync(repo, () => undefined);
  const second = engine.sync(repo, () => undefined);
  assert.strictEqual(first, second);
  await first;
  assert.equal(calls, 3);
});

test("does not require a deleted book's original before uploading its tombstone", async () => {
  const deleted = {
    id: "book-a",
    title: "Deleted",
    author: "",
    kind: "novel",
    format: "epub",
    tags: [],
    collections: [],
    series: "",
    volume: null,
    language: "",
    direction: "ltr",
    layout: "scroll",
    pdfNightMode: false,
    notes: [],
    bookmarks: [],
    favorite: false,
    status: "unread",
    progress: 0,
    locator: "",
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revision: 2,
    device: "device-a",
    deletedAt: "2026-01-02T00:00:00.000Z",
    asset: {
      path: "book-a/original.epub",
      hash: "0123456789abcdef0123456789abcdef",
      bytes: 1,
      cover: null,
      pages: [],
      chapters: [],
    },
  } satisfies Book;
  const { repo } = repository({ "drive-account": "account-a" }, [deleted]);
  let uploadBodyCalls = 0;
  let acknowledgements = 0;
  const engine = new DriveSyncEngine(
    auth(),
    assets({
      uploadBody: async () => {
        uploadBodyCalls++;
        return "";
      },
    }),
    async (url, init) => {
      const address = String(url);
      if (address.includes("/upload/drive") && init?.method === "POST")
        return new Response(null, {
          status: 200,
          headers: { location: "https://www.googleapis.com/upload/complete" },
        });
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      if (address.endsWith("/drive/v3/files") && init?.method === "POST")
        return new Response(JSON.stringify({ id: "folder" }), { status: 200 });
      return listResponse();
    },
  );
  (repo.acknowledge as unknown as (records: Book[]) => Promise<void>) =
    async () => {
      acknowledgements++;
    };
  await engine.sync(repo, () => undefined);
  assert.equal(uploadBodyCalls, 0);
  assert.equal(acknowledgements, 1);
});
