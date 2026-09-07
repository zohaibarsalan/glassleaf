import { z } from "zod";
import { savedViewSchema } from "./views";
const id = z.string().min(1).max(1000);
const name = z.string().trim().min(1).max(100);
export const organizationValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("view"), view: savedViewSchema }).strict(),
  z.object({ kind: z.literal("collection"), name }).strict(),
  z
    .object({
      kind: z.literal("reading-list"),
      name,
      bookIds: z
        .array(z.string().regex(/^[a-zA-Z0-9_-]+$/))
        .max(10000)
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "A reading list cannot include a book twice.",
        ),
    })
    .strict(),
]);
export const organizationRecordSchema = z
  .object({
    id,
    value: organizationValueSchema,
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    device: z.string(),
    deletedAt: z.string().datetime().nullable(),
  })
  .strict()
  .refine(
    (r) => r.value.kind !== "view" || r.value.view.id === r.id,
    "View IDs must agree.",
  );
export type OrganizationRecord = z.infer<typeof organizationRecordSchema>;
export type OrganizationValue = z.infer<typeof organizationValueSchema>;
export const structurePlanSchema = z
  .object({
    version: z.literal(2),
    id: z.string().min(1),
    title: z.string().min(1).max(200),
    changes: z
      .array(
        z
          .object({
            id,
            expectedRevision: z.number().int().nonnegative().nullable(),
            value: organizationValueSchema,
            deleted: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type StructurePlan = z.infer<typeof structurePlanSchema>;
export const collectionId = (name: string) =>
  `collection:${name.trim().toLowerCase()}`;
