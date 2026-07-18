# Glassleaf

Glassleaf is a private, native-feeling EPUB library and reader for iPhone, iPad, Mac, and the web.

The goal is straightforward: deliver the simplicity and polish of Apple Books with substantially better organization, user-controlled storage, and no lock-in.

> Status: functional local-native MVP. The universal SwiftUI app imports, organizes, searches, reads, annotates, and exports DRM-free EPUB libraries entirely on-device. Cloud providers and the web companion have not started.

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
- Local, offline EPUB reading experience with a renderer boundary that can evolve independently of the catalog.
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
│ iPhone · iPad · Mac · Web companion          │
└──────────────────────┬────────────────────────┘
                       │ provider-neutral model
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
     Local only   iCloud/CloudKit   Google Drive
```

CloudKit and Google Drive are user choices. They are not simultaneous authorities for the same library. Google Drive may additionally serve as a backup/export destination for an iCloud-backed library.

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
├── docs/decisions/     # Accepted architecture decisions
├── scripts/            # Repeatable verification
├── CONTEXT.md
└── README.md
```

The planned web app and portable sync-spec package will be added only when their delivery phases begin. Native and web implementations may use different languages, but they must share a versioned domain and sync specification.

## Next delivery phases

1. Complete hands-on accessibility, keyboard, malformed-EPUB, and real-library fixture testing on iPhone, iPad, and Mac.
2. Validate a private CloudKit record/asset spike before adding the iCloud provider.
3. Define and chaos-test the versioned sync manifest, tombstones, conflicts, and migration protocol.
4. Add least-privilege Google Drive synchronization using `drive.file` after iCloud behavior is proven.
5. Build the authenticated web companion only after the native provider contract is stable.

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
