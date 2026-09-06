# Organization rebuild — September 6, 2026

Implements the core model corrections from [the broader system review](research/2026-09-06-broader-system-review.md), preserving the existing React Native readers and semantic theme system.

## Product behavior

- Home shows explicitly pinned smart views and uses reading timestamps, so metadata cleanup does not reorder Continue reading.
- Organize separates series, collections, ordered reading lists, smart views, tags and story types. Series opens its volumes in order. Lists keep their own order across unrelated series without duplicating books.
- Nested all/any rules support Japanese AND (manga OR light novel), with exclusions. Contextual tag/collection choices come from the current result scope.
- A smart view retains its collection/list/series scope. Full-text search can run everywhere, inside the current view or inside the reader's book.
- Collection/tag rename and merge update membership and matching saved rules atomically. Structure undo checks for intervening edits before restoring the entire batch.
- External agents can inspect organization and prepare revision-checked view/list plans. The app reviews and applies plans; no in-app AI service was added.

## Storage and migration

Existing book IDs and files stay intact. Legacy saved views become revisioned organization records; existing collection memberships create collection identities. An indexed facet projection supports tags and collections. Ordered list positions live in a separate membership table. The redundant metadata FTS table is removed; discovery serves metadata and content search.

Nested rules are bounded and validated at the boundary, with parameterized SQL. Lists are limited to 10,000 unique book IDs. Organization edits and book metadata edits retain separate revision checks and undo histories; collection/tag changes record both in one transaction.

Organization sync uses the existing immutable Drive batch transport, durable outbox, tombstones and exact-record acknowledgement. Equal-revision concurrent records select a deterministic winner and retain the losing version. This is whole-record conflict resolution, not per-position collaborative list merging. Live Drive authentication and multi-device testing remain blocked on OAuth setup.

EPUB indexing uses durable pending/done/unavailable jobs, processes eight jobs per fetch, yields between chapters and rejects work from replaced assets. Missing/oversized files can be retried. It does not rescan the whole catalog on every restart.

## Verification

- Strict TypeScript and formatting pass. Eleven focused catalog tests cover migration, nested/scoped queries, reading-list order, stale edits, merge/tombstones/acknowledgement, collection merge/undo, reading recency, and interrupted/replaced chapter jobs. MCP client/server checks cover scoped snapshot search and both plan formats; theme import/contrast checks pass.
- The 10,000-record mixed-format host fixture exercises paging, FTS, nested scope and contextual facets/counts in 39.3 ms on the final run. This is a combined host SQLite timing, not a phone latency percentile or frame-rate benchmark.
- iPhone 17 Pro Max / iOS 26.5 Simulator: native journeys passed reading-list creation/reordering/scoped search, collection rename/undo, series metadata/browsing, and CBZ page jump/next/RTL swipe/spreads/zoom/scroll. Nested-view creation/pinning/restart and scoped EPUB passage opening were verified in segments; selector corrections are retained in the flow. EPUB prose was asserted before reader capture. The final book-search journey passed selecting a specific book, entering Find in this book, verifying its scope, and searching its chapter text.
- Android arm64 release build passed and APK signature verification passed. Artifact: `outputs/react-native/Glassleaf-android-arm64-organization.apk`. SHA-256: `8dfe38d473e191b58a4643b9eb769970e5a197b0857ed5baf6c7094d19514533`.
- Native screenshots are preserved in `docs/ui-gallery/2026-09-06-organization-rebuild`. The phone-friendly gallery retains earlier revisions.

Issues found and corrected during verification: reading-list keyboard dismissal, Home hiding pinned views below too many continued books, scoped-search copy, stale editor revision capture, and a nested book-options button hidden from native accessibility. Some Maestro runs lost their XCTest connection; those failed runs are not counted as passing.

## Remaining limits

No physical-device frame-time or battery claim. Android interaction verification requires a connected device or emulator. Hierarchical collection trees, dedicated editable series records, duplicate-resolution UI, PDF text extraction, comic OCR, Japanese linguistic segmentation, exact passage highlighting and arbitrary dashboard stream reordering are not part of this change. Series grouping currently derives from book metadata. Existing EPUB/PDF/CBZ support does not imply CBR support or compatibility with every third-party archive.
