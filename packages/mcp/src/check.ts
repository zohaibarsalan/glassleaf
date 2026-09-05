import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { bookSchema, planSchema } from "@glassleaf/library";
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
  assert.equal(tools.tools.length, 2);
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
  assert.equal(await readFile(path, "utf8"), original);
  console.log(
    "MCP protocol check passed: search, revision-checked plan, original snapshot unchanged.",
  );
} finally {
  await client.close();
  await rm(folder, { recursive: true, force: true });
}
