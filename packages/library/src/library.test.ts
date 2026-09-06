import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import { LibraryRepository, type SQL, type Book } from "./index.ts";
function setup() {
  const db = new DatabaseSync(":memory:");
  const sql: SQL = {
    async exec(text) {
      db.exec(text);
    },
    async run(text, ...params) {
      db.prepare(text).run(...params);
    },
    async all<T>(text: string, ...params: (string | number | null)[]) {
      return db.prepare(text).all(...params) as T[];
    },
    async transaction(action) {
      db.exec("BEGIN");
      try {
        const result = await action(sql);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, repo: new LibraryRepository(sql, "test") };
}
function book(id: string): Book {
  return {
    notes: [],
    bookmarks: [],
    id,
    title: `Book ${id}`,
    author: "Author",
    kind: "manga",
    format: "cbz",
    tags: ["fantasy"],
    collections: [],
    series: "",
    volume: null,
    language: "ja",
    direction: "rtl",
    layout: "pages",
    favorite: false,
    status: "unread",
    progress: 0,
    locator: "",
    addedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    revision: 1,
    device: "test",
    deletedAt: null,
    asset: {
      path: `${id}/original.cbz`,
      hash: id,
      bytes: 100,
      cover: null,
      pages: [],
      chapters: [],
    },
  };
}
test("A stale agent plan rolls back every change, and a fresh batch is undoable", async () => {
  const { db, repo } = setup();
  try {
    await repo.initialize();
    await repo.add(book("a"));
    await repo.add(book("b"));
    await assert.rejects(
      repo.applyPlan({
        version: 1,
        id: "stale",
        title: "Organize",
        changes: [
          { bookId: "a", expectedRevision: 1, patch: { series: "New" } },
          { bookId: "b", expectedRevision: 99, patch: { series: "New" } },
        ],
      }),
    );
    assert.equal((await repo.get("a"))?.series, "");
    await repo.applyPlan({
      version: 1,
      id: "valid",
      title: "Organize",
      changes: [
        {
          bookId: "a",
          expectedRevision: 1,
          patch: { series: "New", collections: ["Shared universe"] },
        },
      ],
    });
    assert.equal(
      (await repo.list({ collection: "Shared universe" })).length,
      1,
    );
    await repo.undoLatest();
    assert.equal((await repo.get("a"))?.series, "");
    assert.equal((await repo.get("a"))?.revision, 3);
  } finally {
    db.close();
  }
});
test("Remote replay converges without acknowledging a newer local edit", async () => {
  const { db, repo } = setup();
  try {
    await repo.initialize();
    const initial = book("a");
    await repo.add(initial);
    const pending = await repo.pending();
    await repo.update("a", { title: "Local edit" });
    await repo.acknowledge(pending);
    assert.equal((await repo.pending()).length, 1);
    await repo.mergeRemote([
      { ...initial, revision: 3, device: "remote", title: "Remote edit" },
    ]);
    await repo.mergeRemote([initial]);
    assert.equal((await repo.get("a"))?.title, "Remote edit");
  } finally {
    db.close();
  }
});
test("Duplicate files and destructive agent fields are rejected", async () => {
  const { db, repo } = setup();
  try {
    await repo.initialize();
    await repo.add(book("a"));
    await assert.rejects(repo.add({ ...book("b"), asset: book("a").asset }));
    await assert.rejects(
      repo.applyPlan({
        version: 1,
        id: "x",
        title: "Invalid",
        changes: [
          {
            bookId: "a",
            expectedRevision: 1,
            patch: { deletedAt: "2026-09-01T00:00:00.000Z" } as never,
          },
        ],
      }),
    );
  } finally {
    db.close();
  }
});
test("10,000-book indexed paging and FTS search return bounded, stable results", async () => {
  const { db, repo } = setup();
  try {
    await repo.initialize();
    const insert = db.prepare("INSERT INTO books(id,data) VALUES(?,?)");
    db.exec("BEGIN");
    for (let i = 0; i < 10000; i++) {
      const record = book(String(i).padStart(5, "0"));
      if (i === 9999) record.format = "pdf";
      insert.run(record.id, JSON.stringify(record));
    }
    db.exec("COMMIT");
    const start = performance.now();
    const first = await repo.list({ kind: "manga", limit: 60 });
    const second = await repo.list({ kind: "manga", offset: 60, limit: 60 });
    const result = await repo.list({ search: "Book 09999" });
    assert.equal(first.length, 60);
    assert.equal(second.length, 60);
    assert.equal(new Set([...first, ...second].map((b) => b.id)).size, 120);
    assert.equal(result[0]?.id, "09999");
    assert.equal(
      (await repo.list({ kind: "manga", format: "pdf" }))[0]?.id,
      "09999",
    );
    assert.equal(
      (await repo.list({ search: "Book 09999", format: "cbz" })).length,
      0,
    );
    assert.equal((await repo.stats()).total, 10000);
    console.log(
      `10k library: two pages + FTS + counts in ${(performance.now() - start).toFixed(1)} ms (host SQLite; not a device UI benchmark)`,
    );
  } finally {
    db.close();
  }
});

test("Saved views overlap without duplicate books and persist all/any exclusions", async () => {
  const { db, repo } = setup();
  try {
    await repo.initialize();
    await repo.add(book("a"));
    await repo.add({
      ...book("b"),
      kind: "novel",
      collections: ["Shared world"],
      tags: ["mystery"],
    });
    const rules = {
      match: "any" as const,
      conditions: [
        { field: "kind" as const, operator: "is" as const, value: "manga" },
        {
          field: "collection" as const,
          operator: "is" as const,
          value: "Shared world",
        },
      ],
    };
    assert.equal((await repo.list({ rules })).length, 2);
    assert.equal(
      (await repo.list({ rules: { ...rules, match: "all" } })).length,
      0,
    );
    assert.deepEqual(
      (
        await repo.list({
          rules: {
            match: "all",
            conditions: [
              { field: "tag", operator: "is-not", value: "FANTASY" },
            ],
          },
        })
      ).map((b) => b.id),
      ["b"],
    );
    await repo.saveView({
      id: "view",
      name: "Across formats",
      rules,
      sort: "series",
    });
    assert.deepEqual((await repo.savedViews())[0]?.rules, rules);
    await repo.removeView("view");
    assert.equal((await repo.savedViews()).length, 0);
    assert.equal((await repo.list()).length, 2);
  } finally {
    db.close();
  }
});
test("Discovery migrates existing notes and chapters, updates atomically, and excludes Trash", async () => {
  const { db, repo } = setup();
  try {
    await repo.initialize();
    const original = {
      ...book("a"),
      notes: [
        {
          id: "n",
          text: "Remember the lighthouse",
          locator: "2:0.4",
          createdAt: "now",
        },
      ],
      asset: {
        ...book("a").asset,
        chapters: [{ path: "chapter.xhtml", title: "Arrival at the island" }],
      },
    };
    await repo.add(original);
    // Recreate the pre-discovery state to exercise an existing-library upgrade.
    db.exec(
      "DROP TRIGGER discovery_insert; DROP TRIGGER discovery_update; DROP TABLE discovery; DELETE FROM settings WHERE key='discovery-v1'",
    );
    await repo.initialize();
    await repo.initialize();
    assert.equal(
      (await repo.discover("lighthouse", "note"))[0]?.locator,
      "2:0.4",
    );
    assert.equal(
      (await repo.discover("Arrival", "passage"))[0]?.kind,
      "chapter",
    );
    await repo.indexChapter(
      original,
      0,
      "Silver moonlight washed the quiet harbor.",
    );
    assert.equal(
      (await repo.discover("moonlight", "passage"))[0]?.locator,
      "0:0",
    );
    assert.ok(await repo.chapterIndexed(original, "chapter.xhtml"));
    await repo.update("a", { notes: [] });
    assert.equal((await repo.discover("lighthouse")).length, 0);
    assert.equal((await repo.discover("moonlight")).length, 1);
    await repo.update("a", { deletedAt: new Date().toISOString() });
    assert.equal((await repo.discover("moonlight")).length, 0);
  } finally {
    db.close();
  }
});
