# Glassleaf — Agent Context

This file is the canonical starting point for AI agents and contributors working on Glassleaf. Read it before proposing architecture, changing product behavior, or writing code. Keep it current as decisions are made.

## Project status

Glassleaf has a functional local-native MVP. Application code and repeatable Apple-platform checks exist; no deployment or cloud infrastructure exists.

The working product name is **Glassleaf**. The repository name is `glassleaf`.

### Implementation snapshot

- The universal SwiftUI project is generated from `apps/apple/project.yml` and targets iPhone, iPad, and Mac.
- `packages/domain` contains the provider-neutral Swift model and executable behavior checks.
- The application has an adaptive Home/library shell and a content-first, same-window Liquid Glass reader validated on Mac, iPhone Simulator, and iPad Simulator.
- The local catalog uses migrated SQLite/WAL storage and an FTS5 index; the prior JSON catalog is imported once and archived.
- EPUB import safely extracts publication resources, preserves originals, parses metadata/covers/navigation, and detects duplicates by SHA-256 and publication identifier.
- The local WebKit reader renders imported EPUB XHTML/resources offline with pagination/scrolling, TOC/search, position restore, bookmarks, annotations, and persisted appearance controls.
- Hierarchical folders, tags, collections, series, smart collections, Inbox, batch organization, recoverable Trash, metadata/custom-cover editing, and portable export are implemented.
- Formal domain tests, generated-EPUB/SQLite integration checks, macOS and generic iOS Simulator builds, and a 50,000-book indexed-search benchmark pass locally.
- Provider-neutral synchronization includes versioned opaque records, revisions, append-only reading events, an offline outbox, tombstones, recoverable conflicts, deterministic provider tests, a durable SQLite journal, and gated provider migration. The opt-in CloudKit adapter is implemented but still needs signed multi-device validation. Google Drive, web, and remote deployment have not started.

### Current direction (2026-09-06)

- Active development is on `feat/react-native-app`, with the Expo/React Native app in `apps/mobile`, shared SQLite model in `packages/library`, and stdio MCP server in `packages/mcp`.
- iOS and Android are first-class. Use the mobile README as the current implementation/validation reference; the Swift snapshot above describes the preserved legacy app.
- Reader priorities: EPUB, PDF, comics, manga RTL versus Western ordering, fast interaction, and a refined themeable UI. Organize story types independently from format, with overlapping collections/tags/series.
- Google Drive integration is prepared; live OAuth and signed two-device checks await client IDs. No Google project has been created. No Apple paid-account dependency for local Android development.
- External agents use MCP snapshot search and revision-checked organization plans, with in-app review and undo. No in-app AI.
- Native builds and simulator rendering do not establish physical-device performance or full legacy feature parity. See `apps/mobile/README.md` for explicit gaps.

## Product vision

Glassleaf is a private, polished EPUB library and reader for people who own or create DRM-free ebooks and want better organization than Apple Books without sacrificing an Apple-quality reading experience.

The product should feel:

- As simple and approachable as Apple Books.
- More capable at organizing sideloaded EPUB libraries.
- Native, restrained, fast, and content-first.
- Private by default, with no judgment or assumptions about library content.
- Beautiful on current Apple platforms through thoughtful Liquid Glass adoption.
- Reliable offline, with explicit and understandable sync behavior.

Glassleaf is not an ebook store. It is a reader and personal library manager.

## Product principles

1. **Reading comes first.** Library management must never make opening a book feel heavy.
2. **Private by default.** Do not inspect, classify, transmit, log, or analyze book contents unless a user explicitly invokes a local feature that requires it.
3. **User-controlled storage.** Users choose local-only, iCloud, or Google Drive storage.
4. **One active sync provider per library.** Never run iCloud and Google Drive as simultaneous authorities for the same library. Provide migration, backup, and export instead.
5. **Offline-first.** Imported and downloaded books remain readable without a network connection.
6. **Native restraint.** Use system patterns and Liquid Glass where they improve hierarchy and interaction. Avoid decorative glass everywhere.
7. **No lock-in.** Users must be able to export original EPUBs, covers, metadata, annotations, and reading history.
8. **Accessibility is core.** Dynamic Type, VoiceOver, keyboard navigation, contrast, and reduced motion are release requirements.
9. **Open source.** Clients, the core domain, portable library format, and sync specification are developed openly; the exact license remains to be selected.
10. **Two plans only.** Free is a complete local reader and library manager. Paid primarily funds the official managed Glassleaf Sync infrastructure.

## Target platforms

### Primary applications

- iPhone
- iPad
- macOS

Build these as a universal SwiftUI application where practical. Use platform-specific layouts and interactions instead of forcing identical interfaces everywhere.

### Platform baseline

- iOS 26 or later.
- iPadOS 26 or later.
- macOS 26 or later.
- Build with the latest stable Xcode and Apple SDKs available to the project.

These are intentionally the first platform releases with Liquid Glass. Glassleaf does not carry pre-Liquid-Glass compatibility code in its initial implementation; standard SwiftUI navigation and controls should provide the material by default, with custom glass reserved for floating, interactive chrome.

### Web companion

- Responsive browser library and reader.
- Hosted as a mostly static application on Vercel.
- May be installable as a PWA, but the PWA is a companion rather than the primary product.
- Must connect directly to the selected storage provider wherever possible.
- Vercel must not become the default storage or bandwidth proxy for EPUB files.

### Planned platform expansion

- Android
- Windows

These are accepted product targets after the portable sync model and managed Glassleaf Sync service are proven. Their applications must remain useful locally without requiring a paid account.

### Future possibilities, not initial commitments

- Linux

### Planned open ecosystem

- OPDS and Calibre interoperability.
- A documented portable sync protocol.
- A self-hostable sync implementation or compatible reference server after the managed protocol is stable.

## Core architecture

### Apple applications

- Swift and SwiftUI.
- SwiftData or an equivalent local persistence layer for the offline catalog and sync state.
- A local WebKit publication navigator behind a replaceable reader boundary; revisit a dedicated toolkit only when it provides a verified universal iPhone/iPad/Mac path without weakening portability.
- System frameworks for file import, drag and drop, share-sheet import, authentication, background tasks, and accessibility.
- Current Apple SDKs for Liquid Glass, with graceful behavior on older supported OS versions.

### Web companion

- TypeScript.
- A client-rendered application with an EPUB rendering spike before committing to a specific engine.
- Local IndexedDB cache for offline catalog data and downloaded books.
- Service worker for the application shell and explicitly downloaded titles.
- Responsive layouts that share product language with the native apps without pretending to be native SwiftUI.

### Vercel's role

Vercel hosts the web application shell, static assets, and only the minimal server endpoints that cannot safely run in the browser.

Vercel must not:

- Store the canonical ebook library.
- Proxy page turns or EPUB resources during normal reading.
- Receive plaintext book content for analytics or processing.
- Become a required dependency for native Apple-to-Apple syncing.

Page rendering happens locally. CloudKit or Google Drive traffic should go directly to the relevant provider when feasible. This keeps Vercel Hobby usage small and makes the native app useful even if the web companion is unavailable.

## Storage and sync providers

Glassleaf exposes storage as a provider abstraction. The target choices are:

1. Local only
2. iCloud
3. Google Drive
4. Glassleaf Sync

The choice belongs to a library, not necessarily to the whole installation. A future user may maintain multiple separate libraries with different providers, but each individual library has exactly one active authority.

### Provider protocol responsibilities

Each provider implementation must support, or explicitly declare that it cannot support:

- Account or container availability.
- Initial library creation.
- Listing and fetching the library manifest.
- Uploading and downloading publication assets and covers.
- Metadata, folder, tag, series, progress, bookmark, and annotation synchronization.
- Content hashing and deduplication.
- Tombstones for deletions.
- Conflict reporting and recovery.
- Provider migration export and import.
- Quota and offline-state reporting.

Provider-specific identifiers must not leak into the core domain model.

### Local-only provider

- Stores the catalog and assets only on the current device.
- Must support complete export and later migration to a cloud provider.
- Is a real supported mode, not a degraded error state.

### iCloud provider

- CloudKit private database is the preferred live-sync implementation.
- Store catalog records in CloudKit and EPUB/cover data as assets.
- Use the user's private iCloud database and quota.
- Native apps synchronize directly through CloudKit.
- The web companion uses CloudKit JS or CloudKit Web Services to access the same private database after iCloud authentication.
- CloudKit entitlements and web services require an active Apple Developer Program membership.

### Google Drive provider

- Use Google OAuth and the least-privilege `drive.file` scope wherever possible.
- Create a dedicated Glassleaf folder or app-managed file set.
- Store a versioned library manifest plus book and cover assets.
- Avoid requesting access to the user's entire Drive.
- Support native Apple applications and the web companion.
- Keep authentication tokens out of source control and logs.

### Glassleaf Sync provider

- Optional managed service for mixed-platform libraries spanning Apple, Android, Windows, Linux, and web.
- Included with the single Paid plan because book storage, transfer, history, and web access create recurring infrastructure costs.
- Local reading, organization, supported formats, annotations, accessibility, export, and direct-provider modes must not require this plan.
- Must support offline-first clients, complete export, account deletion, recoverable cloud Trash, version history, and transparent quotas.
- Encrypt transport and stored assets; complete an end-to-end-encryption feasibility and recovery study before launch.
- Must not inspect library content for advertising, recommendations, analytics, or model training.

### Provider switching and migration

Users may switch providers, but switching is a guided migration:

1. Pause mutations.
2. Produce and validate a complete portable snapshot.
3. Copy records and assets to the destination.
4. Verify counts, hashes, and required metadata.
5. Mark the destination as authoritative.
6. Leave the source unchanged until the user explicitly chooses cleanup.

Do not implement automatic two-way mirroring between iCloud and Google Drive. It creates split-brain conflict behavior and undermines user trust.

Google Drive may also be offered as a backup/export destination for an iCloud-backed library, but backup is not live sync.

## Sync behavior

- Every book asset has a stable Glassleaf identifier and content hash.
- Every mutable record has a schema version, updated timestamp, device identifier, and revision.
- Progress resolves to the most recently completed reading event, not the numerically largest percentage.
- Bookmarks and annotations merge by stable identifier.
- Deletions create tombstones so offline devices do not resurrect removed items.
- Metadata conflicts should be visible and recoverable. Preserve both values when confidence is low.
- Never silently discard a newer local annotation or imported EPUB.
- Sync must tolerate interruption, retries, duplicate requests, and a device returning after a long offline period.
- Maintain a human-readable sync status: synced, syncing, offline, conflict, provider unavailable, or quota exceeded.

## Privacy and security

- No ads.
- No social feed or public profiles.
- No library sharing in the initial product.
- No behavioral analytics by default.
- Never include book titles, folder names, tags, annotations, or content snippets in logs or crash reports.
- Request access only to files explicitly imported or managed by Glassleaf.
- Optional app lock with Face ID, Touch ID, or device authentication.
- Optional privacy mode that hides covers and titles in app switchers, widgets, notifications, and recent-item surfaces.
- Protect local caches using platform data protection and secure key storage.
- Investigate optional client-side encryption for Google Drive libraries. Clearly explain recovery consequences before enabling it.
- The web companion requires authentication before revealing catalog data.
- Secrets, provider keys, tokens, and signing material never enter Git.

## Domain model

The initial model should cover:

- `Library`: identity, name, active provider, schema version, preferences.
- `Book`: title, author, description, language, identifiers, dates, rating, status.
- `BookAsset`: EPUB location, content hash, size, media type, revision.
- `CoverAsset`: original and generated thumbnail information.
- `Series`: name, sort order, book membership and index.
- `Folder`: one primary hierarchical location per book where supported by product UX.
- `Tag`: multiple flexible labels per book.
- `SmartCollection`: saved predicates such as unread, recently added, favorites, or a tag combination.
- `ReadingProgress`: publication locator, percentage, timestamp, device, completed state.
- `Bookmark`: stable publication locator and optional label.
- `Annotation`: locator, selected text if the user permits storage, note, color, timestamps.
- `SyncRecord`: provider-independent sync state, remote revision, tombstone and conflict data.

Do not hard-code content categories. Users create their own folders and tags. Glassleaf must work equally well for fiction, fanfiction, research, comics, personal documents, or adult libraries.

## MVP product specification

### Import and library

- Import DRM-free EPUB files from Files, Finder, drag and drop, and share sheets.
- Preserve original files.
- Extract embedded metadata and cover locally.
- Edit title, author, cover, description, series, and series index.
- Detect likely duplicates using hashes and identifiers.
- Grid and list views.
- Search by title, author, series, folder, and tags.
- Sort by title, author, series, date added, last opened, and reading progress.
- Batch assignment to folders, tags, and series.
- Favorites, unread, reading, finished, and recently added states.

### Organization

- Hierarchical folders.
- Multiple tags.
- Series with explicit ordering.
- Smart collections based on metadata and reading state.
- Inbox for newly imported and unclassified books.
- Books may appear in multiple smart collections without duplicating assets.

### Reader

- Reflowable EPUB support.
- Planned DRM-free PDF, MOBI/PRC, AZW3/KF8, DjVu, FB2/FB2.ZIP, CBZ, CBR, and comic EPUB support, with per-format quality gates.
- Paginated and continuous vertical reading modes.
- Table of contents and chapter navigation.
- Font family, font size, line height, margins, alignment, and theme controls.
- Light, sepia, dark, and true-black themes.
- Search within a book.
- Reading progress and cross-device position sync.
- Bookmarks, highlights, and notes.
- Restore position reliably after app termination or device switching.
- Offline reading.
- Sensible handling of malformed EPUBs with actionable errors.
- Use curated light, paper/sepia, dark, and true-black themes; a user-authored theme builder is deferred.
- Specialized vertical Japanese/Chinese text layout and language-specific CJK typography are not product targets.

### Sync and portability

- Provider selection during onboarding.
- Local-only, iCloud, and Google Drive modes.
- Visible sync status and manual sync control.
- Export original EPUBs individually or in bulk.
- Export a complete portable Glassleaf library snapshot.
- Guided provider migration.

### Web companion

- Authenticated catalog.
- Reading, progress updates, folders, tags, and search.
- Responsive desktop and mobile web layouts.
- Optional offline caching for selected books.
- No requirement that native apps contact Vercel.

## UI and interaction direction

The benchmark is **Apple Books, but calmer and substantially better organized**.

### Visual language

- Native typography and SF Symbols.
- Edge-to-edge content with clear hierarchy.
- Liquid Glass for navigation, toolbars, inspectors, and transient controls.
- Covers and text provide the color; application chrome remains restrained.
- Avoid excessive gradients, glowing borders, oversized pills, floating cards, and gratuitous animation.
- Dark mode is a first-class design, not an inversion pass.
- Use spring motion only where it communicates continuity or direct manipulation.

### Primary surfaces

1. **Home** — Continue Reading, Recently Added, Favorites, and user-selected smart sections.
2. **Library** — Grid/list toggle, search, sort, filter, batch selection.
3. **Sidebar** — Library, folders, tags, series, smart collections, sync status.
4. **Book detail** — Cover, metadata, progress, series position, organization, read button.
5. **Reader** — Content-dominant canvas with auto-hiding controls.
6. **Settings** — Reading defaults, privacy, storage provider, sync, backup, accessibility.

### Platform adaptation

- iPhone: compact navigation, bottom controls, one-handed interactions.
- iPad: sidebar plus library/detail layouts, keyboard and pointer support.
- Mac: `NavigationSplitView`, menu commands, context menus, drag and drop, multiwindow support.
- Web: responsive sidebar and reader; do not imitate unavailable native effects poorly.

### Accessibility and motion

- Full Dynamic Type support without clipped controls.
- VoiceOver labels and logical focus order.
- Keyboard access for all major library and reader actions.
- Respect Reduce Motion, Reduce Transparency, and Increase Contrast.
- Touch targets meet Apple guidance.
- Avoid motion that delays page turns or obscures reading state.

## Explicit non-goals for the initial product

- Ebook marketplace or purchasing.
- DRM removal or circumvention.
- Public book hosting or distribution.
- Social profiles, lending, or sharing.
- Automated content classification.
- AI reading summaries or content uploads.
- Simultaneous two-way iCloud and Google Drive authority for one library.
- Storing the canonical library on Vercel.
- Supporting every document format before EPUB quality is excellent.
- Specialized vertical Japanese or Chinese reading layouts.
- A custom theme editor in the current roadmap.

## Suggested delivery phases

### Phase 0 — Technical spikes

- Define the format-neutral publication interface and spike PDF and comic rendering on Apple platforms.
- Validate CloudKit private records and EPUB assets.
- Validate CloudKit JS access to the same private library.
- Define the provider-neutral manifest and conflict model.
- Prototype Liquid Glass library and reader chrome.

### Phase 1 — Local native MVP

- Import, catalog, organize, and read EPUBs locally.
- Deliver excellent reader controls and offline behavior.
- No cloud dependency.

### Phase 2 — Organization and reliability hardening

- Stable ID-based tag and series membership, editable smart collections, complete batch actions, and visible persistence errors.
- Accessibility, malformed-file, migration, backup/restore, and real-device testing.

### Phase 3 — Provider-neutral sync foundation

- Versioned portable manifest, stable locators, revisions, tombstones, conflicts, offline outbox, and migration protocol.
- Complete portable snapshot restore and deterministic provider tests before a cloud provider becomes authoritative.

### Phase 4 — iCloud provider

- CloudKit synchronization, conflicts, migration, recovery, and multi-device Apple testing.

### Phase 5 — PDF, comics, and additional formats

- PDF, CBZ, and CBR using shared fixed-page foundations and a dedicated comic experience.
- MOBI/PRC, DRM-free AZW3/KF8, FB2/FB2.ZIP, and DjVu behind the publication boundary.

### Phase 6 — Google Drive provider

- Google Drive OAuth, dedicated file set, sync, and provider migration. This work is now prioritized ahead of iCloud validation; the phase numbering below records the original roadmap.

### Phase 7 — Glassleaf Sync and web reader

- Vercel-hosted web catalog and reader.
- CloudKit, Google Drive, and managed Glassleaf Sync support where feasible.
- Managed cross-platform storage, progress, organization, bookmarks, annotations, history, and recovery.

### Phase 8 — Android and Windows

- Local/offline applications that do not require a Glassleaf account.
- Optional Glassleaf Sync for mixed-device libraries.

### Phase 9 — Hardening and ecosystem

- Accessibility audit.
- Sync chaos and offline testing.
- Privacy review.
- Large-library performance testing.
- Export/restore disaster-recovery testing.
- OPDS, Calibre, knowledge-export, and e-ink interoperability work.

## Engineering expectations

- Prefer narrow, verifiable changes over broad rewrites.
- Preserve unrelated work in a dirty worktree.
- Add tests in proportion to sync and data-loss risk.
- Never claim a platform or provider was verified unless it was actually exercised.
- Use fixtures that contain public-domain or generated text, never a user's private library.
- Treat sync migrations and deletion as destructive operations requiring previews and recovery paths.
- Do not deploy, create cloud resources, enable paid services, or change external accounts without explicit user approval.
- Keep customer-facing naming as `Glassleaf` and technical identifiers lowercase where appropriate.
- Keep source, protocol, and format documentation suitable for public open-source development; never commit user data or operational secrets.

## Decisions still open

- Whether CloudKit integration uses a custom sync layer or framework-assisted persistence. Local persistence is SQLite with WAL and FTS5.
- Final web EPUB rendering engine.
- Whether Google Drive content encryption is default, optional, or deferred.
- Native app distribution strategy: private device install, TestFlight, unlisted App Store, or public App Store.
- Exact Glassleaf Sync quotas and pricing. The product principle is settled: basic local reading and library features remain free; recurring infrastructure may be paid.
- Exact open-source license and which official-service deployment components, if any, remain operational rather than distributable source.
- Final brand, icon, domain, and trademark clearance for Glassleaf.
