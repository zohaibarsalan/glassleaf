import { z } from "zod";
export const ruleFields = [
  "kind",
  "format",
  "tag",
  "collection",
  "author",
  "series",
  "language",
  "status",
  "favorite",
] as const;
export const ruleSchema = z
  .object({
    field: z.enum(ruleFields),
    operator: z.enum(["is", "is-not"]),
    value: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const values: Partial<Record<typeof rule.field, readonly string[]>> = {
      kind: ["novel", "light-novel", "manga", "comic", "document"],
      format: ["epub", "pdf", "cbz"],
      status: ["unread", "reading", "finished"],
      favorite: ["true", "false"],
    };
    if (values[rule.field] && !values[rule.field]!.includes(rule.value))
      ctx.addIssue({
        code: "custom",
        message: `Invalid ${rule.field} value`,
        path: ["value"],
      });
  });
export type Rule = z.infer<typeof ruleSchema>;
export type Rules = { match: "all" | "any"; conditions: (Rule | Rules)[] };
function groupSchema(depth: number): z.ZodType<Rules> {
  return z
    .object({
      match: z.enum(["all", "any"]),
      conditions: z
        .array(
          depth < 3
            ? z.union([ruleSchema, groupSchema(depth + 1)])
            : ruleSchema,
        )
        .max(30),
    })
    .strict();
}
export const rulesSchema = groupSchema(0).superRefine((rules, ctx) => {
  if (countRules(rules) > 100)
    ctx.addIssue({ code: "custom", message: "Use at most 100 conditions." });
});
export const sortSchema = z.enum([
  "added",
  "title",
  "author",
  "series",
  "progress",
  "updated",
  "last-read",
  "list-order",
]);
export const savedViewSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    rules: rulesSchema,
    sort: sortSchema,
    pinned: z.boolean().default(false),
    scope: z
      .object({
        collectionId: z.string().min(1).max(1000).optional(),
        readingListId: z.string().min(1).max(1000).optional(),
        series: z.string().max(500).optional(),
        unfiled: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SavedView = z.infer<typeof savedViewSchema>;
export function countRules(rules: Rules): number {
  return rules.conditions.reduce(
    (sum, r) => sum + ("field" in r ? 1 : countRules(r)),
    0,
  );
}
export function compileRules(input: Rules) {
  const rules = rulesSchema.parse(input);
  const params: (string | number)[] = [];
  function group(rules: Rules): string {
    return rules.conditions.length
      ? `(${rules.conditions
          .map((rule) => {
            if (!("field" in rule)) return group(rule);
            let sql: string;
            if (rule.field === "tag" || rule.field === "collection") {
              sql =
                "EXISTS(SELECT 1 FROM book_facets f WHERE f.bookId=books.id AND f.field=? AND f.value=? COLLATE NOCASE)";
              params.push(rule.field, rule.value);
            } else {
              sql = `COALESCE(json_extract(books.data,'$.${rule.field}'),'') = ? COLLATE NOCASE`;
              params.push(
                rule.field === "favorite"
                  ? rule.value === "true"
                    ? 1
                    : 0
                  : rule.value,
              );
            }
            return rule.operator === "is-not" ? `NOT (${sql})` : `(${sql})`;
          })
          .join(rules.match === "all" ? " AND " : " OR ")})`
      : "1";
  }
  return { sql: group(rules), params };
}
/** Same rule contract for exported metadata in MCP; SQLite handles the live library. */
export function matchesRules(
  book: {
    kind: string;
    format: string;
    tags: string[];
    collections: string[];
    author: string;
    series: string;
    language: string;
    status: string;
    favorite: boolean;
  },
  rules: Rules,
): boolean {
  const match = (rule: Rule | Rules): boolean => {
    if (!("field" in rule)) return matchesRules(book, rule);
    const values =
      rule.field === "tag"
        ? book.tags
        : rule.field === "collection"
          ? book.collections
          : [String(book[rule.field])];
    const found = values.some(
      (v) => v.toLowerCase() === rule.value.toLowerCase(),
    );
    return rule.operator === "is" ? found : !found;
  };
  return (
    !rules.conditions.length ||
    (rules.match === "all"
      ? rules.conditions.every(match)
      : rules.conditions.some(match))
  );
}
