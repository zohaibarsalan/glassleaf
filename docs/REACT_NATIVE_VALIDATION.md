# React Native branch validation — 2026-09-06

Branch: `feat/react-native-app`. This is the new mobile implementation, not a certification of complete feature parity with the Swift app.

## Passed

- Strict TypeScript checks for mobile, shared catalog, and MCP packages.
- Prettier checks across the TypeScript implementation.
- Four focused catalog tests: atomic stale-plan rollback and undo; remote replay and conditional outbox acknowledgement; duplicate content/destructive patch rejection; bounded indexed queries against 10,000 records.
- An actual stdio MCP client/server exchange covering discovery, search, plan generation, revision validation, and unchanged original snapshot.
- iOS Simulator native build with Xcode 26.6; installed/launched on iPhone 17 Pro Max, iOS 26.5.
- Android ARM64 debug and release native compilation with JDK 17. The release APK bundles JavaScript for use without Metro; it uses the generated development signing key.
- Native simulator rendering inspected for the empty/populated library, EPUB chapter, PDF page, and RTL comic cover. These checks caught and fixed duplicated EPUB title content and reader safe-area contrast. Fixtures are original generated content, not personal books.

## Explicit limits

- No physical iOS/Android device session or Android emulator rendering was performed. Native compilation is not gesture, accessibility, or frame-time validation. Simulator UI automation was unavailable, so screenshots establish rendering only, not completion of interactive reader workflows.
- The 10,000-record test exercises host SQLite queries; it does not establish scrolling or import speed on a phone.
- No Google project/client IDs were supplied. Google sign-in, actual uploads/downloads, account recovery, and signed two-device sync remain unverified. Follow `apps/mobile/README.md` to configure and exercise them.
- CBR/RAR, vertical Japanese typesetting, full EPUB publisher/navigation fidelity, full-book text search/highlight rendering, nested/smart collections, full backup/restore, and a conflict-resolution UI remain outside this implementation.
- Existing Swift working-tree changes were preserved separately. The React Native app starts its own database and does not migrate existing Swift libraries automatically.

Local screenshots and the evaluation APK are under `outputs/react-native/`; generated binaries are deliberately not committed. The implementation, original fixtures, and setup documentation are committed.

## UI refinement follow-up

Native UI automation became available through Maestro. This supersedes the earlier simulator interaction limitation for the specific paths below; it does not establish physical-device or Android gesture coverage.

- Passed the CBZ journey: jump to page 1, next button to page 2, RTL swipe to page 3, spread alignment, 1.5× zoom control, and continuous scrolling. Captured interior pages in Tokyo Night.
- Passed bulk organization: select an EPUB and CBZ, append tags/collections, browse the new collection, combine it with CBZ format, and assert that only the comic remains.
- Passed custom theme creation, application, persistence after restart, and removal. Four built-in themes pass JSON round trips and text contrast checks; malformed/unknown fields and unreadable colors are rejected.
- Exercised Paper, Tokyo Night, and Midnight through native Settings. Captured a dark EPUB chapter. A driver `isScreenStatic` HTTP 500 interrupted the appearance capture after Midnight; the remaining EPUB capture passed in a separate run.
- Strict TypeScript, formatting, four focused catalog tests (including format/search intersections), MCP protocol checks, and theme validation checks pass.

| Principle | Before | After | Verification |
| --- | --- | --- | --- |
| Clear hierarchy | Oversized heading and promotional copy displaced books | Smaller headings, shorter copy, visible labeled library tools | Native light/dark captures |
| Discoverable organization | Tags hidden in per-book metadata; filters behind an icon | Select books, bulk tagging/collections, Organize navigation, removable filter chips | Native selection and combined-filter journey |
| Usable sheets | Keyboard covered page jump; filter actions could clip | Keyboard avoidance, persistent taps, constrained scrolling and fixed filter footer | Page jump, custom theme save and filtering |
| Consistent theme colors | Three hard-coded palettes | Versioned JSON themes, Tokyo Night, editor/import/export, text contrast validation | Four palette checks and custom persistence journey |
| Comic navigation | Changing to spreads could start on the wrong pair | Cover-aware pair alignment | Native page/spread captures |

The dated gallery in `docs/ui-gallery/` includes before/after, Paper, Midnight, Tokyo Night, organization and reader views. Screenshots use original generated fixtures; they do not represent broad third-party archive compatibility. Pinch gestures, physical-device frame times, file-picker/share-sheet theme round trips, and Android interaction testing remain unverified.

## Organization rebuild — September 6

See [the implementation and evidence report](ORGANIZATION_REBUILD.md) for nested views, ordered lists, scoped discovery, durable chapter jobs, organization sync/MCP, native checks, build artifact and remaining limitations. The new gallery stage preserves prior captures.
