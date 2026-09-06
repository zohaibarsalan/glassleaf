import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  snapshotSchema,
  planSchema,
  metadataPatchSchema,
  kinds,
  rulesSchema,
  matchesRules,
  organizationValueSchema,
  structurePlanSchema,
} from "@glassleaf/library";
const snapshotPath = process.argv[2];
if (!snapshotPath)
  throw new Error(
    "Usage: pnpm mcp /absolute/path/glassleaf-library.json [output-directory]",
  );
const output = resolve(process.argv[3] ?? ".");
const load = async () =>
  snapshotSchema.parse(
    JSON.parse(await readFile(resolve(snapshotPath), "utf8")),
  );
const server = new McpServer({ name: "glassleaf-library", version: "0.1.0" });
server.registerTool(
  "search_library",
  {
    description:
      "Search an explicitly exported Glassleaf metadata snapshot. Returns revision IDs for organization plans; never reads book files.",
    inputSchema: {
      query: z.string().default(""),
      kind: z.enum(kinds).optional(),
      rules: rulesSchema.optional(),
      viewId: z.string().optional(),
      readingListId: z.string().optional(),
      collectionId: z.string().optional(),
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: { readOnlyHint: true },
  },
  async ({
    query,
    kind,
    rules,
    viewId,
    readingListId,
    collectionId,
    offset,
    limit,
  }) => {
    const snapshot = await load();
    const q = query.toLocaleLowerCase();
    const records = new Map(
      snapshot.organization.filter((r) => !r.deletedAt).map((r) => [r.id, r]),
    );
    const record = viewId ? records.get(viewId) : undefined;
    if (viewId && record?.value.kind !== "view")
      throw new Error("Unknown smart view.");
    const view = record?.value.kind === "view" ? record.value.view : undefined;
    const listId = readingListId ?? view?.scope?.readingListId;
    const groupId = collectionId ?? view?.scope?.collectionId;
    const list = listId ? records.get(listId) : undefined;
    const collection = groupId ? records.get(groupId) : undefined;
    if (listId && list?.value.kind !== "reading-list")
      throw new Error("Unknown reading list.");
    if (groupId && collection?.value.kind !== "collection")
      throw new Error("Unknown collection.");
    const members =
      list?.value.kind === "reading-list"
        ? new Set(list.value.bookIds)
        : undefined;
    const collectionName =
      collection?.value.kind === "collection"
        ? collection.value.name.toLowerCase()
        : undefined;
    const matches = snapshot.books.filter(
      (b) =>
        !b.deletedAt &&
        (!kind || b.kind === kind) &&
        (!rules || matchesRules(b, rules)) &&
        (!view || matchesRules(b, view.rules)) &&
        (!members || members.has(b.id)) &&
        (!collectionName ||
          b.collections.some((c) => c.toLowerCase() === collectionName)) &&
        (!view?.scope?.series || b.series === view.scope.series) &&
        (!view?.scope?.unfiled || !b.collections.length) &&
        [b.title, b.author, b.series, ...b.tags, ...b.collections]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q),
    );
    const books = matches
      .slice(offset, offset + limit)
      .map(
        ({
          id,
          title,
          author,
          kind,
          format,
          tags,
          collections,
          series,
          volume,
          revision,
          language,
          direction,
        }) => ({
          id,
          title,
          author,
          kind,
          format,
          tags,
          collections,
          series,
          volume,
          revision,
          language,
          direction,
        }),
      );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ total: matches.length, books }),
        },
      ],
    };
  },
);
server.registerTool(
  "prepare_organization",
  {
    description:
      "Create a reviewable organization plan for the Glassleaf app. Does not modify the snapshot or original books. Import the resulting JSON into Settings to preview and apply atomically, with undo.",
    inputSchema: {
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
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ title, changes }) => {
    const snapshot = await load();
    const books = new Map(snapshot.books.map((book) => [book.id, book]));
    const ids = new Set<string>();
    for (const change of changes) {
      if (ids.has(change.bookId)) throw new Error("Duplicate book in plan.");
      ids.add(change.bookId);
      if (books.get(change.bookId)?.revision !== change.expectedRevision)
        throw new Error(`Missing or stale book: ${change.bookId}`);
    }
    const plan = planSchema.parse({
      version: 1,
      id: randomUUID(),
      title,
      changes,
    });
    const path = resolve(output, `glassleaf-plan-${plan.id}.json`);
    await writeFile(path, JSON.stringify(plan, null, 2), { flag: "wx" });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            path,
            changes: changes.length,
            next: "Import this plan in Glassleaf Settings. No library changes have been applied.",
          }),
        },
      ],
    };
  },
);
server.registerTool(
  "list_organization",
  {
    description:
      "Inspect exported collections, ordered reading lists and smart views with revision IDs. Includes tombstones to support safe editing.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => ({
    content: [
      { type: "text", text: JSON.stringify((await load()).organization) },
    ],
  }),
);
server.registerTool(
  "prepare_structure",
  {
    description:
      "Prepare a version 2 plan for smart views, new collections and ordered reading lists. Does not apply changes. Import into Glassleaf Settings for revision-checked review and undo. Collection renames/removals use the app membership tool.",
    inputSchema: {
      title: z.string().min(1).max(200),
      changes: z
        .array(
          z.object({
            id: z.string().min(1).max(1000),
            expectedRevision: z.number().int().nonnegative().nullable(),
            value: organizationValueSchema,
            deleted: z.boolean().default(false),
          }),
        )
        .min(1)
        .max(100),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ title, changes }) => {
    const snapshot = await load();
    const records = new Map(snapshot.organization.map((r) => [r.id, r]));
    const books = new Set(snapshot.books.map((b) => b.id));
    const ids = new Set<string>();
    for (const change of changes) {
      if (ids.has(change.id)) throw new Error("Duplicate structure in plan.");
      ids.add(change.id);
      if (
        (records.get(change.id)?.revision ?? null) !== change.expectedRevision
      )
        throw new Error("Missing or stale organization revision.");
      if (
        change.value.kind === "reading-list" &&
        change.value.bookIds.some((id) => !books.has(id))
      )
        throw new Error("Unknown book in reading list.");
    }
    const plan = structurePlanSchema.parse({
      version: 2,
      id: randomUUID(),
      title,
      changes,
    });
    const path = resolve(output, `glassleaf-plan-${plan.id}.json`);
    await writeFile(path, JSON.stringify(plan, null, 2), { flag: "wx" });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            path,
            changes: changes.length,
            next: "Import in Glassleaf Settings to review. Nothing has been applied.",
          }),
        },
      ],
    };
  },
);
await server.connect(new StdioServerTransport());
