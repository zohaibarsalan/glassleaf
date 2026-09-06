import { z } from "zod";

export const textAnchorSchema = z.object({
  text: z.string().max(240),
  offset: z.number().int().nonnegative(),
  node: z.number().int().nonnegative(),
});
export type TextAnchor = z.infer<typeof textAnchorSchema>;
const locationSchema = z.object({
  version: z.literal(1),
  page: z.number().int().nonnegative(),
  fraction: z.number().min(0).max(1),
  href: z.string().optional(),
  anchor: textAnchorSchema.optional(),
});
export function parseLocator(locator: string) {
  try {
    const parsed = locationSchema.safeParse(JSON.parse(locator));
    if (parsed.success) return parsed.data;
  } catch {
    /* Existing libraries use page:fraction locators. */
  }
  const [page, fraction] = locator.split(":").map(Number);
  return {
    version: 1 as const,
    page: Number.isFinite(page) ? Math.max(Math.floor(page ?? 0), 0) : 0,
    fraction: Number.isFinite(fraction)
      ? Math.min(Math.max(fraction ?? 0, 0), 1)
      : 0,
    anchor: undefined,
    href: undefined,
  };
}
export function encodeLocator(
  page: number,
  fraction: number,
  href?: string,
  anchor?: TextAnchor,
) {
  return JSON.stringify(
    locationSchema.parse({ version: 1, page, fraction, href, anchor }),
  );
}
