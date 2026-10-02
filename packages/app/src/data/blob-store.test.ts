import assert from "node:assert/strict";
import test from "node:test";
import { BrowserFileStore, type FileRecord, type FileDisk } from "./blob-store";
function fixture() {
  const records = new Map<string, FileRecord>(),
    files = new Map<string, Blob>();
  let sequence = 0;
  const metadata = {
    get: async (path: string) => records.get(path),
    put: async (record: FileRecord) => {
      records.set(record.path, record);
    },
    remove: async (path: string) => {
      records.delete(path);
    },
  };
  const disk: FileDisk = {
    read: async (name) => files.get(name),
    write: async (name, blob) => {
      files.set(name, blob);
    },
    remove: async (name) => {
      files.delete(name);
    },
  };
  return {
    records,
    files,
    metadata,
    disk,
    store: new BrowserFileStore(metadata, disk, () => `file-${++sequence}`),
  };
}
test("legacy books migrate after disk persistence and retain their MIME type", async () => {
  const { records, store } = fixture();
  records.set("book/original.pdf", {
    path: "book/original.pdf",
    blob: new Blob(["%PDF-content"], { type: "application/pdf" }),
  });
  assert.equal(
    await (await store.get("book/original.pdf"))!.text(),
    "%PDF-content",
  );
  assert.ok("opfsFile" in records.get("book/original.pdf")!);
  assert.equal((await store.get("book/original.pdf"))!.type, "application/pdf");
});
test("failed migration preserves readable legacy data and removes partial files", async () => {
  const { records, files, disk, store } = fixture();
  const legacy = { path: "original", blob: new Blob(["valuable book"]) };
  records.set("original", legacy);
  disk.write = async (name) => {
    files.set(name, new Blob(["partial"]));
    throw new Error("quota");
  };
  assert.equal(await (await store.get("original"))!.text(), "valuable book");
  assert.strictEqual(records.get("original"), legacy);
  assert.equal(files.size, 0);
});
test("a failed metadata commit retains the last published book", async () => {
  const { metadata, files, store } = fixture();
  await store.set("original", new Blob(["old"]));
  metadata.put = async () => {
    throw new Error("transaction aborted");
  };
  await assert.rejects(
    store.set("original", new Blob(["new"])),
    /transaction aborted/,
  );
  assert.equal(await (await store.get("original"))!.text(), "old");
  assert.equal(files.size, 1);
});
test("overlapping writes publish in order and remove superseded files", async () => {
  const { store, files } = fixture();
  await Promise.all([
    store.set("original", new Blob(["first"])),
    store.set("original", new Blob(["second"])),
  ]);
  assert.equal(await (await store.get("original"))!.text(), "second");
  assert.equal(files.size, 1);
  await store.remove("original");
  assert.equal(await store.get("original"), undefined);
  assert.equal(files.size, 0);
});
test("a metadata removal failure retains both the original and its file", async () => {
  const { metadata, store, files } = fixture();
  await store.set("original", new Blob(["keep"]));
  metadata.remove = async () => {
    throw new Error("database unavailable");
  };
  await assert.rejects(store.remove("original"), /database unavailable/);
  assert.equal(await (await store.get("original"))!.text(), "keep");
  assert.equal(files.size, 1);
});
test("incomplete OPFS files cannot be returned as valid books", async () => {
  const { store, files } = fixture();
  await store.set("original", new Blob(["complete"]));
  files.set("file-1", new Blob(["bad"]));
  await assert.rejects(store.get("original"), /incomplete/);
});
