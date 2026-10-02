import { parseDocument } from "yaml";
import { z } from "zod";
import { contrast, validateTheme, type ThemeDefinition } from "./themeSchema";

export const MAX_THEME_SIZE = 64 * 1024;
const record = z.record(z.string(), z.unknown());
const color = z
  .string()
  .regex(/^#?[0-9a-f]{6}$/i)
  .transform((v) => `#${v.replace(/^#/, "")}`);

/** Tinted Base16/Base24, including legacy flat Base16 schemes. */
export function adaptScheme(input: unknown): ThemeDefinition {
  const source = record.parse(input);
  const system = z.enum(["base16", "base24"]).parse(source.system ?? "base16");
  const name = z
    .string()
    .trim()
    .min(1)
    .max(40)
    .parse(source.name ?? source.scheme);
  const raw = record.parse(source.palette ?? source);
  const palette: Record<string, string> = {};
  for (let i = 0; i < (system === "base24" ? 24 : 16); i++) {
    const key = `base${i.toString(16).toUpperCase().padStart(2, "0")}`;
    palette[key] = color.parse(raw[key] ?? raw[key.toLowerCase()]);
  }
  const p = (index: string) => palette[`base${index}`]!;
  const mode =
    source.variant === undefined
      ? contrast(p("00"), "#ffffff") > contrast(p("00"), "#000000")
        ? "dark"
        : "light"
      : z.enum(["light", "dark"]).parse(source.variant);
  // Preserve source colors. Prefer the intended token, then another palette
  // color that is readable on every surface. Never synthesize replacement hues.
  const readable = (preferred: string[], backgrounds: string[]) => {
    const match = [...preferred, ...Object.values(palette)].find((candidate) =>
      backgrounds.every((bg) => contrast(candidate, bg) >= 4.5),
    );
    if (!match)
      throw new Error(
        `${name} has no readable color for these surfaces. Try a higher-contrast scheme.`,
      );
    return match;
  };
  const bg = p("00");
  const text = readable([p("05"), p("06"), p("07")], [bg]);
  const surface = contrast(text, p("01")) >= 4.5 ? p("01") : bg;
  const muted = contrast(text, p("02")) >= 4.5 ? p("02") : surface;
  const accent = readable([p("0D"), p("0E")], [bg]);
  return validateTheme({
    version: 1,
    id:
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "community-theme",
    name,
    mode,
    colors: {
      bg,
      surface,
      muted,
      line: p("03"),
      text,
      secondary: readable([p("04"), text], [bg, surface, muted]),
      accent,
      accentSoft: bg,
      onAccent: readable([bg, text], [accent]),
      danger: readable([p("08")], [bg, surface]),
      gold: p("0A"),
    },
  });
}

export function importTheme(source: string): ThemeDefinition {
  if (source.length > MAX_THEME_SIZE)
    throw new Error("Theme files must be smaller than 64 KB.");
  const document = parseDocument(source, {
    uniqueKeys: true,
    stringKeys: true,
  });
  if (document.errors.length || document.warnings.length)
    throw new Error("This theme contains invalid or unsupported YAML/JSON.");
  const input: unknown = document.toJS({ maxAliasCount: 0 });
  const value = record.parse(input);
  if (value.version !== undefined) return validateTheme(value);
  if (value.palette !== undefined || value.scheme !== undefined)
    return adaptScheme(value);
  throw new Error(
    "Choose a Base16, Base24, or Glassleaf theme file (.yaml, .yml, or .json).",
  );
}
