# Glassleaf

Glassleaf is a private, native-feeling EPUB library and reader for iPhone, iPad, Mac, and the web.

The goal is straightforward: deliver the simplicity and polish of Apple Books with substantially better organization, user-controlled storage, and no lock-in.

> Status: product definition and repository bootstrap. Application code has not been scaffolded yet.

## Product direction

- Universal SwiftUI application for iPhone, iPad, and macOS.
- Thoughtful Liquid Glass interface using native system components.
- Readium-based EPUB reading experience.
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

## Repository plan

The exact code layout will be established after the technical spikes, but the intended shape is:

```text
glassleaf/
├── apps/
│   ├── apple/          # Universal SwiftUI app
│   └── web/            # Vercel-hosted web companion
├── packages/
│   ├── domain/         # Provider-neutral schemas and rules
│   └── sync-spec/      # Portable manifest and sync fixtures
├── docs/
├── CONTEXT.md
└── README.md
```

Native and web implementations may use different languages, but they must share a versioned domain and sync specification.

## Planned technical spikes

1. Open and render EPUBs through Readium Swift Toolkit on all Apple targets.
2. Store metadata and EPUB assets in a private CloudKit database.
3. Access that same library through CloudKit JS on the web.
4. Implement least-privilege Google Drive synchronization using `drive.file`.
5. Exercise interrupted, duplicate, offline, migration, and conflict scenarios.
6. Prototype the core Liquid Glass library and reader surfaces.

## Development prerequisites

Expected later, once implementation begins:

- Current Xcode and Apple SDKs.
- An active Apple Developer Program membership for CloudKit entitlements and durable iPhone deployment.
- Node.js for the web companion and shared tooling.
- A Google Cloud OAuth client for Google Drive integration.
- A Vercel account for the optional web companion.

Do not add credentials, provisioning profiles, private keys, OAuth secrets, or user library files to Git.

## Contributor guidance

Read [CONTEXT.md](./CONTEXT.md) before working on the project. It contains the current product specification, architecture boundaries, privacy requirements, UI direction, sync semantics, non-goals, and unresolved decisions.

