import paper from "../../themes/paper.json";
import midnight from "../../themes/midnight.json";
import forest from "../../themes/forest.json";
import tokyoNight from "../../themes/tokyo-night.json";
import { validateTheme } from "./themeSchema";
import { adaptScheme } from "./themeImport";
import community from "../../themes/community/catalog.json";
export * from "./themeSchema";
export const builtinThemes = [
  ...[paper, midnight, forest, tokyoNight].map(validateTheme),
  ...community.map(adaptScheme),
];
