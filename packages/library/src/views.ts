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
  .strict();
export const rulesSchema = z
  .object({
    match: z.enum(["all", "any"]),
    conditions: z.array(ruleSchema).max(30),
  })
  .strict();
export const savedViewSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    rules: rulesSchema,
    sort: z.enum(["added", "title", "author", "series", "progress", "updated"]),
  })
  .strict();
export type Rule = z.infer<typeof ruleSchema>;
export type Rules = z.infer<typeof rulesSchema>;
export type SavedView = z.infer<typeof savedViewSchema>;
export function compileRules(input: Rules) {
  const rules = rulesSchema.parse(input);
  const params: (string | number)[] = [];
  const conditions = rules.conditions.map((rule) => {
    let sql: string;
    if (rule.field === "tag" || rule.field === "collection") {
      sql = `EXISTS(SELECT 1 FROM json_each(data,'$.${rule.field === "tag" ? "tags" : "collections"}') WHERE value = ? COLLATE NOCASE)`;
      params.push(rule.value);
    } else {
      sql = `COALESCE(json_extract(data,'$.${rule.field}'),'') = ? COLLATE NOCASE`;
      params.push(
        rule.field === "favorite"
          ? rule.value === "true"
            ? 1
            : 0
          : rule.value,
      );
    }
    return rule.operator === "is-not" ? `NOT (${sql})` : `(${sql})`;
  });
  return {
    sql: conditions.length
      ? `(${conditions.join(rules.match === "all" ? " AND " : " OR ")})`
      : "1",
    params,
  };
}
