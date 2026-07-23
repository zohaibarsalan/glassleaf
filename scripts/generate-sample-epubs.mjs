#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repoRoot, "samples", "epubs");

const books = [
  {
    slug: "the-garden-beyond",
    title: "The Garden Beyond",
    author: "Mira Ellison",
    description: "A quiet journey through a garden that remembers everyone who cared for it.",
    color: "#A8B9A1",
    ink: "#243227",
    chapters: 6,
    seed: [
      "Mara found the gate where the map had promised only a wall. Ivy threaded the ironwork, and rain rested in every curled leaf.",
      "Beyond it, paths divided around beds of rosemary and foxglove. Small labels carried names, dates, and places she had never visited.",
      "She walked slowly, listening to the patient language of branches moving overhead. The garden did not feel abandoned. It felt paused.",
    ],
  },
  {
    slug: "a-map-of-small-stars",
    title: "A Map of Small Stars",
    author: "Noah Vale",
    description: "Short essays on night skies, observation, and finding scale in ordinary life.",
    color: "#243351",
    ink: "#E5E8EF",
    chapters: 7,
    seed: [
      "The first useful map I owned showed no roads. It marked the winter stars above our apartment roof and nothing beneath them.",
      "A constellation is an agreement between distance and imagination. The points remain remote; the shape belongs to us.",
      "On clear evenings I carried a chair upstairs and learned how long darkness takes to become detailed.",
    ],
  },
  {
    slug: "the-shape-of-rain",
    title: "The Shape of Rain",
    author: "Iris Rowan",
    description: "A coastal mystery where each witness remembers the storm differently.",
    color: "#5790A6",
    ink: "#102D36",
    chapters: 8,
    seed: [
      "Rain crossed Bellweather Bay in silver columns, erasing the lighthouse and returning it one careful line at a time.",
      "By morning, a blue rowboat rested in the town square. No rope held it, no trailer had carried it, and nobody claimed the oars.",
      "Elian photographed the mud beneath the hull before the council swept it away. There were footprints, but all of them led toward the sea.",
    ],
  },
  {
    slug: "common-ground",
    title: "Common Ground",
    author: "Elias North",
    description: "Field notes about resilient neighborhoods and the people who keep them working.",
    color: "#B87959",
    ink: "#311B12",
    chapters: 5,
    seed: [
      "Every durable neighborhood has a place where information travels faster than official notices. Here, it was a bench outside the bakery.",
      "People repaired what they could see together: a loose railing, a flooded planter, a schedule that left the night shift waiting.",
      "The work was ordinary and therefore easy to miss. Its result was not perfection, but confidence that someone would notice.",
    ],
  },
  {
    slug: "letters-from-the-orchard",
    title: "Letters from the Orchard",
    author: "June Bell",
    description: "Warm correspondence about seasons, friendship, and beginning again.",
    color: "#D8CFB0",
    ink: "#3C3425",
    chapters: 7,
    seed: [
      "Dear Lina, the pear trees have flowered too early again. I stood among them at dawn, counting bees and trying not to borrow trouble.",
      "Your red scarf is still on the peg beside the kitchen door. I leave it there because the room has arranged itself around that bright patch.",
      "Write when the city trees begin to turn. I want to know whether autumn reaches you by color, temperature, or sound.",
    ],
  },
  {
    slug: "after-the-violet-hour",
    title: "After the Violet Hour",
    author: "Sana Wren",
    description: "Small prose poems for the blue edge of evening.",
    color: "#765274",
    ink: "#F0E6EE",
    chapters: 9,
    seed: [
      "Evening folds the street into fewer colors. Windows become lanterns; bicycles become bells moving through shadow.",
      "The last bus carries a small weather of its own: damp coats, warm glass, the hush between stops.",
      "Above the roofs, one cloud keeps the daylight a minute longer and spends it all at once.",
    ],
  },
  {
    slug: "the-long-way-home",
    title: "The Long Way Home",
    author: "Rowan Mercer",
    description: "A full-length sample adventure built to stress-test reading, pagination, search, and chapter navigation.",
    color: "#31405D",
    ink: "#E8ECF5",
    chapters: 32,
    paragraphsPerChapter: 12,
    seed: [
      "The train stopped outside Alder Junction without a platform in sight. Beyond the glass, fields rolled toward a line of dark hills.",
      "Tomas checked the paper ticket again. The conductor had punched a small crescent through the destination, as if the town existed only at night.",
      "When the doors opened, cold air entered first. Then came the scent of pine, wet stone, and smoke from a chimney hidden beyond the ridge.",
      "He stepped down with one suitcase and the brass compass his sister had mailed without explanation. Its needle pointed away from north.",
      "A narrow road followed the tracks before turning into the trees. At every bend, white markers carried a different distance to the same place.",
      "Tomas chose the longest route. It was the only one whose sign looked newly painted, and the only one the compass seemed willing to follow.",
    ],
  },
];

const escapeXML = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function chapterBody(book, chapterIndex) {
  const count = book.paragraphsPerChapter ?? 5;
  return Array.from({ length: count }, (_, paragraphIndex) => {
    const source = book.seed[(chapterIndex + paragraphIndex) % book.seed.length];
    const connective = [
      "The detail changed the meaning of what came before.",
      "For a moment, the way ahead seemed almost simple.",
      "Somewhere nearby, water moved over stone.",
      "They carried the question into the next mile.",
      "Nothing answered, but the silence felt attentive.",
      "Morning would reveal which parts had been true.",
    ][(chapterIndex * 3 + paragraphIndex) % 6];
    return `<p>${escapeXML(source)} ${escapeXML(connective)}</p>`;
  }).join("\n      ");
}

function makeBook(book) {
  const workRoot = mkdtempSync(join(tmpdir(), "glassleaf-sample-"));
  const metaRoot = join(workRoot, "META-INF");
  const textRoot = join(workRoot, "OEBPS", "text");
  mkdirSync(metaRoot, { recursive: true });
  mkdirSync(textRoot, { recursive: true });

  writeFileSync(join(workRoot, "mimetype"), "application/epub+zip");
  writeFileSync(
    join(metaRoot, "container.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  );

  const manifest = [];
  const spine = [];
  const navigation = [];
  for (let index = 1; index <= book.chapters; index += 1) {
    const filename = `chapter-${String(index).padStart(2, "0")}.xhtml`;
    manifest.push(`<item id="chapter-${index}" href="text/${filename}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="chapter-${index}"/>`);
    navigation.push(`<li><a href="text/${filename}">Chapter ${index}</a></li>`);
    writeFileSync(
      join(textRoot, filename),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>${escapeXML(book.title)} — Chapter ${index}</title>
    <link rel="stylesheet" type="text/css" href="../styles.css"/>
  </head>
  <body>
    <article>
      <p class="chapter-label">Chapter ${index}</p>
      <h1>${escapeXML(chapterTitle(index))}</h1>
      ${chapterBody(book, index)}
    </article>
  </body>
</html>
`,
    );
  }

  writeFileSync(
    join(workRoot, "OEBPS", "nav.xhtml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>${navigation.join("")}</ol>
    </nav>
  </body>
</html>
`,
  );

  writeFileSync(
    join(workRoot, "OEBPS", "styles.css"),
    `body { font-family: serif; line-height: 1.65; margin: 0; }
article { margin: 0 auto; max-width: 42em; padding: 8vh 7vw 12vh; }
h1 { font-size: 2em; line-height: 1.15; margin: 0 0 1.4em; }
p { margin: 0 0 1.15em; }
.chapter-label { font-family: sans-serif; font-size: .72em; font-weight: 700; letter-spacing: .14em; opacity: .6; text-transform: uppercase; }
`,
  );

  writeFileSync(
    join(workRoot, "OEBPS", "content.opf"),
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:glassleaf-sample-${book.slug}</dc:identifier>
    <dc:title>${escapeXML(book.title)}</dc:title>
    <dc:creator>${escapeXML(book.author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:description>${escapeXML(book.description)}</dc:description>
    <meta property="dcterms:modified">2026-07-24T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="styles" href="styles.css" media-type="text/css"/>
    ${manifest.join("\n    ")}
  </manifest>
  <spine>
    ${spine.join("\n    ")}
  </spine>
</package>
`,
  );

  normalizeTimes(workRoot);
  mkdirSync(outputRoot, { recursive: true });
  const output = join(outputRoot, `${book.slug}.epub`);
  rmSync(output, { force: true });
  execFileSync("zip", ["-X", "-q", "-0", output, "mimetype"], { cwd: workRoot });
  execFileSync("zip", ["-X", "-q", "-r", output, "META-INF", "OEBPS"], { cwd: workRoot });
  rmSync(workRoot, { recursive: true, force: true });
  return output;
}

function normalizeTimes(directory) {
  const fixedTime = new Date("2026-07-24T00:00:00Z");
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      normalizeTimes(path);
    }
    utimesSync(path, fixedTime, fixedTime);
  }
  utimesSync(directory, fixedTime, fixedTime);
}

function chapterTitle(index) {
  const titles = [
    "The Unmarked Gate",
    "A Line Through Rain",
    "What the Map Forgot",
    "Lights Beyond the Ridge",
    "The Patient Road",
    "An Answer in the Trees",
    "Distances at Dusk",
    "Where the River Turns",
  ];
  return titles[(index - 1) % titles.length];
}

rmSync(outputRoot, { recursive: true, force: true });
for (const book of books) {
  const output = makeBook(book);
  console.log(output);
}
