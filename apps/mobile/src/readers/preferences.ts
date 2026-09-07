import { z } from "zod";

export const readingPreferencesSchema = z.object({
  font: z.enum(["serif", "sans", "publisher"]).default("serif"),
  size: z.number().min(14).max(34).default(20),
  lineHeight: z.number().min(1.2).max(2.2).default(1.75),
  margin: z.number().min(12).max(48).default(26),
  paper: z.enum(["theme", "white", "sepia", "night"]).default("theme"),
  align: z.enum(["start", "justify"]).default("start"),
});
export type ReadingPreferences = z.infer<typeof readingPreferencesSchema>;
export const readingPresets: {
  name: string;
  preferences: ReadingPreferences;
}[] = [
  { name: "Comfort", preferences: readingPreferencesSchema.parse({}) },
  {
    name: "Compact",
    preferences: readingPreferencesSchema.parse({
      size: 18,
      lineHeight: 1.5,
      margin: 18,
    }),
  },
  {
    name: "Large print",
    preferences: readingPreferencesSchema.parse({
      font: "sans",
      size: 26,
      lineHeight: 1.9,
      margin: 24,
    }),
  },
];
