# Reader adoption implementation — September 6, 2026

Branch: `feat/react-native-app`. This is a staged adoption of useful behavior from the researched readers and library managers, not a claim of full feature parity.

## Delivered

- Apple Books / KOReader-style reading appearance: Comfort, Compact and Large print presets; independent app-theme/white/sepia/night paper; serif/sans/publisher fonts; text size, line spacing, margins and alignment.
- Text-aware EPUB locations include chapter href and text-node context, with backward-compatible reads of existing page:fraction positions. Highlight start/end anchors are persisted alongside notes and survive app restart.
- Select text to highlight or explicitly look it up online. The annotations sheet links back to the passage and exports JSON. Same-document semantic footnotes open a preview.
- Panels / Mihon-style comic page overview uses a horizontal virtualized list. Existing RTL/LTR, spreads and long-strip scrolling remain available.
- PDF outlines use the file's native table of contents, normalize iOS/Android page indexes and navigate while preserving night mode.
- Next-volume continuation appears at the end of a numbered series volume. It excludes Trash, equal/earlier volumes, other story types, other languages and other formats. This is still based on the existing series metadata, not a new work/edition identity model.
- Agent organization plans can include reasons, source references and optional confidence. The review screen labels confidence as agent-reported and lets the user exclude individual changes before applying. Existing atomic stale-revision checks and undo remain in place.

## Verified

- `pnpm typecheck`: mobile, library and MCP.
- `pnpm test`: 12 library cases including next-volume boundary behavior, MCP protocol including evidence round trip, 11 theme definitions/import validation, and focused reader locator/PDF-outline parsing checks.
- iPhone 17 Pro Max simulator, iOS 26.5: selected and highlighted “nothing” in the downloaded Gutenberg Alice EPUB; opened it from annotations; stopped/relaunched the app and visually confirmed the highlight at the saved passage.
- Changed Sepia/sans typography and text size in the native EPUB reader. This checks applying controls, not all pagination/reflow edge cases.
- Downloaded Haruko CBZ: native overview thumbnails render and page selection closes the sheet to the chosen page.
- Downloaded Attention PDF: native outline exposes Introduction on page 2; selecting it displays that page in night mode.

## Still open

Readium engine evaluation; complete fixed-layout EPUB/media overlays; cross-document footnotes; precise passage-search destinations; Android highlight rendering and physical-device performance/accessibility; PDF text selection/search/highlights/crop; comic border crop and wide-page splitting; work/edition identities; reusable agent organization rules; OPDS and resumable downloads; two-device Drive sync (OAuth setup still required).

JSON export and online dictionary actions are implemented but have not been exercised through an external destination. CSS highlights require a supporting system WebView. No native Android or physical-phone verification is claimed by these simulator captures.

Gallery: `docs/ui-gallery/reader-adoption/index.html` embeds original PNG captures for viewing on a phone without a separate image server. Earlier galleries remain intact.
