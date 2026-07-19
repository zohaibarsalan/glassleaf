# Glassleaf Feature Catalogue

This document defines the intended Glassleaf product surface. It is the canonical feature roadmap, not a claim that every item is implemented today. `CONTEXT.md` remains authoritative for architecture and engineering constraints.

## Status vocabulary

- **Shipped** — implemented in the local Apple application and covered by repository checks.
- **Next** — part of the next product-quality pass or format expansion.
- **Planned** — accepted product scope, but not scheduled ahead of the current reliability work.
- **Explore** — valuable, but requires a technical or product spike before commitment.
- **Not targeted** — explicitly outside current product direction.

## Product promise

Glassleaf should become the best private reader and personal-library manager for books people already own.

It combines:

- The restraint and approachability of Apple Books.
- Better organization than Apple Books or Yomu.
- The cross-platform continuity of BookFusion.
- The format breadth of KOReader, Librera, ReadEra, KyBook, and FBReader.
- The comic-library quality of Panels.
- Complete offline use, portable data, and user-controlled storage.
- A business model that charges primarily for optional infrastructure, not basic reading.

Glassleaf is not a bookstore, social network, recommendation feed, or DRM-circumvention tool.

## Open-source model

Glassleaf is an open-source product.

- The client applications, core domain model, publication interfaces, portable library format, and sync specification should be developed in public.
- Users must be able to inspect how their library is stored, migrated, encrypted, and synchronized.
- Community contributions, independent builds, accessibility fixes, format adapters, and provider integrations are welcome.
- The exact open-source license is still to be selected. Do not describe Glassleaf as using a particular license until that decision is recorded.
- A self-hostable implementation of the portable sync protocol is planned. The official paid service sells reliable hosting and convenience, not exclusive ownership of the protocol.

Open source does not weaken the privacy boundary: fixtures must remain generated or public domain, and user libraries, credentials, signing material, and production secrets never enter the repository.

## Plans and pricing principles

Glassleaf has exactly two user-facing plans: **Free** and **Paid**. Avoid intermediate tiers, format packs, per-platform purchases, and small feature paywalls.

### Free

Free is a complete reader and library manager, not a trial. The target is for the following to remain free:

- Local libraries on every supported platform.
- Importing and reading every supported DRM-free format.
- Offline reading.
- Reader appearance controls and curated themes.
- Folders, tags, collections, series, smart collections, search, and batch organization.
- Metadata and cover editing.
- Progress, bookmarks, highlights, and notes stored locally.
- Annotation and library export.
- Accessibility functionality.
- Backup and restore to local files.
- Direct synchronization through a user's own iCloud or Google Drive account where the platform permits it.
- Native applications that can be used without a Glassleaf account.
- OPDS, Calibre, and self-hosted connectivity when those integrations ship.
- On-device text to speech using system voices.
- Security and privacy controls that run locally.

There should be no advertising, sponsored books, paid format codecs hidden behind artificial limits, or paywall on exporting a user's own data.

### Paid

Paid primarily provides the official managed **Glassleaf Sync** service and other functionality that creates recurring infrastructure cost:

- Managed cross-platform book storage.
- Synchronization among Apple, Android, Windows, Linux, and web clients.
- Web-reader access to a managed library.
- Version history and recoverable cloud trash.
- Higher storage and transfer quotas.
- Background conversion or compatibility processing that cannot run reasonably on-device.
- Future household sharing, only if added with explicit privacy controls.
- Service monitoring, managed migrations, and account recovery mechanisms appropriate to encrypted libraries.

Paid must not unlock better rendering, additional file formats, basic organization, local annotations, accessibility, or export. Those belong to Free.

The apps remain useful locally without Paid. The paid service charges for hosted storage, transfer, availability, history, and operational convenience. A small free Glassleaf Sync allowance or trial may be explored, but it must not create a third plan and no quota is committed yet.

### Plan comparison

| Capability | Free | Paid |
| --- | --- | --- |
| Local and offline reading | Included | Included |
| All supported DRM-free formats | Included | Included |
| Folders, tags, collections, series, and smart collections | Included | Included |
| Search, metadata editing, annotations, local TTS, and accessibility | Included | Included |
| Local backup, complete export, OPDS, and Calibre integrations | Included | Included |
| User-owned iCloud or Google Drive synchronization | Included where supported | Included |
| Self-hosted synchronization | Planned | Planned, but unnecessary when using managed sync |
| Official Glassleaf-hosted cross-platform synchronization | Not included beyond any future starter allowance or trial | Included |
| Hosted book storage, transfer, web access, history, and recovery | Not included | Included according to plan limits |

The plan name may eventually be branded differently, but the product structure remains two plans only.

## Platforms

| Platform | Status | Product role |
| --- | --- | --- |
| iPhone | **Shipped** local MVP | First-class native reader and library |
| iPad | **Shipped** local MVP | First-class native reader, library, keyboard, pointer, and multitasking experience |
| macOS | **Shipped** local MVP | First-class native reader, bulk import, metadata editing, and library management |
| Web | **Planned** | Responsive authenticated library and reader; optional PWA and offline downloads |
| Android | **Planned** | First-class local/offline reader with optional Glassleaf Sync |
| Windows | **Planned** | Desktop reader and large-library manager with optional Glassleaf Sync |
| Linux | **Explore** | Desktop client or high-quality web/PWA path after Windows |
| E-ink readers | **Explore** | Prefer OPDS, Calibre, KOReader, or device integrations before maintaining separate firmware apps |

Platform expansion is a product commitment, but it follows a stable local catalog, portable format model, and tested sync protocol. A shared product language does not require identical UI frameworks on every platform.

## Supported formats

All support below is for DRM-free content unless Glassleaf later adopts a legitimate licensed DRM system. Glassleaf will never remove or bypass DRM.

### Text and reflowable books

| Format | Status | Required quality |
| --- | --- | --- |
| EPUB 2/3 reflowable | **Shipped**, continuing improvement | Metadata, covers, TOC, links, images, CSS, search, annotations, position restore, pagination, scrolling |
| EPUB 3 fixed layout | **Planned** | Correct spreads, zooming, media, page navigation, and orientation behavior |
| MOBI/PRC | **Planned** | Metadata, cover, TOC, reflow, search, annotations, and export of original file |
| AZW3/KF8 | **Planned** | Same quality bar as MOBI for DRM-free files; no Kindle DRM support |
| FB2/FB2.ZIP | **Planned** | Metadata, cover, sections, footnotes, images, reflow, and annotations |
| TXT, HTML, RTF | **Explore** | Useful import formats after the requested core formats are reliable |

### Documents

| Format | Status | Required quality |
| --- | --- | --- |
| PDF | **Next** | Fast rendering, thumbnails, outline, search, bookmarks, highlights/notes where text exists, page crop, zoom, two-page mode, Apple Pencil on supported devices |
| DjVu | **Planned** | Fast page rendering, thumbnails, outline, search when a text layer exists, crop, zoom, and bookmarks |

PDF reflow and OCR are valuable but should be explored separately; they must not delay a high-quality standard PDF reader.

### Comics and image books

| Format | Status | Required quality |
| --- | --- | --- |
| CBZ/ZIP | **Next** | Fast archive indexing, image prefetch, single/double page, fit modes, crop, progress, metadata, and thumbnails |
| CBR/RAR | **Next** | Same experience as CBZ using a safe, maintained decompressor |
| CB7/7z and CBT/TAR | **Planned** | Same comic-reader experience after CBZ/CBR |
| Comic EPUB | **Planned** | Fixed-layout/image EPUB routed to the appropriate reader |

Comic reading should include:

- Single-page and two-page spreads.
- Cover-aware spread pairing.
- Fit width, fit height, fit page, and original-size zoom.
- Optional crop and background-color behavior.
- Page thumbnails and fast scrubber.
- Reading-progress synchronization.
- Series and volume ordering.
- ComicInfo metadata where present.
- Optional reverse page order as a comic navigation control.
- OPDS compatibility with Calibre, Komga, Kavita, and similar servers.

Reverse comic page order does not imply a commitment to specialized Japanese typography.

### Explicit language/layout scope

- Specialized vertical Japanese and Chinese text layout is **not targeted**.
- Language-specific CJK dictionaries, typography tuning, and vertical-writing QA are **not targeted**.
- Standards-compliant horizontal text may render through the normal engine, but it is not a release gate.
- User-created theme builders and arbitrary theme editors are **deferred**, not part of the current roadmap.
- Glassleaf will instead ship a small, excellent set of curated light, paper/sepia, dark, and true-black themes.

## Import and connectivity

### Local import

- **Shipped:** Files/Finder import, drag and drop, open/share-sheet import, multi-file EPUB import.
- **Shipped:** Preserve the original file and extract metadata, cover, TOC, reading order, identifiers, and content hash locally.
- **Shipped:** Hash and publication-identifier duplicate detection.
- **Next:** Folder import with recursive discovery and a review screen.
- **Next:** Import queues that survive backgrounding and report per-file failures.
- **Planned:** Watch folders on desktop.
- **Planned:** Browser download handoff.

### Library sources

- **Planned:** OPDS 1/2 browsing, authentication, download, and refresh.
- **Planned:** Calibre Content Server support.
- **Planned:** Official Calibre desktop plugin for metadata, cover, file, series, and reading-state exchange.
- **Explore:** Komga and Kavita integrations through OPDS before proprietary APIs.
- **Explore:** WebDAV and SMB as advanced file sources.
- **Explore:** Local Wi-Fi library server for transfer without cloud storage.

Cloud file pickers such as iCloud Drive, Google Drive, Dropbox, and OneDrive can be offered as import sources independently of live library synchronization.

## Library management

### Core organization

- **Shipped:** Hierarchical folders with one primary folder per book.
- **Shipped:** Multiple tags per book.
- **Shipped:** Multiple manual collections per book.
- **Shipped:** Series name and decimal position.
- **Shipped:** Smart collections based on organization, metadata, favorites, and reading state.
- **Shipped:** Inbox for unclassified imports.
- **Shipped:** Favorites, unread, reading, finished, recently added, and recoverable Trash.
- **Shipped:** Grid and list layouts.
- **Shipped:** Search across title, author, series, tags, folder, and collections.
- **Shipped:** Sorting by recent import, last opened, title, author, series, and progress.
- **Shipped:** Batch folder, tag, collection, series, and trash actions.

### Organization improvements

- **Shipped:** Stable ID-based tag and series membership, including migration of legacy name-based references.
- **Shipped:** Series rename, cover selection, ordering, deletion, and book membership management.
- **Next:** Series merge and batch position tools.
- **Shipped:** Edit existing smart-collection rules and safely combine multiple reading states.
- **Next:** Fully editable nested all/any/not smart rules. Existing advanced nested rules are preserved when using the current editor.
- **Shipped:** Batch add, remove, and replacement workflows for folders, tags, collections, and series.
- **Shipped:** Hierarchical folder paths in assignment pickers and menus.
- **Next:** Manual ordering and sidebar reordering.
- **Next:** Expose the existing tag-color model consistently in editors, filters, and detail views.
- **Shipped:** Surface persistence failures instead of silently discarding them.
- **Planned:** Automatic import rules based on filename, source folder, embedded metadata, author, series, or existing tags.
- **Planned:** Duplicate review and safe merge workflow.
- **Planned:** Missing-file and malformed-metadata repair center.
- **Planned:** Bulk metadata and cover editing.
- **Planned:** Custom columns on desktop for advanced libraries.

### Discovery without content surveillance

- Saved searches and smart shelves.
- Filter combinations across tags, folders, collections, author, series, format, language, dates, rating, reading state, and progress.
- User-selected Home sections.
- Random/unread-next actions for large libraries.
- Reading history and optional local statistics.

Glassleaf must not automatically classify or upload book contents. Metadata-based organization rules run locally unless a user explicitly invokes a hosted operation.

## Metadata

- **Shipped:** Edit title, author, description, language, series, position, folder, tags, collections, cover style, and custom cover.
- **Planned:** Publisher, publication date, subjects/genres, ISBN and other identifiers, rating, and user status.
- **Planned:** Multiple authors with roles.
- **Planned:** Per-format metadata adapters including EPUB package data, ComicInfo, FB2, PDF information, MOBI/AZW3, and DjVu metadata.
- **Planned:** Restore imported metadata and cover without reimporting the whole book.
- **Planned:** Optional write-back or export-as-copy; never silently rewrite the user's original file.
- **Explore:** TOC repair/editor for formats where safe and practical.

## Reader experience

### Shared behavior

- Open locally and work fully offline.
- Restore the exact stable position after termination or device switching.
- Table of contents, chapter/page navigation, progress, named bookmarks, and history/backlink navigation.
- Search within supported text and text-layer documents.
- Select, copy, define, translate, share, highlight, and annotate text where the format permits.
- Fast image zoom and save/share controls where permitted.
- Auto-hiding, content-first controls.
- Keyboard, pointer, trackpad, touch, and platform-appropriate gesture support.
- Multiple windows on desktop/tablet where useful.
- Actionable errors for malformed or unsupported files.

### Reflowable appearance

- **Shipped:** Paginated and continuous vertical modes.
- **Shipped:** Font family, size, line height, margins, alignment, and curated themes.
- **Planned:** Paragraph spacing, indentation, hyphenation, column count, content-width limit, and publisher-style override levels.
- **Planned:** Per-book preferences plus reusable global defaults.
- **Planned:** Footnote popovers and reliable return-to-reading-position links.
- **Deferred:** User-authored themes and arbitrary theme builders.

### PDF and DjVu behavior

- Page and spread navigation.
- Thumbnail rail and outline.
- Fast zoom, crop, rotation, and fit presets.
- Text-layer search, selection, highlighting, and notes.
- Freehand Apple Pencil/stylus annotation where supported.
- Optional OCR and reflow only after separate quality and privacy evaluation.

### Comic behavior

- Dedicated image pipeline rather than treating comics as ordinary PDFs.
- Low-memory prefetching and instant adjacent-page navigation.
- Spread logic, page-direction control, crop, fit, page filters, thumbnails, and progress.
- Series/volume navigation directly from the reader.
- No panel-detection or AI-guided view in the initial comic release.

## Highlights, notes, and knowledge workflows

- **Shipped:** Multiple highlight colors, notes, bookmarks, and navigation back to the source location for EPUB.
- **Planned:** Library-wide highlight and note hub.
- **Planned:** Search, filter, sort, tag, and batch-export annotations across books.
- **Planned:** Export text, Markdown, JSON, CSV, HTML, and PDF.
- **Planned:** Stable Markdown export suitable for Obsidian and similar tools.
- **Planned:** Readwise integration using an explicit user action and token.
- **Planned:** Apple Shortcuts/App Intents for finding books, opening books, continuing reading, and exporting annotations.
- **Explore:** Flashcards or vocabulary lists as optional study tools, not core navigation.

## Text to speech and audio

- **Planned:** On-device text to speech using system voices.
- Play, pause, seek by sentence/paragraph, speed, voice, sleep timer, and background playback.
- Highlight the currently spoken text when technically reliable.
- Resume listening from the synchronized reading position.
- Respect pronunciation, accessibility, interruption, lock-screen, and audio-route behavior.
- **Explore:** EPUB Media Overlays and packaged audiobooks.
- **Explore:** Optional high-quality hosted voices only with explicit consent, clear costs, and a privacy review.

Basic TTS must not require a subscription when the operating system supplies the voice locally.

## Accessibility

- Dynamic Type and scalable non-reader UI.
- Screen-reader labels, logical order, rotor/navigation support, and meaningful progress values.
- Keyboard access to every major library and reading action.
- Switch Control and Voice Control compatibility on Apple platforms.
- Reduced Motion, Reduce Transparency, Increase Contrast, and bold-text support.
- Line Guide/focus ruler with adjustable line count and dimming.
- Read-aloud support with synchronized visual focus where possible.
- Large-print presets and generous maximum sizes.
- Accessible error messages for malformed files and failed synchronization.
- EPUB accessibility metadata inspection displayed as information, not used to judge or block books.

Accessibility is part of the free core and a release gate, not a premium feature.

## Sync and storage

Every library has one active authority. The supported target choices are:

1. **Local only** — no account and no network dependency.
2. **iCloud** — direct Apple-to-Apple synchronization using the user's private iCloud storage.
3. **Google Drive** — direct provider synchronization using least-privilege access where feasible.
4. **Glassleaf Sync** — the optional managed service included with Paid, intended for Android, Windows, web, Linux, and mixed-device households.

### Data synchronized

- Original book files and covers when asset sync is enabled.
- Metadata and organization.
- Reading position and reading state.
- Bookmarks, highlights, notes, and annotation tags.
- Reader preferences where portable.
- Deletion tombstones, revision history, and conflict records.

### Required sync behavior

- Offline-first mutation queue.
- Stable IDs and content hashes.
- Deduplication and idempotent retries.
- Visible state: synced, syncing, offline, conflict, unavailable, or quota exceeded.
- Human-readable conflict resolution for metadata.
- Merge bookmarks and annotations by stable identity.
- Never choose the numerically largest progress as a substitute for the newest valid reading event.
- Recoverable cloud trash and version history for managed sync.
- Guided migration between providers; never silently mirror two authorities.
- Complete portable export before destructive migration.

### Provider-neutral foundation

The portable sync model is implemented and tested before any provider adapter becomes authoritative. It includes:

- A versioned manifest and record schema independent of CloudKit, Google Drive, or Glassleaf Sync identifiers.
- Stable publication locators, content hashes, mutation identifiers, record revisions, device identifiers, and timestamps.
- A durable offline outbox with idempotent replay.
- Tombstones and explicit conflict records.
- Deterministic merge behavior for metadata, progress events, bookmarks, annotations, and organization records.
- A provider protocol exercised first by an in-memory or local test provider.
- Portable snapshot restore and validation before provider migration is enabled.

### Managed-sync privacy target

- Encrypt transport and stored assets.
- Explore end-to-end encryption with keys held by user devices before launch.
- Never use book content, titles, tags, folders, or annotations for advertising or model training.
- Keep sensitive metadata out of logs and crash reports.
- Separate account/billing data from library content wherever practical.
- Provide account deletion and complete library export.
- Vercel may host the web shell, but normal page turns must read from local cache or object storage rather than proxying book contents through serverless functions.

## Privacy and safety controls

- Optional Face ID, Touch ID, device authentication, or application PIN.
- Privacy mode that hides titles, covers, excerpts, and annotations in app switchers, widgets, notifications, Spotlight, and recent-item surfaces.
- Configurable local search indexing.
- No content-based recommendations or automatic remote analysis.
- No public profile, social feed, or default sharing.
- Clear destructive-action previews and recoverable Trash.
- Complete export of books, metadata, organization, progress, bookmarks, highlights, and notes.

## Performance and reliability targets

- Libraries of at least 50,000 catalog records remain searchable and navigable.
- Opening a downloaded book never depends on network availability.
- Adjacent EPUB chapters and comic pages feel immediate through bounded preloading.
- Import, extraction, hashing, indexing, thumbnailing, OCR, and conversion do not block the main UI.
- Large files use streaming I/O and bounded memory.
- Database migrations are transactional, resumable where necessary, backed up, and tested.
- Sync and provider migration receive chaos, interruption, duplicate-request, and long-offline-device testing.
- Corrupt or unsupported books fail individually without damaging the catalog.

## Delivery sequence

This order protects reading quality and user data while expanding scope:

1. **Harden the shipped Apple EPUB MVP** — portable restore, migration safety, durable import jobs, accessibility, malformed EPUBs, and real-device testing.
2. **Finish the remaining organization work** — series merge/batch positions, editable nested smart rules, tag-color UI, and manual organizer ordering.
3. **Portable provider-neutral sync foundation** — versioned manifest, locators, revisions, offline outbox, conflicts, tombstones, migration, recovery, and deterministic provider tests.
4. **iCloud vertical slice** — metadata and organization first, then progress/annotations, then optional assets, followed by conflict and multi-device testing.
5. **PDF and comics** — PDF, CBZ, CBR, shared fixed-page reader foundations, and comic-specific UX.
6. **Additional reflowable formats** — MOBI, DRM-free AZW3, FB2, followed by DjVu.
7. **Google Drive provider** — implement the second direct provider only after iCloud proves the provider contract and migration behavior.
8. **Paid Glassleaf Sync and web reader** — official managed cross-platform authority and responsive reader.
9. **Android and Windows** — local/offline clients plus optional Glassleaf Sync.
10. **Ecosystem integrations** — OPDS, Calibre, KOReader/e-ink interoperability, Readwise, and knowledge exports.

Formats are added behind a shared publication interface, but each format must pass its own import, rendering, navigation, annotation, accessibility, export, and malformed-file tests. “File opens” does not count as complete support.

## Competitive lessons

Glassleaf should learn from competitors without inheriting their complexity:

- **Yomu:** clean Apple-native reading, folders/tags, batch editing, per-book settings, Shortcuts, and portable annotation export.
- **BookFusion:** cross-platform continuity, Calibre integration, smart shelves, annotation hub, and web reading.
- **MapleRead:** deep typography, TTS/immersion reading, vocabulary, and serious note management.
- **KOReader:** format breadth, speed on constrained devices, OPDS/Calibre support, and extensibility.
- **Thorium:** accessibility, EPUB 3/DAISY quality, and Windows/macOS/Linux reach.
- **FBReader:** broad platform and reflowable-format support.
- **Librera and ReadEra:** reliable “open almost anything” behavior on Android.
- **KyBook:** metadata tools, storage connectors, search, and folder-tree organization.
- **Panels:** dedicated comic UX, cloud-folder libraries, OPDS, and progress synchronization.
- **PocketBook:** phone, web, and e-ink continuity.
- **Apple Books:** restraint, system integration, Line Guide, and low-friction reading.

## Research references

Feature decisions were informed by current official product documentation accessed in July 2026:

- [Yomu guide](https://www.yomu-reader.com/support/guide/get-started/)
- [BookFusion documentation](https://docs.bookfusion.com/docs/)
- [MapleRead overview](https://www.maplepop.com/web/mr/overview.php)
- [KOReader repository](https://github.com/koreader/koreader)
- [Thorium Reader](https://thorium.edrlab.org/en/)
- [FBReader formats](https://fbreader.org/en/book-formats)
- [Librera](https://librera.mobi/)
- [KyBook 3](https://apps.apple.com/us/app/kybook-3-ebook-reader/id1348198785)
- [Panels](https://www.panels.app/)
- [PocketBook Reader](https://pocketbook.ch/en-ch/app)
- [Apple Books guide](https://support.apple.com/guide/iphone/read-books-iphc1af7c57/ios)

## Final scope guard

Glassleaf should be broad without becoming cluttered. Advanced capabilities belong in contextual menus, inspectors, and optional settings; the default path remains import, organize, open, and read. Every new feature must preserve privacy, offline use, exportability, accessibility, and the calm native interface.
