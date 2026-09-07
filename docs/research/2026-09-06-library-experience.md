# Glassleaf: calm navigation, powerful retrieval

Research and implementation direction, 2026-09-06.

## Sources and decisions

- [Linear custom views](https://linear.app/docs/custom-views): save durable filtered views, keep frequently used views accessible, separate manually curated groups from rule-driven membership. Glassleaf: saved views over one canonical book record, alongside manual collections.
- [Linear filters](https://linear.app/docs/filters): a filter entry point opens conditions; advanced logic is progressively disclosed. Glassleaf: one view menu instead of permanent rows of every possible filter. Support all/any and exclusion conditions; do not expose a nested query tree by default.
- [Linear search](https://linear.app/docs/search): distinguish finding within a view from global retrieval. Glassleaf: a dedicated global Search destination with result types and direct navigation; library filtering remains scoped.
- [calibre virtual libraries](https://manual.calibre-ebook.com/virtual_libraries.html): subsets of a single library can overlap without copying records. Glassleaf: Manga and Novels remain separate views, while author, series, language, collection and tags connect them across kinds and file formats.
- [Obsidian search](https://obsidian.md/help/Plugins/Search): content and properties are complementary retrieval paths. Glassleaf: typed properties for organization, indexed notes and chapter text for recall.
- [SQLite FTS5](https://www.sqlite.org/fts5.html): local indexed retrieval, ranking and snippets. Glassleaf: bounded result pages and asynchronous EPUB indexing, never unpacking books on each keystroke.

These are product design inferences from documented behavior, not benchmarks or claims about those products' internal implementation.

## Interaction contract

Home is a reading destination, not a dashboard full of metrics. Library has content and one compact toolbar. Search is global and explicitly labels books, notes, bookmarks and chapters. Collections are intentional membership; saved views are live rules. A book can belong to many collections and match many views without duplicating its file or progress. Type and format stay independent. Sort order is part of a saved view.

Rules use exact property matching, with all/any combination and is/is-not conditions. This covers cross-format universes, language-specific shelves, exclusions, and reading queues without requiring users to learn syntax. Nested Boolean groups are a later extension, not an initial mobile editor requirement.

## Performance and limits

Virtualized book/result lists; SQL filtering and bounded paging; debounced search with stale-response protection. Metadata, chapter titles, notes and bookmarks are indexed transactionally. EPUB body indexing is local, incremental and yields between chapters; unavailable files remain readable via metadata search and can be indexed after download. PDF text extraction, comic OCR, Japanese linguistic segmentation and exact in-chapter match highlighting are separate work, not implied by an FTS index.

Validate migration of existing libraries, stale/removal behavior, overlapping all/any rules, saved-view persistence, search locators, 10k paging, native light/dark Home/Library/Search/Views captures. Host SQL timings are not device frame-rate measurements.
