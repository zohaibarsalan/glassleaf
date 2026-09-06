import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LibraryRepository,
  matchesRules,
  type Rules,
  type SQL,
  type Book,
} from "./index.ts";
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
      record.kind = i % 2 ? "manga" : "novel";
      record.format = i % 3 === 0 ? "pdf" : i % 3 === 1 ? "epub" : "cbz";
      record.tags = [i % 2 ? "fantasy" : "science", `topic-${i % 20}`];
      record.collections = [`Shelf ${i % 10}`];
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
      (
        await repo.list({ search: "Book 09999", kind: "manga", format: "pdf" })
      )[0]?.id,
      "09999",
    );
    assert.equal(
      (await repo.list({ search: "Book 09999", format: "cbz" })).length,
      0,
    );
    assert.equal((await repo.stats()).total, 10000);
    const rules: Rules = {
      match: "all",
      conditions: [
        { field: "collection", operator: "is", value: "Shelf 9" },
        {
          match: "any",
          conditions: [
            { field: "tag", operator: "is", value: "fantasy" },
            { field: "format", operator: "is", value: "epub" },
          ],
        },
      ],
    };
    const scoped = await repo.list({ rules, limit: 60 });
    assert.equal(scoped.length, 60);
    assert.ok(scoped.every((b) => matchesRules(b, rules)));
    assert.equal(
      (await repo.discover("Book 09999", "book", 0, { rules }))[0]?.bookId,
      "09999",
    );
    const facets = await repo.facets({ rules });
    assert.equal(
      facets.find((f) => f.field === "collection" && f.value === "Shelf 9")
        ?.count,
      1000,
    );
    console.log(
      `10k library: paging + FTS + nested scope + facets/counts in ${(performance.now() - start).toFixed(1)} ms (host SQLite; not a device UI benchmark)`,
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

test("Nested rules share semantics with scoped search and ordered lists", async () => {
  const { repo, db } = setup();
  try {
    await repo.initialize();
    await repo.add({ ...book("a"), title: "Moon manga" });
    await repo.add({ ...book("b"), kind: "light-novel", title: "Moon novel" });
    await repo.add({ ...book("c"), language: "en", title: "Moon English" });
    const rules = {
      match: "all" as const,
      conditions: [
        { field: "language" as const, operator: "is" as const, value: "ja" },
        {
          match: "any" as const,
          conditions: [
            { field: "kind" as const, operator: "is" as const, value: "manga" },
            {
              field: "kind" as const,
              operator: "is" as const,
              value: "light-novel",
            },
          ],
        },
      ],
    };
    assert.deepEqual(
      (await repo.list({ rules })).map((b) => b.id),
      ["a", "b"],
    );
    assert.deepEqual(
      (await repo.discover("Moon", "book", 0, { rules }))
        .map((b) => b.bookId)
        .sort(),
      ["a", "b"],
    );
    await repo.saveOrganization(
      "list-a",
      { kind: "reading-list", name: "Crossover", bookIds: ["b", "a"] },
      null,
    );
    assert.deepEqual(
      (await repo.list({ readingListId: "list-a", sort: "list-order" })).map(
        (b) => b.id,
      ),
      ["b", "a"],
    );
    assert.equal(
      (await repo.discover("English", "book", 0, { readingListId: "list-a" }))
        .length,
      0,
    );
    await assert.rejects(
      repo.saveOrganization(
        "list-a",
        { kind: "reading-list", name: "Stale", bookIds: [] },
        null,
      ),
    );
    assert.equal((await repo.list({ readingListId: "list-a" })).length, 2);
  } finally {
    db.close();
  }
});
test("Organization sync preserves tombstones, revisions, pending edits and undo", async () => {
  const a = setup(),
    b = setup();
  try {
    await a.repo.initialize();
    await b.repo.initialize();
    await a.repo.saveView({
      id: "pinned",
      name: "Pinned",
      pinned: true,
      rules: { match: "all", conditions: [] },
      sort: "title",
    });
    const first = await a.repo.pendingOrganization();
    await b.repo.mergeOrganization(first);
    assert.equal((await b.repo.savedViews())[0]?.pinned, true);
    await a.repo.saveView({
      ...(await a.repo.savedViews())[0]!,
      name: "New name",
    });
    await a.repo.acknowledgeOrganization(first);
    assert.equal((await a.repo.pendingOrganization()).length, 1);
    await a.repo.removeView("pinned");
    await b.repo.mergeOrganization(await a.repo.pendingOrganization());
    await b.repo.mergeOrganization(first);
    assert.equal((await b.repo.savedViews()).length, 0);
    await a.repo.undoStructure();
    assert.equal((await a.repo.savedViews())[0]?.name, "New name");
  } finally {
    a.db.close();
    b.db.close();
  }
});
test("Reading recency is not changed by metadata edits and facets follow current scope", async () => {
  const { repo, db } = setup();
  try {
    await repo.initialize();
    await repo.add({
      ...book("a"),
      lastReadAt: "2026-09-05T00:00:00.000Z",
      collections: ["Old shelf"],
    });
    await repo.add({
      ...book("b"),
      lastReadAt: "2026-09-06T00:00:00.000Z",
      tags: ["science"],
    });
    await repo.update("a", { title: "Edited today" });
    assert.deepEqual(
      (await repo.list({ sort: "last-read" })).map((b) => b.id),
      ["b", "a"],
    );
    assert.deepEqual(
      (await repo.facets({ bookId: "b" })).map((f) => f.value),
      ["science"],
    );
    const shelf = (await repo.organization()).find(
      (r) => r.value.kind === "collection",
    );
    assert.ok(shelf);
    assert.equal((await repo.list({ collectionId: shelf.id }))[0]?.id, "a");
  } finally {
    db.close();
  }
});

test("Collection merges update memberships and scoped views atomically, and undo restores both", async () => {
  const { repo, db } = setup();
  try {
    await repo.initialize();
    await repo.add({ ...book("a"), collections: ["Old"] });
    await repo.add({ ...book("b"), collections: ["New"] });
    const old = (await repo.organization()).find(
      (r) => r.value.kind === "collection" && r.value.name === "Old",
    )!;
    const destination = (await repo.organization()).find(
      (r) => r.value.kind === "collection" && r.value.name === "New",
    )!;
    await repo.saveView({
      id: "scoped",
      name: "Scoped",
      sort: "title",
      scope: { collectionId: old.id },
      rules: {
        match: "all",
        conditions: [
          {
            match: "any",
            conditions: [{ field: "collection", operator: "is", value: "Old" }],
          },
        ],
      },
    });
    await repo.renameFacet("collection", "Old", "New");
    assert.deepEqual((await repo.get("a"))?.collections, ["New"]);
    const view = (await repo.savedViews())[0]!;
    assert.equal(view.scope?.collectionId, destination.id);
    assert.equal(
      (await repo.list({ ...view.scope, rules: view.rules })).length,
      2,
    );
    await repo.undoStructure();
    assert.deepEqual((await repo.get("a"))?.collections, ["Old"]);
    assert.equal((await repo.savedViews())[0]?.scope?.collectionId, old.id);
    await repo.renameFacet("collection", "Old", "Renamed");
    assert.equal((await repo.list({ collectionId: old.id }))[0]?.id, "a");
    await repo.add({ ...book("c"), collections: ["Old"] });
    const reused = (await repo.organization()).find(
      (r) => r.value.kind === "collection" && r.value.name === "Old",
    )!;
    assert.notEqual(reused.id, old.id);
    assert.deepEqual(
      (await repo.list({ collectionId: reused.id })).map((b) => b.id),
      ["c"],
    );
  } finally {
    db.close();
  }
});
test("Chapter jobs resume, retry unavailable files, and reject stale asset work", async () => {
  const { repo, db } = setup();
  try {
    await repo.initialize();
    const a = book("a");
    a.asset.chapters = [
      { path: "one.xhtml", title: "One" },
      { path: "two.xhtml", title: "Two" },
    ];
    await repo.add(a);
    assert.equal((await repo.pendingChapters()).length, 2);
    await repo.indexChapter(a, 0, "Nebula passage");
    await repo.skipChapter("a", "two.xhtml");
    await repo.initialize();
    assert.equal((await repo.pendingChapters()).length, 0);
    assert.equal(await repo.unavailableChapters(), 1);
    await repo.retryChapters();
    assert.equal((await repo.pendingChapters())[0]?.index, 1);
    await repo.mergeRemote([
      { ...a, revision: 2, asset: { ...a.asset, hash: "replacement" } },
    ]);
    await repo.indexChapter(a, 0, "Stale passage");
    assert.equal((await repo.discover("Stale")).length, 0);
    assert.equal((await repo.pendingChapters()).length, 2);
  } finally {
    db.close();
  }
});
