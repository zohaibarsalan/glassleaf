# Broader system review and reassessment

2026-09-06. Documentation research plus inspection of Glassleaf at 82561e9. No hands-on competitor benchmark was performed. This supplements and corrects the earlier implementation direction.

## Comparisons

| System | Documented behavior | Glassleaf implication |
| --- | --- | --- |
| [Zotero](https://www.zotero.org/support/collections_and_tags) | An item can belong to multiple hierarchical collections; saved searches update membership; tag choices follow the current results. | Preserve one canonical item, support overlapping membership, and make filter options contextual. Do not display every library tag indiscriminately. |
| [Readwise Reader views](https://docs.readwise.io/reader/docs/faqs/filtered-views) and [query syntax](https://docs.readwise.io/reader/guides/filtering/syntax-guide) | Views derive from properties and can be pinned; queries support nested AND/OR. | Browsing an author/tag and saving a view should share the same query model. Flat all/any is insufficient for mixed conditions. |
| [Readwise search](https://docs.readwise.io/reader/docs/faqs/searching) | Global full-text retrieval and in-document find are separate; online search spans the library with local fallback. Its FAQ acknowledges that filtering and full-text search remain separate. | Learn from the explicit scopes, but avoid reproducing the inability to search within a filtered view. Glassleaf's offline scope must be clear. |
| [Komga read lists](https://komga.org/docs/guides/readlists/) and [collections](https://komga.org/docs/guides/collections/) | Collections group series; read lists gather books across libraries/series and allow manual order. | Series, unordered collections and ordered reading lists solve different tasks. Crossover reading order cannot be modeled by tags alone. |
| [Kavita customization](https://wiki.kavitareader.com/guides/features/customization/) | Users reorder/hide dashboard streams and bind smart filters to Home/navigation. | Home should prioritize actual reading history and explicitly pinned views, not whichever views happen to sort first. |
| [calibre virtual libraries](https://manual.calibre-ebook.com/virtual_libraries.html) | Subsets of the same library can be searched and intersected. | Keep independent dimensions for format, story kind, language, author, genre and collection. Avoid treating every grouping as a separate physical library. |

## What Theo's published material supports

The [T3 introduction](https://create.t3.gg/en/introduction) describes simplicity, modularity, solving specific problems, conservative database choices and type safety. The [TypeScript guidance](https://create.t3.gg/en/usage/typescript) emphasizes inference and schema validation, and attributes “Build safety nets, not guard rails” to Theo. These are T3 project documents, not a personal review of Glassleaf. They do not establish which mobile layout, database wrapper or reader engine he would choose.

My application of those principles: keep React Native and stable SQLite; validate external data once at boundaries; share typed query/command contracts between UI and MCP; add dependencies only to solve demonstrated problems. Do not import a web stack wholesale into an offline reader. Test representative user tasks and measure release builds on real devices before asserting speed. The last sentence is our engineering recommendation, not a sourced quote from Theo.

## Confirmed weaknesses in Glassleaf

- Rules have only one all/any level. Cannot express Japanese AND (manga OR light novel) without awkward workaround views.
- Series is a string on each book, not a browsable series entity; ordered cross-series reading lists are absent.
- Home uses updatedAt, which includes metadata edits, instead of a dedicated lastReadAt. It displays the first five alphabetically returned views rather than pinned views.
- Search and library rules are separate APIs; searching inside a saved view is unavailable.
- Saved views are local-only and unavailable in the MCP organization contract.
- Metadata and discovery use two FTS indexes; the original metadata index updates on every book update, including reading progress.
- Tags/collections are JSON arrays queried through json_each. This is valid but the compound-filter cost has not been measured on the target phone.
- Search indexes chapter text into one row per chapter; result opens chapter start, without match highlighting. Japanese substring/segmentation, PDF extraction and comic OCR are incomplete.
- Chapter indexing rescans paged metadata and checks chapters individually on each run. A persisted pending-work queue is the appropriate next improvement if corpus measurements confirm significant startup/restart overhead.
- Native checks cover iPhone simulator workflows; there is no release-device frame-time or battery evidence, and no Android interaction audit.

## Recommended next implementation order

1. Fix reading recency and pinned Home views. Add a real series screen and ordered reading lists with a clear separation from collections.
2. Use a shared validated query tree for library browsing, saved views, full-text scope and MCP. Default UI: AND between property groups; OR among selected values within a group; exclusion supported. Advanced grouping appears only when needed.
3. Model collection/list membership with stable IDs and explicit ordered positions; retain shared book identity/progress. Plan migration and conflict behavior before syncing these entities.
4. Improve contextual facets, multi-select bulk operations, tag rename/merge, unfiled/duplicate cleanup and undo. Do not put these controls permanently on Home.
5. Measure 10k realistic mixed-format records and a representative text corpus on physical iOS and Android release builds. Include Japanese titles/content, note updates, interrupted indexing and cold launch. Profile SQL plans and JS/UI frame stalls before picking further infrastructure.

Proposed acceptance targets (not measured results): cached navigation feedback within 100 ms; local indexed search p95 below 150 ms on the chosen baseline device after debounce; no long JS tasks attributable to indexing during reading; recover interrupted index work without reindexing completed chapters. Publish exact device, corpus, build and percentile measurements.

The previous UI is an implemented iteration, not proof that the architecture is optimal. The model needs these corrections before further broad visual changes.
