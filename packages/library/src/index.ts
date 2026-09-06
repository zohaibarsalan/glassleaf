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
});
export type LibrarySnapshot = z.infer<typeof snapshotSchema>;
export type Sort =
  "added" | "title" | "author" | "series" | "progress" | "updated";
export type LibraryQuery = {
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
CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED, title, author, series, tags, tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS books_insert AFTER INSERT ON books BEGIN
 INSERT INTO search VALUES(new.id,new.title,new.author,json_extract(new.data,'$.series'),json_extract(new.data,'$.tags'));
END;
CREATE TRIGGER IF NOT EXISTS books_update AFTER UPDATE ON books BEGIN
 DELETE FROM search WHERE id=old.id;
 INSERT INTO search VALUES(new.id,new.title,new.author,json_extract(new.data,'$.series'),json_extract(new.data,'$.tags'));
END;
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
export function compareVersions(a: Book, b: Book): number {
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
    });
  }
  private async put(sql: SQL, book: Book, pending: boolean) {
    const data = JSON.stringify(bookSchema.parse(book));
    await sql.run(
      "INSERT INTO books(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      book.id,
      data,
    );
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
  async list(query: LibraryQuery = {}): Promise<Book[]> {
    const params: (string | number | null)[] = [];
    const where = [query.trash ? "deleted IS NOT NULL" : "deleted IS NULL"];
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
      where.push("kind=?");
      params.push(query.kind);
    }
    if (query.status) {
      where.push("status=?");
      params.push(query.status);
    }
    if (query.favorite) where.push("json_extract(data,'$.favorite')=1");
    if (query.collection) {
      where.push(
        "EXISTS(SELECT 1 FROM json_each(data,'$.collections') WHERE value=?)",
      );
      params.push(query.collection);
    }
    if (query.tag) {
      where.push(
        "EXISTS(SELECT 1 FROM json_each(data,'$.tags') WHERE value=?)",
      );
      params.push(query.tag);
    }
    if (query.search?.trim()) {
      where.push("id IN(SELECT id FROM search WHERE search MATCH ?)");
      params.push(searchExpression(query.search));
    }
    const sort: Record<Sort, string> = {
      added: "added DESC,id",
      updated: "json_extract(data,'$.updatedAt') DESC,id",
      title: "title COLLATE NOCASE,id",
      author: "author COLLATE NOCASE,title COLLATE NOCASE,id",
      series:
        "json_extract(data,'$.series') COLLATE NOCASE,json_extract(data,'$.volume'),title,id",
      progress: "json_extract(data,'$.progress') DESC,id",
    };
    params.push(
      Math.min(Math.max(query.limit ?? 60, 1), 10000),
      Math.max(query.offset ?? 0, 0),
    );
    const rows = await this.sql.all<{ data: string }>(
      `SELECT data FROM books WHERE ${where.join(" AND ")} ORDER BY ${sort[query.sort ?? "added"]} LIMIT ? OFFSET ?`,
      ...params,
    );
    return rows.map((row) => bookSchema.parse(JSON.parse(row.data)));
  }
  async update(
    id: string,
    patch: Partial<
      Pick<
        Book,
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
        "SELECT id,data FROM history ORDER BY created DESC LIMIT 1",
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
  async savedViews(): Promise<SavedView[]> {
    const rows = await this.sql.all<{ data: string }>(
      "SELECT data FROM saved_views ORDER BY json_extract(data,'$.name') COLLATE NOCASE",
    );
    return rows.map((row) => savedViewSchema.parse(JSON.parse(row.data)));
  }
  async saveView(view: SavedView) {
    const valid = savedViewSchema.parse(view);
    await this.sql.run(
      "INSERT INTO saved_views VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      valid.id,
      JSON.stringify(valid),
    );
  }
  async removeView(id: string) {
    await this.sql.run("DELETE FROM saved_views WHERE id=?", id);
  }
  async discover(
    term: string,
    kind?: SearchHit["kind"],
    offset = 0,
  ): Promise<SearchHit[]> {
    if (!term.trim()) return [];
    return this.sql.all<SearchHit>(
      `SELECT discovery.bookId,discovery.kind,discovery.locator,discovery.title,snippet(discovery,4,'','',' … ',24) AS excerpt,books.title AS bookTitle
      FROM discovery JOIN books ON books.id=discovery.bookId
      WHERE discovery MATCH ? AND books.deleted IS NULL ${kind === "passage" ? "AND discovery.kind IN ('passage','chapter')" : kind ? "AND discovery.kind=?" : ""}
      ORDER BY rank, discovery.rowid LIMIT 40 OFFSET ?`,
      searchExpression(term.slice(0, 500)),
      ...(kind && kind !== "passage" ? [kind] : []),
      Math.max(0, offset),
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
