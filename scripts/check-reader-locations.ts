import assert from "node:assert/strict";
import {
  encodeLocator,
  parseLocator,
} from "../apps/mobile/src/readers/location";
import { readingPreferencesSchema } from "../apps/mobile/src/readers/preferences";

const anchor = {
  text: "The rabbit-hole went straight on",
  node: 42,
  offset: 12,
};
assert.deepEqual(
  parseLocator(encodeLocator(2, 0.35, "chapter.xhtml", anchor)),
  {
    version: 1,
    page: 2,
    fraction: 0.35,
    href: "chapter.xhtml",
    anchor,
  },
);
assert.equal(parseLocator("7:0.45").page, 7);
assert.equal(parseLocator("7:0.45").fraction, 0.45);
for (const broken of [
  "garbage",
  "-5:Infinity",
  '{"version":1,"page":-2}',
  "NaN:NaN",
]) {
  const location = parseLocator(broken);
  assert.equal(location.page, 0);
  assert.equal(location.fraction, 0);
}
assert.throws(() => encodeLocator(0, 2));
assert.throws(() =>
  encodeLocator(0, 0, "chapter.xhtml", { ...anchor, node: -1 }),
);
assert.equal(readingPreferencesSchema.parse({}).paper, "theme");
assert.equal(readingPreferencesSchema.safeParse({ size: 300 }).success, false);
console.log(
  "Reader locations: legacy migration, anchored round trips and invalid persisted values checked.",
);
