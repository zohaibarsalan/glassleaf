# Reader adoption backlog

Authorized September 6, 2026: adopt the useful behavior from Apple Books, Readium/Thorium, KOReader, Mihon, Panels, BookFusion, Calibre and Zotero within Glassleaf's design. Reference: the comparison in this conversation and existing research documents. This is a delivery checklist, not a claim that these capabilities already exist.

- [x] Reading presets: typography, spacing, margins, independent paper colors, publisher styling.
- [x] Versioned EPUB text anchors and highlights with legacy locator migration (iOS simulator verified).
- [ ] Precise passage search navigation and complete reflow/Android validation.
- [ ] Footnote previews, dictionary lookup, annotation export and source backlinks.
- [x] Comic thumbnail page overview; numbered next-volume lookup without crossing story type, language or format.
- [ ] Manga fit modes, shared series preferences and bounded prefetch.
- [ ] Webtoon long-image handling; border crop and wide-page splitting.
- [x] Native PDF outline navigation, including night mode.
- [ ] PDF thumbnails, text search/selection, annotations and crop.
- [ ] Readium prototype on iOS and Android, compared against the real corpus before engine replacement.
- [ ] Work/edition relationships, hierarchical metadata and bulk cleanup with preview/undo.
- [x] MCP reasons, source references, optional confidence and per-change exclusions in plan review.
- [ ] Persistent review queue and reusable accepted organization rules.
- [ ] OPDS catalog browsing, selective offline downloads and recovery.
- [ ] Two-device sync, offline/conflict verification (live Drive requires user's OAuth setup).
- [ ] VoiceOver/TalkBack and physical-device release performance checks.

Already present: nested saved views, overlapping collections, ordered reading lists, community app themes, basic EPUB/PDF/CBZ readers, PDF night mode, metadata organization plans with stale-revision protection and undo. These should be extended, not rebuilt unnecessarily.

## September 6 implementation evidence

First delivery: reading appearance presets and independent paper colors; versioned text anchors with legacy locator migration; EPUB text highlights; annotations list and JSON export; same-document semantic footnote previews; explicit online dictionary lookup; comic thumbnail overview.

Verified on iPhone 17 Pro Max simulator (iOS 26.5): Sepia and sans serif, text-size change, selecting and highlighting a word in the downloaded Gutenberg Alice EPUB, opening its source from the annotations list, and preserving the visible highlight after stopping/relaunching the app. Native PDF/comic/Japanese compatibility evidence from the preceding delivery remains in `docs/compatibility/2026-09-06-reader-fixes.md`.

Workspace typecheck and library/MCP/theme checks pass. Focused locator checks cover existing page:fraction migration, anchored round trips, malformed locations and invalid preferences. Not yet verified: Android highlight support, cross-chapter footnotes, full annotation export/share interaction, deep reflow restoration, or the new comic overview. The larger grouped checklist items remain open intentionally.

Additional implementation and verification: `docs/compatibility/2026-09-06-reader-adoption.md`.
