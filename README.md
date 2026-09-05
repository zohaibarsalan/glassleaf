# Glassleaf

The active cross-platform app is now **React Native for iOS and Android**, in [`apps/mobile`](apps/mobile/README.md). It includes EPUB/PDF/CBZ readers, a themed library, Google Drive integration awaiting OAuth setup, and an external MCP organization workflow. See the mobile README for setup, validation, and remaining scope.

The sections below describe the earlier Swift application, preserved in `apps/apple`; they are not a feature-parity claim for the React Native app.

## Legacy Apple implementation

<p align="center">
  <strong>A fast, local-first reading library for Apple platforms.</strong><br>
  Apple Books simplicity, deeper organization, user-controlled storage, and no required bookstore.
</p>

<p align="center">
  <img alt="Swift 6" src="https://img.shields.io/badge/Swift-6.0-F05138?logo=swift&logoColor=white">
  <img alt="iOS 26+" src="https://img.shields.io/badge/iOS-26%2B-111111?logo=apple">
  <img alt="macOS 26+" src="https://img.shields.io/badge/macOS-26%2B-111111?logo=apple">
  <img alt="Status: alpha" src="https://img.shields.io/badge/status-alpha-8A63D2">
</p>

Glassleaf is a universal SwiftUI application for reading and organizing DRM-free EPUB books on iPhone, iPad, and Mac. It is designed around a private offline library, responsive reading, strong organization, portable exports, and optional private iCloud synchronization.

> [!IMPORTANT]
> Glassleaf is an alpha project. Local EPUB workflows are functional and repeatably tested, but iCloud still requires signed multi-device validation before it should be trusted as the only copy of a library. Keep backups of important books.

## What works today

- Import and preserve original DRM-free EPUB files.
- Extract metadata, covers, table of contents, and publication resources safely.
- Read in the same window with paginated or continuous layouts.
- Restore reading position and customize theme, typography, margins, spacing, and alignment.
- Create bookmarks, highlights, and notes; search across a complete book.
- Organize with nested folders, tags, collections, ordered series, and smart collections.
- Browse Home, Inbox, reading states, favorites, and recoverable Trash.
- Search title, author, series, tags, folder, and collections through SQLite FTS5.
- Batch-edit and drag books into organizers.
- Export and restore a complete portable `.glassleaflibrary` package.
- Opt into private CloudKit sync for metadata, organization, reading state, annotations, preferences, and verified EPUB assets.

The library remains usable offline. Cloud changes enter a durable outbox and retry without blocking reading.

## Quick start

### Requirements

- macOS with Xcode 26 or newer
- iOS 26, iPadOS 26, or macOS 26 deployment target
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)
- An Apple Developer Program team for live CloudKit and physical-device provisioning

Install XcodeGen with Homebrew if needed:

```sh
brew install xcodegen
```

Clone, generate the project, and run the complete local verification:

```sh
git clone git@github.com:zohaibarsalan/glassleaf.git
cd glassleaf
./scripts/check-apple.sh
open apps/apple/Glassleaf.xcodeproj
```

In Xcode, choose the **Glassleaf** scheme and select **My Mac** or an installed iPhone/iPad simulator. Press `⌘R` to run.

CloudKit is optional. Local reading and organization do not require signing into iCloud. To test synchronization, select a development team whose provisioning profile includes the `iCloud.app.glassleaf.reader` container.

## Verification

`./scripts/check-apple.sh` runs:

- Swift Testing coverage for the provider-neutral domain
- executable domain checks
- generated-EPUB import, extraction, persistence, search, deduplication, backup, and restore regression
- macOS Debug and Release source checks
- unsigned macOS and iPhone/iPad Simulator builds

The shared Xcode scheme also includes cross-platform CloudKit record-codec tests; run them with **Product → Test** in Xcode.

Run the large-library benchmark separately:

```sh
./scripts/benchmark-search.sh
```

The current gate indexes 50,000 books and requires p95 search latency below 50 ms. The latest Apple Silicon run measured 3.06 ms p95.

## Architecture

```text
┌──────────────────────────────────────────────┐
│ Glassleaf clients                           │
│ Apple today · Android/Windows/Web planned   │
└──────────────────────┬───────────────────────┘
                       │ provider-neutral records
          ┌────────────┼────────────┬──────────────┐
          ▼            ▼            ▼              ▼
       Local        iCloud     Google Drive   Glassleaf Sync
                                  planned         planned
```

The application has one active storage authority per library. Providers transport opaque versioned records; Glassleaf owns entity identity, revisions, merge rules, tombstones, reading events, recovery, and migration. iCloud and a future Google Drive provider are not simultaneous writers for the same library.

The Apple app uses SwiftUI, WebKit, SQLite/WAL, FTS5, and a local EPUB extraction boundary. The domain package deliberately contains no CloudKit identifiers so future clients can implement the same protocol without adopting Swift or Apple's data model.

## Repository map

```text
glassleaf/
├── apps/apple/             Universal SwiftUI application and tests
├── packages/domain/        Provider-neutral models, sync rules, and checks
├── docs/                   Feature catalogue, sync protocol, and decisions
├── scripts/                Build, regression, and performance gates
├── CONTEXT.md              Product and architecture specification
└── README.md
```

Useful project documents:

- [Feature catalogue and roadmap](./docs/FEATURES.md)
- [Provider-neutral sync protocol](./docs/SYNC_PROTOCOL.md)
- [iCloud architecture and release gates](./docs/ICLOUD_SYNC.md)
- [Platform baseline decision](./docs/decisions/0001-platform-baseline.md)
- [Local EPUB rendering decision](./docs/decisions/0002-local-epub-rendering.md)

## Roadmap

Near-term priorities are:

1. Finish accessibility, malformed-EPUB, and real-device reliability validation.
2. Complete remaining organizer polish and manual ordering workflows.
3. Implement and validate Google Drive sync using the user's storage, without waiting for Apple Developer Program membership.
4. Add PDF and comic foundations, followed by MOBI, DRM-free AZW3, FB2, and DjVu.
5. Complete signed iCloud multi-device, interruption, quota, account-switch, and stale-client validation when developer provisioning is available.
6. Build the optional managed sync service and web reader, followed by Android and Windows clients.

Roadmap items are commitments of direction, not claims about the current build.

## Privacy and content policy

- Libraries are private by default and remain readable offline.
- Glassleaf does not analyze book content for advertising or model training.
- No account is required for local reading.
- Original EPUBs and complete library metadata remain exportable.
- Credentials, provisioning profiles, user libraries, and imported books must never be committed.
- Glassleaf imports DRM-free files only; it does not bypass DRM or access controls.

## Contributing

Read [CONTEXT.md](./CONTEXT.md) before making architectural changes. Keep changes scoped, preserve local-first behavior, and add a repeatable check for persistence, sync, or EPUB parsing changes.

Before opening a pull request:

```sh
./scripts/check-apple.sh
git diff --check
```

Bug reports should include the platform, OS/Xcode version, reproduction steps, and sanitized console output. Do not attach copyrighted books, personal library databases, credentials, or provisioning profiles.

## License

A project license has not been selected yet. The source is public for inspection and collaboration, but no reuse license is granted until a `LICENSE` file is added. This should be resolved before a stable release or accepting substantial external contributions.
