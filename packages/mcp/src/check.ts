import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import {
  bookSchema,
  planSchema,
  structurePlanSchema,
} from "@glassleaf/library";
const folder = await mkdtemp(join(tmpdir(), "glassleaf-mcp-check-"));
const path = join(folder, "snapshot.json");
const book = bookSchema.parse({
  id: "fixture",
  title: "A Shared World",
  author: "Glassleaf",
  kind: "manga",
  format: "cbz",
  tags: [],
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
  device: "fixture",
  deletedAt: null,
  asset: {
    path: "fixture/original.cbz",
    hash: "fixture",
    bytes: 1,
    cover: null,
    pages: [],
    chapters: [],
  },
});
const original = JSON.stringify({
  version: 1,
  exportedAt: new Date().toISOString(),
  books: [book],
  organization: [
    {
      id: "fixture-list",
      value: { kind: "reading-list", name: "Empty", bookIds: [] },
      revision: 1,
      device: "fixture",
      updatedAt: book.updatedAt,
      deletedAt: null,
    },
    {
      id: "fixture-view",
      value: {
        kind: "view",
        view: {
          id: "fixture-view",
          name: "Scoped",
          rules: { match: "all", conditions: [] },
          sort: "title",
          scope: { readingListId: "fixture-list" },
        },
      },
      revision: 1,
      device: "fixture",
      updatedAt: book.updatedAt,
      deletedAt: null,
    },
  ],
});
await writeFile(path, original);
const client = new Client({ name: "glassleaf-check", version: "1" });
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", resolve("src/index.ts"), path, folder],
    }),
  );
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
    "list_organization",
    "prepare_organization",
    "prepare_structure",
    "search_library",
  ]);
  const result = await client.callTool({
    name: "search_library",
    arguments: { query: "Shared" },
  });
  assert.match(JSON.stringify(result), /A Shared World/);
  const prepared = await client.callTool({
    name: "prepare_organization",
    arguments: {
      title: "Group series",
      changes: [
        {
          bookId: book.id,
          expectedRevision: 1,
          patch: { series: "Shared", collections: ["Favorites"] },
        },
      ],
    },
  });
  assert.equal(prepared.isError, undefined);
  const content = prepared.content as { type: string; text: string }[];
  const output = JSON.parse(content[0]!.text) as { path: string };
  const plan = planSchema.parse(
    JSON.parse(await readFile(output.path, "utf8")),
  );
  assert.equal(plan.changes[0]?.patch.series, "Shared");
  const structured = await client.callTool({
    name: "prepare_structure",
    arguments: {
      title: "Reading order",
      changes: [
        {
          id: "reading-order",
          expectedRevision: null,
          value: {
            kind: "reading-list",
            name: "Crossover",
            bookIds: [book.id],
          },
          deleted: false,
        },
      ],
    },
  });
  assert.equal(structured.isError, undefined);
  const structureOutput = JSON.parse(
    (structured.content as { text: string }[])[0]!.text,
  ) as { path: string };
  assert.equal(
    structurePlanSchema.parse(
      JSON.parse(await readFile(structureOutput.path, "utf8")),
    ).changes[0]?.value.kind,
    "reading-list",
  );
  const stale = await client.callTool({
    name: "prepare_structure",
    arguments: {
      title: "Stale",
      changes: [
        {
          id: "reading-order",
          expectedRevision: 12,
          value: {
            kind: "reading-list",
            name: "Crossover",
            bookIds: [book.id],
          },
        },
      ],
    },
  });
  assert.equal(stale.isError, true);
  const scoped = await client.callTool({
    name: "search_library",
    arguments: {
      query: "Shared",
      rules: {
        match: "all",
        conditions: [{ field: "language", operator: "is", value: "en" }],
      },
    },
  });
  assert.equal(
    JSON.parse((scoped.content as { text: string }[])[0]!.text).total,
    0,
  );
  const emptyView = await client.callTool({
    name: "search_library",
    arguments: { viewId: "fixture-view" },
  });
  assert.equal(
    JSON.parse((emptyView.content as { text: string }[])[0]!.text).total,
    0,
  );
  const unknownView = await client.callTool({
    name: "search_library",
    arguments: { viewId: "missing" },
  });
  assert.equal(unknownView.isError, true);
  assert.equal(await readFile(path, "utf8"), original);
  console.log(
    "MCP protocol check passed: scoped search, metadata/structure plans, stale revisions, original snapshot unchanged.",
  );
} finally {
  await client.close();
  await rm(folder, { recursive: true, force: true });
}
