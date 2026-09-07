# Glassleaf mobile

React Native / Expo app for iOS and Android. The UI uses Shopify Restyle, FlashList, Lucide icons, and bundled DM Sans / Lora fonts. SQLite is the local source of truth. No hosted Glassleaf backend or in-app AI is required.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter @glassleaf/mobile ios
# or, with Android Studio SDK and a device/emulator:
pnpm --filter @glassleaf/mobile android
```

These commands generate and build the native projects. Use a **development build**, not Expo Go: PDF, ZIP extraction, and Google sign-in need native modules. Xcode/CocoaPods are needed for iOS; JDK 17 and the Android SDK for Android. Native generated directories are ignored; configuration belongs in `app.json` / `app.config.ts`.

After installation, `pnpm mobile` starts Metro. Settings → Sample library imports eight original, redistributable EPUB/PDF/CBZ fixtures. Development-only `EXPO_PUBLIC_SAMPLE_LIBRARY=1` seeds those fixtures; `EXPO_PUBLIC_READER_PREVIEW=epub` (or `pdf`, `cbz`) opens a reader for visual checks. These shortcuts are disabled in release builds.

## Implemented

- Offline EPUB, PDF, and CBZ import, duplicate detection, preserved originals, archive traversal/size checks.
- EPUB pagination/scrolling, chapter navigation, text sizing, saved position; native PDF rendering/zoom; comic pages, cover-aware spreads, scrolling, RTL order, pinch/pan and double-tap zoom.
- Bookmarks and notes, reading states, favorites, recoverable trash, title/author/series metadata, story types independent of file format, overlapping tags and collections.
- Indexed SQLite search, bounded 60-book pages, recycled lists, cached covers, four built-in themes, phone/tablet layouts.
- Optional Google Drive integration for originals, metadata, notes, and reading progress, with an offline outbox and deterministic record merging.
- External MCP organization through exported snapshots and reviewable, atomic, revision-checked plans with undo.

## Google Drive setup

The app works locally without configuration. Live sign-in has **not** been validated: no Google project or OAuth credentials were provided. Native builds use Google Sign-In; web/PWA uses Google Identity Services. Both request the least-privilege `https://www.googleapis.com/auth/drive.file` scope and bind one local library to one Google account.

1. Create a Google Cloud project and enable **Google Drive API**.
2. Configure Google Auth Platform branding/audience. While the app is in Testing, add your Google account as a test user. Request `https://www.googleapis.com/auth/drive.file`, which limits access to files created/opened through the app.
3. Create an **iOS** OAuth client for bundle ID `app.glassleaf.mobile`.
4. Create a **Web application** OAuth client for the native SDK's `webClientId` and add every HTTPS PWA origin to its authorized JavaScript origins. No client secret belongs in the app. The web client ID is also used by the browser Google Identity Services flow.
5. Create an **Android** OAuth client for package `app.glassleaf.mobile` and the signing certificate SHA-1. After generating Android, run `./gradlew signingReport` from `apps/mobile/android`. Register the certificate for each build you use; store signing certificates differ from development signing.
6. Copy `.env.example` to `.env.local`, fill the iOS and Web client IDs, then rebuild with the commands above. The iOS URL scheme is generated from its client ID. Android identifies its client through the registered package/certificate.
7. Settings → Google Drive → Connect → Sync now. On the PWA, the first connection must be a user gesture; access tokens remain in memory and an expired browser session requires pressing Connect again. Repeat on a second device with the **same Google account** and test imports, reading progress, notes, offline edits, trash/restore, and reconnect before relying on synchronization.

Drive files live in a Glassleaf folder in your own storage. There is no Glassleaf subscription in this implementation; your Google storage capacity and API quotas still apply. Sync runs on launch, foreground, local edits, or manually while the app is open. It is not an OS background service. Account binding prevents accidentally merging another account into this local library. Conflict versions are retained in SQLite, but a conflict-resolution screen remains to be built. Original uploads use a Drive resumable session but send the file in one PUT; checkpointed chunk retries are not implemented, so very large assets need further work.

## External agents through MCP

1. In Settings, export a library snapshot and save it on your computer. It includes metadata and reading notes, but no book file contents.
2. Configure your MCP client to launch:

```json
{
  "mcpServers": {
    "glassleaf": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/glassleaf", "mcp", "/absolute/path/glassleaf-library.json", "/absolute/path/existing-plan-directory"]
    }
  }
}
```

3. Ask the agent to use `search_library`, `list_organization`, `prepare_organization` (book metadata), and `prepare_structure` (views and ordered lists). Search results omit reading notes and file paths. The server writes a plan file without modifying the exported snapshot or original books.
4. Transfer that JSON back to the phone, import it in Settings, review before/after changes, and apply. If any book changed since export, the entire plan is rejected. Undo likewise refuses to overwrite intervening edits.

This is an explicit file-transfer workflow, not a live remote-control connection to the phone.

## Checks and remaining scope

```sh
pnpm typecheck
pnpm test
pnpm format:check
```

Tests cover atomic plans and undo, stale changes, remote replay/outbox acknowledgement, deduplication, a 10,000-book SQLite query, and an actual MCP client/server exchange. The catalog timing is a host SQLite check, not a phone performance claim.

This branch starts a new mobile implementation; it does not automatically migrate the Swift app's database. The Swift source remains in `apps/apple`. Full Swift feature parity is unfinished: CBR/RAR, DRM, Japanese vertical typesetting, publisher navigation/styles fidelity, full-book text search, highlight rendering, nested/smart collections, complete-library backup/restore, durable background import, and a conflict recovery UI are not implemented. Physical-device performance/accessibility and signed two-device Drive sync still need validation.

For personal Android installation, build `assembleRelease` from the generated Android project (with `-PreactNativeArchitectures=arm64-v8a` for an ARM64 phone). The generated project's release signing currently uses the development key: suitable for personal evaluation, not store publication. iPhone installation uses Xcode signing on your own device; a simulator build cannot be installed on a phone.

## Theme studio and organization (September 6 refinement)

Settings → Appearance offers Paper, Midnight, Forest, and Tokyo Night. Select a starting palette, choose Create theme, edit its name/colors, then Save and apply. Custom themes are stored on the device and survive relaunch. Import/export uses the versioned JSON examples in `themes/`. Unknown fields, malformed colors, and insufficient text contrast are rejected. Custom themes can be edited or removed; removing the current one returns to Paper. Theme sync between devices is not yet implemented.

Library → Filters & sort combines file format, story type, reading state, favorite status, collection, tag, and sorting. Active filter chips can be removed individually. Library → Select books → Organize selected adds tags/collections to multiple books without removing existing values, and can change their story type. The transaction checks every revision; Settings → Undo last organization batch reverses it when no intervening edits exist. The Organize tab browses collections and tags.

`flows/` contains a small set of Maestro native journeys for appearance, custom theme persistence, bulk organization/filtering, and comic navigation. These run on an installed development app seeded with the original sample library. They intentionally modify sample metadata and reading positions. Do not run them against a personal library.

The dated screenshot journal is in `docs/ui-gallery`. Run `python3 scripts/build-ui-gallery.py` to rebuild its index, and `python3 -m http.server 8787 --directory docs/ui-gallery` from the repository root to view it. Preserve older dated captures instead of replacing them.

### Community themes

Appearance includes all four Catppuccin flavors, Nord, Dracula and Gruvbox alongside the original themes. Import downloaded Base16/Base24 YAML or JSON (including legacy flat Base16) from Settings → Appearance → Import. Review/edit the mapped colors and choose Save and apply. Existing Glassleaf JSON imports and exports remain supported. See [format support and palette attribution](themes/community/README.md). Editor extensions and arbitrary application theme files are not interchangeable with these scheme formats.

### Reading home, search, and saved views

The app opens on Home (continue reading, recent additions, saved views). Library keeps books in focus: View options edits filters/sort; Library actions contains layout and bulk selection. Settings is available from the gear and opens individual sections.

Organize separates series, collections, ordered reading lists, smart views, tags and story types. One book can belong to overlapping groups without duplicating files or progress. Reading lists preserve a manual cross-series order. Series browsing sorts by volume. Collection and tag menus rename or merge membership in one undoable transaction; nested saved rules follow the rename.

View options supports nested all/any groups and is/is-not across kind, format, tag, collection, author, series, language, status and favorite. A view retains its parent collection/list/series scope. Pin selected views to Home; continue reading uses lastReadAt rather than metadata modification time. Library actions → Search this view narrows full-text discovery to the current results; Reader settings → Find in this book narrows it to the open book.

Organization records have stable IDs, revisions, tombstones, a durable outbox and conditional acknowledgement. The prepared Drive integration exchanges them in immutable batches alongside books. Concurrent edits choose a deterministic whole-record winner and retain the loser as a conflict; reading orders are not automatically interleaved. Live Google sign-in/multi-device sync still needs OAuth configuration and verification. Settings → Agent organization can review version 2 structure plans and undo the most recent structure/group edit.

Search indexes book metadata, notes, bookmarks, chapter titles and local EPUB text. Results open their saved location or chapter start. Book matches precede notes/bookmarks/chapters in All; each section is also searchable separately. The index uses a persisted chapter-job queue after launch and import, paused while reading, with no file scans on keystrokes. Completed work survives restart; unavailable files can be retried from Search. Changing the query or reopening Search picks up newly indexed chapters. Chapter files over 2 MB are skipped. PDF page text, comic OCR, Japanese segmentation and exact passage highlighting are not implemented.

Research and rationale: [core experience decisions](../../docs/research/2026-09-06-library-experience.md). Current native checks: flows/core-navigation.yaml, core-light-search.yaml and core-dark-gallery.yaml. Earlier flows document the previous navigation and require updating before reuse.

Implementation follow-up: [organization rebuild and verification](../../docs/ORGANIZATION_REBUILD.md).
