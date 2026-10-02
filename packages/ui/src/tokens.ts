import type { Palette } from "./themeSchema";
export function paletteVariables(colors: Palette): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [
      `--color-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    ]),
  );
}
