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
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, kind, offset, limit }) => {
    const snapshot = await load();
    const q = query.toLocaleLowerCase();
    const matches = snapshot.books.filter(
      (b) =>
        !b.deletedAt &&
        (!kind || b.kind === kind) &&
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
await server.connect(new StdioServerTransport());
