import paper from "../../themes/paper.json";
import midnight from "../../themes/midnight.json";
import forest from "../../themes/forest.json";
import tokyoNight from "../../themes/tokyo-night.json";
import { z } from "zod";
const hex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color, such as #7AA2F7.");
export const paletteSchema = z
  .object({
    bg: hex,
    surface: hex,
    muted: hex,
    line: hex,
    text: hex,
    secondary: hex,
    accent: hex,
    accentSoft: hex,
    onAccent: hex,
    danger: hex,
    gold: hex,
  })
  .strict();
export type Palette = z.infer<typeof paletteSchema>;
export const themeDefinitionSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    name: z.string().trim().min(1).max(40),
    mode: z.enum(["light", "dark"]),
    colors: paletteSchema,
  })
  .strict();
export type ThemeDefinition = z.infer<typeof themeDefinitionSchema>;
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return (
      channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    );
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function validateTheme(input: unknown): ThemeDefinition {
  const theme = themeDefinitionSchema.parse(input);
  const pairs = [
    ["text", "bg"],
    ["text", "surface"],
    ["text", "muted"],
    ["secondary", "bg"],
    ["secondary", "surface"],
    ["secondary", "muted"],
    ["onAccent", "accent"],
    ["accent", "accentSoft"],
  ] as const;
  for (const [foreground, background] of pairs) {
    const ratio = contrast(theme.colors[foreground], theme.colors[background]);
    if (ratio < 4.5)
      throw new Error(
        `${foreground} on ${background} has ${ratio.toFixed(1)}:1 contrast. Adjust these colors to reach 4.5:1.`,
      );
  }
  return theme;
}

export const builtinThemes = [paper, midnight, forest, tokyoNight].map(
  validateTheme,
);
