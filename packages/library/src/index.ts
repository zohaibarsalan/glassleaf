import {
  organizationRecordSchema,
  structurePlanSchema,
  collectionId,
  type OrganizationRecord,
  type OrganizationValue,
  type StructurePlan,
} from "./organization";
export * from "./organization";
import {
  compileRules,
  savedViewSchema,
  type Rules,
  type SavedView,
} from "./views";
export * from "./views";
import { z } from "zod";

export const kinds = [
  "novel",
  "light-novel",
  "manga",
  "comic",
  "document",
] as const;
export type StoryKind = (typeof kinds)[number];
export const kindLabels: Record<StoryKind, string> = {
  novel: "Novels",
  "light-novel": "Light novels",
  manga: "Manga",
  comic: "Comics",
  document: "Documents",
};
const relativePath = z.string().refine((value) => {
  try {
    const decoded = decodeURIComponent(value);
    return (
      decoded.length > 0 &&
      !decoded.startsWith("/") &&
      !decoded.includes("\\") &&
      !decoded.includes(":") &&
      !decoded.split("/").includes("..")
    );
  } catch {
    return false;
  }
}, "Unsafe library file path");
export const bookSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1).max(500),
  author: z.string().max(500),
  kind: z.enum(kinds),
  format: z.enum(["epub", "pdf", "cbz"]),
  tags: z.array(z.string().trim().min(1).max(80)).max(100),
  collections: z.array(z.string().trim().min(1).max(100)).max(100),
  series: z.string().max(200),
  volume: z.number().nonnegative().nullable(),
  language: z.string().max(50),
  direction: z.enum(["ltr", "rtl"]),
  layout: z.enum(["pages", "scroll", "spread"]),
  notes: z
    .array(
      z.object({
        id: z.string(),
        locator: z.string(),
        text: z.string().max(20000),
        createdAt: z.string(),
      }),
    )
    .default([]),
  bookmarks: z
    .array(z.object({ id: z.string(), locator: z.string(), label: z.string() }))
    .default([]),
  favorite: z.boolean(),
  status: z.enum(["unread", "reading", "finished"]),
  progress: z.number().min(0).max(1),
  locator: z.string().max(2000),
  addedAt: z.string().datetime(),
  lastReadAt: z.string().datetime().nullable().optional(),
  updatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(),
  device: z.string(),
  deletedAt: z.string().datetime().nullable(),
  asset: z.object({
    path: relativePath,
    hash: z.string(),
    bytes: z.number().nonnegative(),
    cover: relativePath.nullable(),
    pages: z.array(relativePath),
    chapters: z.array(z.object({ path: relativePath, title: z.string() })),
  }),
});
export type Book = z.infer<typeof bookSchema>;
export const metadataPatchSchema = bookSchema
  .pick({
    title: true,
    author: true,
    kind: true,
    tags: true,
    collections: true,
    series: true,
    volume: true,
    language: true,
    direction: true,
  })
  .partial()
  .strict();
export type MetadataPatch = z.infer<typeof metadataPatchSchema>;
export const planSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  title: z.string().min(1).max(200),
  changes: z
    .array(
      z.object({
        bookId: z.string(),
        expectedRevision: z.number().int().nonnegative(),
        patch: metadataPatchSchema,
      }),
    )
    .min(1)
    .max(10000),
});
export type OrganizationPlan = z.infer<typeof planSchema>;
export const snapshotSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  books: z.array(bookSchema).max(100000),
  organization: z.array(organizationRecordSchema).max(10000).default([]),
});
export type LibrarySnapshot = z.infer<typeof snapshotSchema>;
export type Sort =
  | "added"
  | "title"
  | "author"
  | "series"
  | "progress"
  | "updated"
  | "last-read"
  | "list-order";
export type LibraryQuery = {
  bookId?: string;
  collectionId?: string;
  readingListId?: string;
  series?: string;
  unfiled?: boolean;
  rules?: Rules;
  format?: Book["format"];
  search?: string;
  kind?: StoryKind;
  status?: Book["status"];
  favorite?: boolean;
  collection?: string;
  tag?: string;
  trash?: boolean;
  sort?: Sort;
  offset?: number;
  limit?: number;
};
export type Stats = {
  total: number;
  reading: number;
  finished: number;
  favorites: number;
  kinds: Record<StoryKind, number>;
  collections: string[];
  tags: string[];
};
export interface SQL {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: (string | number | null)[]): Promise<void>;
  all<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
  transaction<T>(action: (sql: SQL) => Promise<T>): Promise<T>;
}
const schema = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS books (
 id TEXT PRIMARY KEY, data TEXT NOT NULL,
 title TEXT GENERATED ALWAYS AS (json_extract(data,'$.title')) STORED,
 author TEXT GENERATED ALWAYS AS (json_extract(data,'$.author')) STORED,
 kind TEXT GENERATED ALWAYS AS (json_extract(data,'$.kind')) STORED,
 status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) STORED,
 added TEXT GENERATED ALWAYS AS (json_extract(data,'$.addedAt')) STORED,
 deleted TEXT GENERATED ALWAYS AS (json_extract(data,'$.deletedAt')) STORED
);
CREATE INDEX IF NOT EXISTS books_kind_added ON books(deleted,kind,added DESC,id);
CREATE INDEX IF NOT EXISTS books_added ON books(deleted,added DESC,id);
CREATE INDEX IF NOT EXISTS books_title ON books(deleted,title COLLATE NOCASE,id);
CREATE INDEX IF NOT EXISTS books_status ON books(deleted,status,added DESC);
CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, title TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conflicts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`;
const discoverySchema = `
CREATE VIRTUAL TABLE IF NOT EXISTS discovery USING fts5(bookId UNINDEXED, kind UNINDEXED, locator UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS chapter_index (bookId TEXT, path TEXT, hash TEXT, PRIMARY KEY(bookId,path));
CREATE TABLE IF NOT EXISTS saved_views (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`;
const discoveryInsert = (row: "new" | "books") => `
 INSERT INTO discovery SELECT ${row}.id,'book','',${row}.title,${row}.author || ' ' || COALESCE(json_extract(${row}.data,'$.series'),'') || ' ' || COALESCE(json_extract(${row}.data,'$.tags'),'') || ' ' || COALESCE(json_extract(${row}.data,'$.collections'),'') ${row === "books" ? "FROM books" : ""};
 INSERT INTO discovery SELECT ${row}.id,'note',json_extract(value,'$.locator'),${row}.title,json_extract(value,'$.text') FROM ${row === "books" ? "books, " : ""}json_each(${row}.data,'$.notes');
 INSERT INTO discovery SELECT ${row}.id,'bookmark',json_extract(value,'$.locator'),${row}.title,json_extract(value,'$.label') FROM ${row === "books" ? "books, " : ""}json_each(${row}.data,'$.bookmarks');
 INSERT INTO discovery SELECT ${row}.id,'chapter',key || ':0',json_extract(value,'$.title'),'' FROM ${row === "books" ? "books, " : ""}json_each(${row}.data,'$.asset.chapters');
`;
export type SearchHit = {
  bookId: string;
  kind: "book" | "note" | "bookmark" | "chapter" | "passage";
  locator: string;
  title: string;
  excerpt: string;
  bookTitle: string;
};
export function compareVersions(
  a: Pick<Book, "revision" | "updatedAt" | "device">,
  b: Pick<Book, "revision" | "updatedAt" | "device">,
): number {
  return (
    a.revision - b.revision ||
    a.updatedAt.localeCompare(b.updatedAt) ||
    a.device.localeCompare(b.device)
  );
}
export function searchExpression(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word.replaceAll('"', '""')}"*`)
    .join(" AND ");
}
export class LibraryRepository {
  constructor(
    private readonly sql: SQL,
    private readonly device: string,
  ) {}
  async initialize() {
    await this.sql.exec(schema);
    await this.sql.transaction(async (sql) => {
      await sql.exec(discoverySchema);
      const migrated = await sql.all<{ value: string }>(
        "SELECT value FROM settings WHERE key='discovery-v1'",
      );
      if (!migrated.length) {
        await sql.exec(`CREATE TRIGGER discovery_insert AFTER INSERT ON books BEGIN ${discoveryInsert("new")} END;
          CREATE TRIGGER discovery_update AFTER UPDATE ON books WHEN json_extract(old.data,'$.title') IS NOT json_extract(new.data,'$.title') OR json_extract(old.data,'$.author') IS NOT json_extract(new.data,'$.author') OR json_extract(old.data,'$.tags') IS NOT json_extract(new.data,'$.tags') OR json_extract(old.data,'$.collections') IS NOT json_extract(new.data,'$.collections') OR json_extract(old.data,'$.series') IS NOT json_extract(new.data,'$.series') OR json_extract(old.data,'$.notes') IS NOT json_extract(new.data,'$.notes') OR json_extract(old.data,'$.bookmarks') IS NOT json_extract(new.data,'$.bookmarks') OR json_extract(old.data,'$.asset') IS NOT json_extract(new.data,'$.asset') BEGIN
          DELETE FROM discovery WHERE bookId=old.id AND kind != 'passage'; ${discoveryInsert("new")} END;`);
        // Backfill existing metadata in SQL without materializing the library in JavaScript.
        await sql.exec(discoveryInsert("books"));
        await sql.run(
          "INSERT INTO settings(key,value) VALUES('discovery-v1','1')",
        );
      }
      await sql.exec(`CREATE TABLE IF NOT EXISTS organization(id TEXT PRIMARY KEY,data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS organization_outbox(id TEXT PRIMARY KEY,data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS structure_history(id TEXT PRIMARY KEY,data TEXT NOT NULL,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reading_list_members(listId TEXT NOT NULL,bookId TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(listId,bookId));
        CREATE INDEX IF NOT EXISTS reading_list_position ON reading_list_members(listId,position);
        CREATE TABLE IF NOT EXISTS book_facets(bookId TEXT NOT NULL,field TEXT NOT NULL,value TEXT COLLATE NOCASE NOT NULL,PRIMARY KEY(bookId,field,value));
        CREATE INDEX IF NOT EXISTS facet_lookup ON book_facets(field,value,bookId);`);
      await sql.exec(
        `CREATE TABLE IF NOT EXISTS chapter_jobs(bookId TEXT,path TEXT,chapterIndex INTEGER,hash TEXT,state TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(bookId,path));CREATE INDEX IF NOT EXISTS chapter_jobs_pending ON chapter_jobs(state,bookId);`,
      );
      const queued = await sql.all(
        "SELECT 1 FROM settings WHERE key='chapter-jobs-v1'",
      );
      if (!queued.length) {
        const enqueue = (row: string) =>
          `INSERT OR REPLACE INTO chapter_jobs SELECT ${row}.id,json_extract(value,'$.path'),key,json_extract(${row}.data,'$.asset.hash'),'pending' FROM json_each(${row}.data,'$.asset.chapters');`;
        await sql.exec(`CREATE TRIGGER chapter_jobs_insert AFTER INSERT ON books BEGIN ${enqueue("new")} END;
        CREATE TRIGGER chapter_jobs_update AFTER UPDATE ON books WHEN json_extract(old.data,'$.asset') IS NOT json_extract(new.data,'$.asset') BEGIN DELETE FROM chapter_jobs WHERE bookId=old.id; DELETE FROM discovery WHERE bookId=old.id AND kind='passage'; DELETE FROM chapter_index WHERE bookId=old.id; ${enqueue("new")} END;
        INSERT INTO chapter_jobs SELECT books.id,json_extract(value,'$.path'),key,json_extract(data,'$.asset.hash'),CASE WHEN EXISTS(SELECT 1 FROM chapter_index ci WHERE ci.bookId=books.id AND ci.path=json_extract(value,'$.path') AND ci.hash=json_extract(data,'$.asset.hash')) THEN 'done' ELSE 'pending' END FROM books,json_each(data,'$.asset.chapters');`);
        await sql.run("INSERT INTO settings VALUES('chapter-jobs-v1','1')");
      }
      const upgraded = await sql.all(
        "SELECT 1 FROM settings WHERE key='organization-v1'",
      );
      if (!upgraded.length) {
        const facets = (row: string) =>
          `INSERT OR IGNORE INTO book_facets SELECT ${row}.id,'tag',value FROM json_each(${row}.data,'$.tags'); INSERT OR IGNORE INTO book_facets SELECT ${row}.id,'collection',value FROM json_each(${row}.data,'$.collections');`;
        await sql.exec(`CREATE TRIGGER facets_insert AFTER INSERT ON books BEGIN ${facets("new")} END;
          CREATE TRIGGER facets_update AFTER UPDATE ON books WHEN json_extract(old.data,'$.tags') IS NOT json_extract(new.data,'$.tags') OR json_extract(old.data,'$.collections') IS NOT json_extract(new.data,'$.collections') BEGIN DELETE FROM book_facets WHERE bookId=old.id; ${facets("new")} END;
          INSERT OR IGNORE INTO book_facets SELECT books.id,'tag',value FROM books,json_each(data,'$.tags');
          INSERT OR IGNORE INTO book_facets SELECT books.id,'collection',value FROM books,json_each(data,'$.collections');
          DROP TRIGGER IF EXISTS books_insert; DROP TRIGGER IF EXISTS books_update; DROP TABLE IF EXISTS search;`);
        const collections = await sql.all<{ value: string }>(
          "SELECT DISTINCT value FROM book_facets WHERE field='collection'",
        );
        for (const { value: name } of collections)
          await this.ensureCollection(sql, name);
        const views = await sql.all<{ data: string }>(
          "SELECT data FROM saved_views",
        );
        for (const row of views) {
          const view = savedViewSchema.parse(JSON.parse(row.data));
          await this.putOrganization(
            sql,
            {
              id: view.id,
              value: { kind: "view", view },
              revision: 1,
              device: this.device,
              updatedAt: new Date().toISOString(),
              deletedAt: null,
            },
            true,
          );
        }
        await sql.run("INSERT INTO settings VALUES('organization-v1','1')");
      }
    });
  }
  private async put(sql: SQL, book: Book, pending: boolean) {
    const data = JSON.stringify(bookSchema.parse(book));
    await sql.run(
      "INSERT INTO books(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      book.id,
      data,
    );
    for (const name of book.collections) await this.ensureCollection(sql, name);
    if (pending)
      await sql.run(
        "INSERT INTO outbox(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        book.id,
        data,
      );
  }
  async get(id: string, sql = this.sql): Promise<Book | undefined> {
    const rows = await sql.all<{ data: string }>(
      "SELECT data FROM books WHERE id=?",
      id,
    );
    return rows[0] ? bookSchema.parse(JSON.parse(rows[0].data)) : undefined;
  }
  async add(book: Book) {
    await this.sql.transaction(async (sql) => {
      const duplicate = await sql.all<{ id: string }>(
        "SELECT id FROM books WHERE json_extract(data,'$.asset.hash')=?",
        book.asset.hash,
      );
      if (duplicate.length)
        throw new Error(
          "This file is already in your library (including Trash).",
        );
      await this.put(sql, book, true);
    });
  }
  private filter(query: LibraryQuery = {}) {
    const params: (string | number | null)[] = [];
    const where = [
      query.trash ? "books.deleted IS NOT NULL" : "books.deleted IS NULL",
    ];
    if (query.rules) {
      const filter = compileRules(query.rules);
      where.push(filter.sql);
      params.push(...filter.params);
    }
    if (query.format) {
      where.push("json_extract(data,'$.format')=?");
      params.push(query.format);
    }
    if (query.kind) {
      where.push("books.kind=?");
      params.push(query.kind);
    }
    if (query.status) {
      where.push("books.status=?");
      params.push(query.status);
    }
    if (query.favorite) where.push("json_extract(data,'$.favorite')=1");
    if (query.collection) {
      where.push(
        "EXISTS(SELECT 1 FROM book_facets WHERE bookId=books.id AND field='collection' AND value=? COLLATE NOCASE)",
      );
      params.push(query.collection);
    }
    if (query.tag) {
      where.push(
        "EXISTS(SELECT 1 FROM book_facets WHERE bookId=books.id AND field='tag' AND value=? COLLATE NOCASE)",
      );
      params.push(query.tag);
    }
    if (query.search?.trim()) {
      where.push(
        "books.id IN(SELECT bookId FROM discovery WHERE discovery MATCH ? AND kind='book')",
      );
      params.push(searchExpression(query.search));
    }
    if (query.bookId) {
      where.push("books.id=?");
      params.push(query.bookId);
    }
    if (query.series) {
      where.push("json_extract(books.data,'$.series')=? COLLATE NOCASE");
      params.push(query.series);
    }
    if (query.collectionId) {
      where.push(
        "EXISTS(SELECT 1 FROM book_facets f JOIN organization o ON o.id=? WHERE f.bookId=books.id AND f.field='collection' AND f.value=json_extract(o.data,'$.value.name') COLLATE NOCASE AND json_extract(o.data,'$.deletedAt') IS NULL)",
      );
      params.push(query.collectionId);
    }
    if (query.readingListId) {
      where.push(
        "books.id IN(SELECT bookId FROM reading_list_members WHERE listId=?)",
      );
      params.push(query.readingListId);
    }
    if (query.unfiled)
      where.push(
        "NOT EXISTS(SELECT 1 FROM book_facets WHERE bookId=books.id AND field='collection')",
      );
    return { where: where.join(" AND "), params };
  }
  async list(query: LibraryQuery = {}): Promise<Book[]> {
    const { where, params } = this.filter(query);
    const sort: Record<Sort, string> = {
      added: "added DESC,id",
      "last-read": "COALESCE(json_extract(data,'$.lastReadAt'),added) DESC,id",
      "list-order": "id",
      updated: "json_extract(data,'$.updatedAt') DESC,id",
      title: "title COLLATE NOCASE,id",
      author: "author COLLATE NOCASE,title COLLATE NOCASE,id",
      series:
        "json_extract(data,'$.series') COLLATE NOCASE,json_extract(data,'$.volume'),title,id",
      progress: "json_extract(data,'$.progress') DESC,id",
    };
    if (query.sort === "list-order" && query.readingListId) {
      sort["list-order"] =
        "(SELECT position FROM reading_list_members WHERE listId=? AND bookId=books.id),id";
      params.push(query.readingListId);
    }
    params.push(
      Math.min(Math.max(query.limit ?? 60, 1), 10000),
      Math.max(query.offset ?? 0, 0),
    );
    const rows = await this.sql.all<{ data: string }>(
      `SELECT data FROM books WHERE ${where} ORDER BY ${sort[query.sort ?? "added"]} LIMIT ? OFFSET ?`,
      ...params,
    );
    return rows.map((row) => bookSchema.parse(JSON.parse(row.data)));
  }
  async update(
    id: string,
    patch: Partial<
      Pick<
        Book,
        | "lastReadAt"
        | "notes"
        | "bookmarks"
        | "title"
        | "author"
        | "kind"
        | "tags"
        | "collections"
        | "series"
        | "volume"
        | "language"
        | "direction"
        | "layout"
        | "favorite"
        | "status"
        | "progress"
        | "locator"
        | "deletedAt"
      >
    >,
  ) {
    return this.sql.transaction(async (sql) => {
      const before = await this.get(id, sql);
      if (!before) throw new Error("Book no longer exists.");
      const next = bookSchema.parse({
        ...before,
        ...patch,
        revision: before.revision + 1,
        updatedAt: new Date().toISOString(),
        device: this.device,
      });
      await this.put(sql, next, true);
      return next;
    });
  }
  async applyPlan(input: OrganizationPlan) {
    const plan = planSchema.parse(input);
    if (new Set(plan.changes.map((c) => c.bookId)).size !== plan.changes.length)
      throw new Error("A plan cannot change the same book twice.");
    await this.sql.transaction(async (sql) => {
      const history: { before: Book; appliedRevision: number }[] = [];
      for (const change of plan.changes) {
        const before = await this.get(change.bookId, sql);
        if (!before || before.revision !== change.expectedRevision)
          throw new Error(
            "The library changed since this plan was prepared. Export a fresh snapshot and regenerate it. Nothing was applied.",
          );
        const next = bookSchema.parse({
          ...before,
          ...change.patch,
          revision: before.revision + 1,
          updatedAt: new Date().toISOString(),
          device: this.device,
        });
        await this.put(sql, next, true);
        history.push({ before, appliedRevision: next.revision });
      }
      await sql.run(
        "INSERT INTO history VALUES(?,?,?,?)",
        plan.id,
        plan.title,
        JSON.stringify(history),
        new Date().toISOString(),
      );
    });
  }
  async undoLatest() {
    await this.sql.transaction(async (sql) => {
      const rows = await sql.all<{ id: string; data: string }>(
        "SELECT id,data FROM history ORDER BY created DESC,rowid DESC LIMIT 1",
      );
      const row = rows[0];
      if (!row) throw new Error("No organization changes to undo.");
      const entries = z
        .array(z.object({ before: bookSchema, appliedRevision: z.number() }))
        .parse(JSON.parse(row.data));
      for (const entry of entries) {
        const current = await this.get(entry.before.id, sql);
        if (!current || current.revision !== entry.appliedRevision)
          throw new Error(
            "Some books changed after this batch. Undo was stopped to preserve those edits.",
          );
        await this.put(
          sql,
          {
            ...entry.before,
            revision: current.revision + 1,
            device: this.device,
            updatedAt: new Date().toISOString(),
          },
          true,
        );
      }
      await sql.run("DELETE FROM history WHERE id=?", row.id);
    });
  }
  async mergeRemote(records: Book[]) {
    await this.sql.transaction(async (sql) => {
      for (const input of records) {
        const remote = bookSchema.parse(input);
        const local = await this.get(remote.id, sql);
        if (
          local &&
          local.device !== remote.device &&
          local.revision === remote.revision &&
          JSON.stringify(local) !== JSON.stringify(remote)
        ) {
          await sql.run(
            "INSERT OR IGNORE INTO conflicts VALUES(?,?)",
            `${remote.id}:${remote.revision}:${remote.device}`,
            JSON.stringify({ local, remote }),
          );
        }
        if (!local || compareVersions(remote, local) > 0)
          await this.put(sql, remote, false);
      }
    });
  }
  async pending() {
    return (
      await this.sql.all<{ data: string }>("SELECT data FROM outbox")
    ).map((row) => bookSchema.parse(JSON.parse(row.data)));
  }
  async acknowledge(records: Book[]) {
    await this.sql.transaction(async (sql) => {
      for (const record of records)
        await sql.run(
          "DELETE FROM outbox WHERE id=? AND data=?",
          record.id,
          JSON.stringify(record),
        );
    });
  }
  private async ensureCollection(sql: SQL, name: string) {
    let id = collectionId(name);
    // A renamed or deleted collection keeps its identity. Reusing its old name
    // creates a distinct collection instead of overwriting that history.
    let suffix = 0;
    while ((await sql.all("SELECT 1 FROM organization WHERE id=?", id)).length)
      id = `${collectionId(name)}:${++suffix}`;
    const existing = await sql.all(
      "SELECT 1 FROM organization WHERE json_extract(data,'$.value.kind')='collection' AND json_extract(data,'$.value.name')=? COLLATE NOCASE AND json_extract(data,'$.deletedAt') IS NULL",
      name,
    );
    if (!existing.length)
      await sql.run(
        "INSERT OR IGNORE INTO organization VALUES(?,?)",
        id,
        JSON.stringify({
          id,
          value: { kind: "collection", name },
          revision: 0,
          device: "legacy",
          updatedAt: "1970-01-01T00:00:00.000Z",
          deletedAt: null,
        }),
      );
  }
  private async putOrganization(
    sql: SQL,
    input: OrganizationRecord,
    pending: boolean,
  ) {
    const record = organizationRecordSchema.parse(input),
      data = JSON.stringify(record);
    if (record.value.kind === "collection" && !record.deletedAt)
      await sql.run(
        "DELETE FROM organization WHERE id!=? AND json_extract(data,'$.value.kind')='collection' AND json_extract(data,'$.revision')=0 AND json_extract(data,'$.value.name')=? COLLATE NOCASE",
        record.id,
        record.value.name,
      );
    await sql.run(
      "INSERT INTO organization VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      record.id,
      data,
    );
    await sql.run("DELETE FROM reading_list_members WHERE listId=?", record.id);
    if (record.value.kind === "reading-list" && !record.deletedAt) {
      for (const [position, bookId] of record.value.bookIds.entries())
        await sql.run(
          "INSERT INTO reading_list_members VALUES(?,?,?)",
          record.id,
          bookId,
          position,
        );
    }
    if (pending)
      await sql.run(
        "INSERT INTO organization_outbox VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        record.id,
        data,
      );
  }
  async organization(includeDeleted = false): Promise<OrganizationRecord[]> {
    return (
      await this.sql.all<{ data: string }>(
        `SELECT data FROM organization ${includeDeleted ? "" : "WHERE json_extract(data,'$.deletedAt') IS NULL"} ORDER BY COALESCE(json_extract(data,'$.value.name'),json_extract(data,'$.value.view.name')) COLLATE NOCASE`,
      )
    ).map((row) => organizationRecordSchema.parse(JSON.parse(row.data)));
  }
  async saveOrganization(
    id: string,
    value: OrganizationValue,
    expectedRevision: number | null,
  ) {
    await this.applyStructurePlan({
      version: 2,
      id: `edit-${id}-${expectedRevision ?? "new"}-${Date.now()}`,
      title: "Edit organization",
      changes: [{ id, value, expectedRevision, deleted: false }],
    });
  }
  async applyStructurePlan(input: StructurePlan) {
    const plan = structurePlanSchema.parse(input);
    if (new Set(plan.changes.map((c) => c.id)).size !== plan.changes.length)
      throw new Error("Duplicate organization record in plan.");
    await this.sql.transaction(async (sql) => {
      const history: {
        before: OrganizationRecord | null;
        after: OrganizationRecord;
      }[] = [];
      for (const change of plan.changes) {
        const rows = await sql.all<{ data: string }>(
          "SELECT data FROM organization WHERE id=?",
          change.id,
        );
        const before = rows[0]
          ? organizationRecordSchema.parse(JSON.parse(rows[0].data))
          : null;
        if ((before?.revision ?? null) !== change.expectedRevision)
          throw new Error(
            "This organization changed. Refresh and try again; nothing was applied.",
          );
        if (before && before.value.kind !== change.value.kind)
          throw new Error("An organization record cannot change its type.");
        if (change.value.kind === "reading-list") {
          const missing = await sql.all<{ id: string }>(
            "SELECT value AS id FROM json_each(?) WHERE value NOT IN (SELECT id FROM books) LIMIT 1",
            JSON.stringify(change.value.bookIds),
          );
          if (missing[0])
            throw new Error(`Unknown book in reading list: ${missing[0].id}`);
        }
        if (
          change.value.kind === "collection" &&
          before?.value.kind === "collection" &&
          (change.deleted || before.value.name !== change.value.name)
        )
          throw new Error(
            "Rename or remove collections through the collection membership tool.",
          );
        if (change.value.kind === "collection" && !change.deleted) {
          const duplicate = await sql.all(
            "SELECT 1 FROM organization WHERE id!=? AND json_extract(data,'$.deletedAt') IS NULL AND json_extract(data,'$.value.kind')='collection' AND json_extract(data,'$.value.name')=? COLLATE NOCASE",
            change.id,
            change.value.name,
          );
          if (duplicate.length)
            throw new Error(
              "A collection with that name already exists. Use its existing ID.",
            );
        }
        const after: OrganizationRecord = {
          id: change.id,
          value: change.value,
          revision: (before?.revision ?? 0) + 1,
          device: this.device,
          updatedAt: new Date().toISOString(),
          deletedAt: change.deleted ? new Date().toISOString() : null,
        };
        await this.putOrganization(sql, after, true);
        history.push({ before, after });
      }
      await sql.run(
        "INSERT INTO structure_history VALUES(?,?,?)",
        plan.id,
        JSON.stringify(history),
        new Date().toISOString(),
      );
    });
  }
  async renameFacet(field: "tag" | "collection", from: string, to: string) {
    const nextName = to.trim();
    if (from === nextName) return;
    if (nextName.length > (field === "tag" ? 80 : 100))
      throw new Error("The group name is too long.");
    await this.sql.transaction(async (sql) => {
      const history: (
        | { before: OrganizationRecord | null; after: OrganizationRecord }
        | { before: Book; after: Book }
      )[] = [];
      const structures = (
        await sql.all<{ data: string }>(
          "SELECT data FROM organization WHERE json_extract(data,'$.deletedAt') IS NULL",
        )
      ).map((r) => organizationRecordSchema.parse(JSON.parse(r.data)));
      const destination = structures.find(
        (r) =>
          r.value.kind === "collection" &&
          r.value.name.toLowerCase() === nextName.toLowerCase(),
      );
      const source = structures.find(
        (r) =>
          r.value.kind === "collection" &&
          r.value.name.toLowerCase() === from.toLowerCase(),
      );
      const rewrite = (rules: Rules): Rules => ({
        ...rules,
        conditions: rules.conditions.map((r) =>
          "field" in r
            ? r.field === field && r.value.toLowerCase() === from.toLowerCase()
              ? { ...r, value: nextName }
              : r
            : rewrite(r),
        ),
      });
      for (const before of structures) {
        let value = before.value,
          deletedAt = before.deletedAt;
        if (
          field === "collection" &&
          value.kind === "collection" &&
          value.name.toLowerCase() === from.toLowerCase()
        ) {
          if (!nextName || (destination && destination.id !== before.id))
            deletedAt = new Date().toISOString();
          else value = { kind: "collection", name: nextName };
        } else if (nextName && value.kind === "view")
          value = {
            kind: "view",
            view: {
              ...value.view,
              rules: rewrite(value.view.rules),
              ...(field === "collection" &&
              source &&
              destination &&
              value.view.scope?.collectionId === source.id
                ? {
                    scope: {
                      ...value.view.scope,
                      collectionId: destination.id,
                    },
                  }
                : {}),
            },
          };
        if (
          JSON.stringify(value) !== JSON.stringify(before.value) ||
          deletedAt !== before.deletedAt
        ) {
          const after = {
            ...before,
            value,
            deletedAt,
            revision: before.revision + 1,
            device: this.device,
            updatedAt: new Date().toISOString(),
          };
          await this.putOrganization(sql, after, true);
          history.push({ before, after });
        }
      }
      const rows = await sql.all<{ data: string }>(
        "SELECT data FROM books WHERE id IN (SELECT bookId FROM book_facets WHERE field=? AND value=? COLLATE NOCASE)",
        field,
        from,
      );
      for (const row of rows) {
        const before = bookSchema.parse(JSON.parse(row.data));
        const key = field === "tag" ? "tags" : "collections";
        const values = before[key].flatMap((v) =>
          v.toLowerCase() === from.toLowerCase()
            ? nextName
              ? [nextName]
              : []
            : [v],
        );
        const after = bookSchema.parse({
          ...before,
          [key]: [...new Map(values.map((v) => [v.toLowerCase(), v])).values()],
          revision: before.revision + 1,
          device: this.device,
          updatedAt: new Date().toISOString(),
        });
        await this.put(sql, after, true);
        history.push({ before, after });
      }
      if (history.length)
        await sql.run(
          "INSERT INTO structure_history VALUES(?,?,?)",
          `facet-${field}-${Date.now()}-${history.length}`,
          JSON.stringify(history),
          new Date().toISOString(),
        );
    });
  }
  async undoStructure() {
    await this.sql.transaction(async (sql) => {
      const row = (
        await sql.all<{ id: string; data: string }>(
          "SELECT id,data FROM structure_history ORDER BY created DESC,rowid DESC LIMIT 1",
        )
      )[0];
      if (!row) throw new Error("No view or reading-list changes to undo.");
      const entries = z
        .array(
          z.union([
            z.object({
              before: organizationRecordSchema.nullable(),
              after: organizationRecordSchema,
            }),
            z.object({ before: bookSchema, after: bookSchema }),
          ]),
        )
        .parse(JSON.parse(row.data));
      // Verify every record before restoring any; the transaction also protects against races.
      for (const entry of entries) {
        const table = "value" in entry.after ? "organization" : "books";
        const current = (
          await sql.all<{ data: string }>(
            `SELECT data FROM ${table} WHERE id=?`,
            entry.after.id,
          )
        )[0];
        if (
          !current ||
          JSON.stringify(JSON.parse(current.data)) !==
            JSON.stringify(entry.after)
        )
          throw new Error(
            "These items changed after the edit. Undo stopped to preserve newer changes.",
          );
      }
      for (const entry of entries) {
        if ("value" in entry.after) {
          const before =
            entry.before && "value" in entry.before ? entry.before : null;
          await this.putOrganization(
            sql,
            {
              ...(before ?? entry.after),
              revision: entry.after.revision + 1,
              device: this.device,
              updatedAt: new Date().toISOString(),
              deletedAt:
                before?.deletedAt ?? (before ? null : new Date().toISOString()),
            },
            true,
          );
        } else if (entry.before && !("value" in entry.before)) {
          await this.put(
            sql,
            {
              ...entry.before,
              revision: entry.after.revision + 1,
              device: this.device,
              updatedAt: new Date().toISOString(),
            },
            true,
          );
        }
      }
      await sql.run("DELETE FROM structure_history WHERE id=?", row.id);
    });
  }
  async pendingOrganization() {
    return (
      await this.sql.all<{ data: string }>(
        "SELECT data FROM organization_outbox",
      )
    ).map((row) => organizationRecordSchema.parse(JSON.parse(row.data)));
  }
  async acknowledgeOrganization(records: OrganizationRecord[]) {
    await this.sql.transaction(async (sql) => {
      for (const record of records)
        await sql.run(
          "DELETE FROM organization_outbox WHERE id=? AND data=?",
          record.id,
          JSON.stringify(record),
        );
    });
  }
  async mergeOrganization(records: OrganizationRecord[]) {
    await this.sql.transaction(async (sql) => {
      for (const input of records) {
        const remote = organizationRecordSchema.parse(input);
        const row = (
          await sql.all<{ data: string }>(
            "SELECT data FROM organization WHERE id=?",
            remote.id,
          )
        )[0];
        const local = row
          ? organizationRecordSchema.parse(JSON.parse(row.data))
          : null;
        if (
          local &&
          local.device !== remote.device &&
          local.revision === remote.revision &&
          JSON.stringify(local) !== JSON.stringify(remote)
        )
          await sql.run(
            "INSERT OR IGNORE INTO conflicts VALUES(?,?)",
            `organization:${remote.id}:${remote.revision}:${remote.device}`,
            JSON.stringify({ local, remote }),
          );
        if (!local || compareVersions(remote, local) > 0)
          await this.putOrganization(sql, remote, false);
      }
    });
  }
  async savedViews(): Promise<SavedView[]> {
    return (await this.organization()).flatMap((record) =>
      record.value.kind === "view" ? [record.value.view] : [],
    );
  }
  async saveView(
    view: Omit<SavedView, "pinned"> & { pinned?: boolean },
    expectedRevision?: number | null,
  ) {
    const before = (await this.organization(true)).find(
      (r) => r.id === view.id,
    );
    await this.saveOrganization(
      view.id,
      { kind: "view", view: savedViewSchema.parse(view) },
      expectedRevision === undefined
        ? (before?.revision ?? null)
        : expectedRevision,
    );
  }
  async removeView(id: string) {
    const record = (await this.organization()).find((r) => r.id === id);
    if (record)
      await this.applyStructurePlan({
        version: 2,
        id: `remove-${id}-${Date.now()}`,
        title: "Remove view",
        changes: [
          {
            id,
            value: record.value,
            expectedRevision: record.revision,
            deleted: true,
          },
        ],
      });
  }
  async series() {
    return this.sql.all<{ name: string; count: number; finished: number }>(
      "SELECT json_extract(data,'$.series') AS name,count(*) AS count,sum(status='finished') AS finished FROM books WHERE deleted IS NULL AND json_extract(data,'$.series')!='' GROUP BY name COLLATE NOCASE ORDER BY name COLLATE NOCASE",
    );
  }
  async facets(query: LibraryQuery = {}) {
    const { where, params } = this.filter(query);
    return this.sql.all<{ field: string; value: string; count: number }>(
      `SELECT f.field,f.value,count(*) AS count FROM book_facets f JOIN books ON books.id=f.bookId WHERE ${where} GROUP BY f.field,f.value ORDER BY f.value COLLATE NOCASE`,
      ...params,
    );
  }
  async discover(
    term: string,
    kind?: SearchHit["kind"],
    offset = 0,
    scope: LibraryQuery = {},
  ): Promise<SearchHit[]> {
    if (!term.trim()) return [];
    const { where, params } = this.filter({
      ...scope,
      search: undefined,
      trash: false,
    });
    return this.sql.all<SearchHit>(
      `SELECT discovery.bookId,discovery.kind,discovery.locator,discovery.title,CASE WHEN discovery.kind='book' THEN books.author ELSE snippet(discovery,4,'','',' … ',24) END AS excerpt,books.title AS bookTitle
      FROM discovery JOIN books ON books.id=discovery.bookId
      WHERE discovery MATCH ? AND ${where} ${kind === "passage" ? "AND discovery.kind IN ('passage','chapter')" : kind ? "AND discovery.kind=?" : ""}
      ORDER BY CASE discovery.kind WHEN 'book' THEN 0 WHEN 'note' THEN 1 WHEN 'bookmark' THEN 2 ELSE 3 END, rank, discovery.rowid LIMIT 40 OFFSET ?`,
      searchExpression(term.slice(0, 500)),
      ...params,
      ...(kind && kind !== "passage" ? [kind] : []),
      Math.max(0, offset),
    );
  }
  async pendingChapters() {
    const rows = await this.sql.all<{
      data: string;
      chapterIndex: number;
      path: string;
    }>(
      "SELECT books.data,j.chapterIndex,j.path FROM chapter_jobs j JOIN books ON books.id=j.bookId WHERE j.state='pending' AND books.deleted IS NULL ORDER BY j.bookId,j.chapterIndex LIMIT 8",
    );
    return rows.map((r) => ({
      book: bookSchema.parse(JSON.parse(r.data)),
      index: r.chapterIndex,
      path: r.path,
    }));
  }
  async skipChapter(bookId: string, path: string) {
    await this.sql.run(
      "UPDATE chapter_jobs SET state='unavailable' WHERE bookId=? AND path=?",
      bookId,
      path,
    );
  }
  async retryChapters() {
    await this.sql.run(
      "UPDATE chapter_jobs SET state='pending' WHERE state='unavailable'",
    );
  }
  async unavailableChapters() {
    return (
      (
        await this.sql.all<{ count: number }>(
          "SELECT count(*) AS count FROM chapter_jobs j JOIN books ON books.id=j.bookId WHERE j.state='unavailable' AND books.deleted IS NULL",
        )
      )[0]?.count ?? 0
    );
  }
  async chapterIndexed(book: Book, path: string) {
    return (
      (
        await this.sql.all(
          "SELECT 1 FROM chapter_index WHERE bookId=? AND path=? AND hash=?",
          book.id,
          path,
          book.asset.hash,
        )
      ).length > 0
    );
  }
  async indexChapter(book: Book, index: number, body: string) {
    const chapter = book.asset.chapters[index];
    if (!chapter) return;
    await this.sql.transaction(async (sql) => {
      const current = await this.get(book.id, sql);
      if (
        !current ||
        current.deletedAt ||
        current.asset.hash !== book.asset.hash ||
        current.asset.chapters[index]?.path !== chapter.path
      )
        return;
      await sql.run(
        "DELETE FROM discovery WHERE bookId=? AND kind='passage' AND locator=?",
        book.id,
        `${index}:0`,
      );
      await sql.run(
        "INSERT INTO discovery VALUES(?,?,?,?,?)",
        book.id,
        "passage",
        `${index}:0`,
        chapter.title,
        body,
      );
      await sql.run(
        "UPDATE chapter_jobs SET state='done' WHERE bookId=? AND path=? AND hash=?",
        book.id,
        chapter.path,
        book.asset.hash,
      );
      await sql.run(
        "INSERT INTO chapter_index VALUES(?,?,?) ON CONFLICT(bookId,path) DO UPDATE SET hash=excluded.hash",
        book.id,
        chapter.path,
        book.asset.hash,
      );
    });
  }
  async readingNotes(): Promise<Book[]> {
    const rows = await this.sql.all<{ data: string }>(
      "SELECT data FROM books WHERE deleted IS NULL AND (json_array_length(data,'$.notes')>0 OR json_array_length(data,'$.bookmarks')>0) ORDER BY added DESC",
    );
    return rows.map((row) => bookSchema.parse(JSON.parse(row.data)));
  }
  async setting(key: string) {
    return (
      await this.sql.all<{ value: string }>(
        "SELECT value FROM settings WHERE key=?",
        key,
      )
    )[0]?.value;
  }
  async setSetting(key: string, value: string) {
    await this.sql.run(
      "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      value,
    );
  }
  async snapshot(): Promise<LibrarySnapshot> {
    const rows = await this.sql.all<{ data: string }>("SELECT data FROM books");
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      books: rows.map((row) => bookSchema.parse(JSON.parse(row.data))),
      organization: await this.organization(true),
    };
  }
  async stats(): Promise<Stats> {
    const groups = await this.sql.all<{
      kind: StoryKind;
      count: number;
      reading: number;
      finished: number;
      favorites: number;
    }>(
      "SELECT kind,count(*) as count,sum(status='reading') as reading,sum(status='finished') as finished,sum(json_extract(data,'$.favorite')) as favorites FROM books WHERE deleted IS NULL GROUP BY kind",
    );
    const stats: Stats = {
      total: 0,
      reading: 0,
      finished: 0,
      favorites: 0,
      kinds: { novel: 0, "light-novel": 0, manga: 0, comic: 0, document: 0 },
      collections: [],
      tags: [],
    };
    for (const row of groups) {
      stats.total += row.count;
      stats.reading += row.reading;
      stats.finished += row.finished;
      stats.favorites += row.favorites;
      stats.kinds[row.kind] = row.count;
    }
    for (const field of ["collections", "tags"] as const)
      stats[field] = (
        await this.sql.all<{ value: string }>(
          `SELECT DISTINCT value FROM books,json_each(data,'$.${field}') WHERE deleted IS NULL ORDER BY value COLLATE NOCASE`,
        )
      ).map((row) => row.value);
    return stats;
  }
}
