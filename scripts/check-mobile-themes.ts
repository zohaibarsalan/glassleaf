import assert from "node:assert/strict";
import {
  builtinThemes,
  validateTheme,
} from "../apps/mobile/src/ui/themeDefinition";
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
  "Theme validation rejects unreadable, invalid and unknown values.",
);

import { readFileSync } from "node:fs";
import { importTheme, adaptScheme } from "../apps/mobile/src/ui/themeImport";
import catalog from "../apps/mobile/themes/community/catalog.json";
for (const source of catalog) {
  const theme = adaptScheme(source);
  const yaml = readFileSync(
    new URL(
      `../apps/mobile/themes/community/${theme.id}.yaml`,
      import.meta.url,
    ),
    "utf8",
  );
  assert.deepEqual(importTheme(yaml), theme);
  assert.deepEqual(importTheme(JSON.stringify(source)), theme);
  const legacy = { scheme: source.name, ...source.palette };
  assert.equal(adaptScheme(legacy).mode, theme.mode);
  assert.equal(theme.colors.bg, source.palette.base00);
  assert.deepEqual(importTheme(JSON.stringify(theme)), theme);
}
const base24 = {
  ...catalog[0],
  system: "base24",
  palette: {
    ...catalog[0]!.palette,
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `base${(16 + i).toString(16).toUpperCase()}`,
        "#ffffff",
      ]),
    ),
  },
};
assert.equal(adaptScheme(base24).name, catalog[0]!.name);
assert.throws(() => adaptScheme({ ...base24, palette: catalog[0]!.palette }));
assert.throws(() => importTheme("name: a\nname: b"));
assert.throws(() => importTheme("a: &x [1]\nb: *x"));
assert.throws(() => importTheme("x".repeat(65537)));
assert.equal(
  builtinThemes.find((t) => t.id === "catppuccin-latte")!.mode,
  "light",
);
console.log(
  `${builtinThemes.length} built-ins; community YAML/JSON, legacy Base16, Base24, persistence round trips and invalid imports checked.`,
);
