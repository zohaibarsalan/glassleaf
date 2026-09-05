import assert from "node:assert/strict";
import { builtinThemes, validateTheme } from "../apps/mobile/src/ui/themeDefinition";
for (const theme of builtinThemes) {
  assert.deepEqual(validateTheme(JSON.parse(JSON.stringify(theme))), theme);
}
const theme = builtinThemes.find((theme) => theme.id === "tokyo-night")!;
assert.throws(
  () =>
    validateTheme({
      ...theme,
      colors: { ...theme.colors, text: theme.colors.bg },
    }),
  /contrast/,
);
assert.throws(() =>
  validateTheme({ ...theme, colors: { ...theme.colors, bg: "url(evil)" } }),
);
assert.throws(() =>
  validateTheme({ ...theme, unexpected: "ignored configuration" }),
);
console.log(
  "Themes: four readable palette round trips; unreadable, invalid and unknown values rejected.",
);
