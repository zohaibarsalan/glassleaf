# Glassleaf

Glassleaf is a private, native-feeling reading library. The current app reads EPUB on iPhone, iPad, and Mac; the accepted roadmap expands to PDF, MOBI, AZW3, DjVu, FB2, comics, Android, Windows, and the web.

The goal is straightforward: deliver the simplicity and polish of Apple Books with substantially better organization, user-controlled storage, and no lock-in.

The accepted cross-platform feature roadmap, supported-format targets, free-core principles, and optional managed-sync plan are documented in [docs/FEATURES.md](./docs/FEATURES.md).

Glassleaf is open source and has a two-plan product model: **Free** is a complete local/offline reader and library manager, while **Paid** primarily funds the official managed Glassleaf Sync service for cross-platform book storage, transfer, web access, history, and recovery. The exact open-source license and hosted-service quotas are not yet selected.

> Status: functional local-native MVP with a provider-neutral sync foundation. The universal SwiftUI app imports, organizes, searches, reads, annotates, exports, and restores DRM-free EPUB libraries entirely on-device. Sync records, offline replay, conflicts, tombstones, migration gates, and the durable journal are implemented; CloudKit, other remote provider adapters, and the web companion have not started.

## Current implementation

- One SwiftUI application target for iPhone, iPad, and Mac, beginning at iOS 26, iPadOS 26, and macOS 26.
- Adaptive Home, hierarchical sidebar, grid/list library, Inbox, Trash, reading states, favorites, detail and metadata editing.
- Nested folders, tags, collections, ordered series, smart collections, drag-and-drop assignment, and multi-book actions.
- SQLite/WAL persistence with an FTS5 index over title, author, series, tags, folder, and collections.
- Safe local EPUB extraction, metadata/cover/TOC parsing, original-file preservation, streamed SHA-256 and identifier duplicate detection, and custom cover replacement.
- A same-window WebKit EPUB reader with pagination or scrolling, TOC, full-book search, restored position, bookmarks, persistent highlights/notes, themes, typography, margins, spacing, and alignment.
- Recoverable Trash plus a portable `.glassleaflibrary` package containing original EPUBs, covers, metadata, organization, progress, bookmarks, and notes.
- Swift Testing coverage, executable domain checks, a generated-EPUB integration check, macOS/iOS Simulator build gates, and a 50,000-book search performance gate.

## Local development

Generate the Xcode project and run the checks:

```sh
./scripts/check-apple.sh
open apps/apple/Glassleaf.xcodeproj
```

The check script runs domain tests, the complete local import/storage regression, Debug and Release source checks, and unsigned macOS/iOS Simulator builds. It requires current Xcode and XcodeGen.

Run the repeatable large-library search benchmark separately:

```sh
./scripts/benchmark-search.sh
```

The current 50,000-book gate requires p95 indexed queries below 50 ms; the latest Apple Silicon run measured 3.06 ms p95.

## Product direction

- Universal SwiftUI application for iPhone, iPad, and macOS.
- Thoughtful Liquid Glass interface using native system components.
- Local, offline EPUB reading today, with a renderer boundary and roadmap for PDF, MOBI, AZW3, DjVu, FB2, and comics.
- Folders, tags, series, smart collections, search, and batch organization.
- Offline-first library and reading.
- Local-only, iCloud/CloudKit, or Google Drive storage.
- One active sync provider per library, with guided migration between providers.
- Optional web companion hosted on Vercel.
- No ads, public profiles, content scanning, or required proprietary ebook store.

## Proposed architecture

```text
┌───────────────────────────────────────────────┐
│ Glassleaf                                    │
│ Apple · Android · Windows · Web               │
└──────────────────────┬────────────────────────┘
                       │ provider-neutral model
       ┌──────────┼──────────┬──────────────┐
       │          │          │              │
       ▼          ▼          ▼              ▼
    Local      iCloud   Google Drive   Glassleaf Sync
```

CloudKit, Google Drive, and the future managed Glassleaf Sync service are user choices. They are not simultaneous authorities for the same library. Google Drive may additionally serve as a backup/export destination for an iCloud-backed library.

Vercel hosts only the web application shell and minimal secure endpoints. EPUB files and normal reading traffic should flow directly between the user's device and selected provider.

## MVP features

- Import and preserve DRM-free EPUB files.
- Edit title, author, cover, description, series, and series order.
- Organize with hierarchical folders, multiple tags, series, and smart collections.
- Search, sort, filter, and batch-edit a library.
- Read with pagination or continuous scrolling.
- Customize fonts, sizing, spacing, margins, alignment, and themes.
- Synchronize progress, bookmarks, highlights, notes, metadata, and assets.
- Export original books and complete portable library snapshots.
- Migrate a library safely between storage providers.

## Privacy model

- Library data is private by default.
- Glassleaf does not analyze or classify book content automatically.
- Sensitive library metadata must never be included in telemetry or crash logs.
- File and cloud permissions are least-privilege.
- Users retain complete export access to original EPUBs and library metadata.
- Optional device authentication and privacy mode are planned.

## Repository layout

The current layout is:

```text
glassleaf/
├── apps/
│   └── apple/          # Universal SwiftUI app and generated Xcode project
├── packages/
│   └── domain/         # Provider-neutral schemas and checks
├── docs/               # Feature roadmap and accepted architecture decisions
├── scripts/            # Repeatable verification
├── CONTEXT.md
└── README.md
```

The provider-neutral contract currently lives in `GlassleafDomain` and [docs/SYNC_PROTOCOL.md](./docs/SYNC_PROTOCOL.md). A separately consumable sync-spec package and the planned web app can be added when a non-Swift client begins. Native and web implementations may use different languages, but they must share the versioned record and migration semantics.

## Next delivery phases

1. Finish the remaining accessibility, malformed-EPUB corpus, and real-device reliability validation around the shipped portable restore and durable import queue.
2. Finish the remaining series, nested smart-rule, tag-color, and manual organizer-ordering work.
3. Add iCloud as the first direct provider, starting with metadata/organization and proving the shipped sync contract with multi-device tests before enabling assets.
4. Add PDF and comic foundations, then MOBI, DRM-free AZW3, FB2, and DjVu behind the publication boundary.
5. Add Google Drive only after iCloud proves provider migration and recovery behavior.
6. Build managed Glassleaf Sync and the web reader, followed by local-first Android and Windows clients.

## Development prerequisites

Current and future prerequisites:

- Current Xcode and Apple SDKs.
- An active Apple Developer Program membership for CloudKit entitlements and durable iPhone deployment.
- Node.js for the web companion and shared tooling.
- A Google Cloud OAuth client for Google Drive integration.
- A Vercel account for the optional web companion.

Do not add credentials, provisioning profiles, private keys, OAuth secrets, or user library files to Git.

## Contributor guidance

Read [CONTEXT.md](./CONTEXT.md) before working on the project. It contains the current product specification, architecture boundaries, privacy requirements, UI direction, sync semantics, non-goals, and unresolved decisions.
