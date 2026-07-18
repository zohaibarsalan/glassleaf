# 0002 — Render local EPUB publications with WebKit

- Status: Accepted for the local MVP
- Date: 2026-07-18

## Context

Glassleaf needs one offline EPUB reading path on iPhone, iPad, and Mac. Imported books must remain local, preserve their original assets, restore position, and support both paginated and continuous layouts. The renderer must not dictate the catalog or future sync-provider model.

## Decision

The local MVP safely extracts validated EPUB resources into the application-support library and renders spine XHTML through `WKWebView` with read access limited to that publication directory.

`PublicationNavigator` owns chapter navigation, layout scripts, progress, position restore, and the Swift/JavaScript bridge. Reader preferences and reading records stay in the provider-neutral domain and SQLite repository rather than WebKit storage.

The generated reader fixture remains preview/test data only. Imported publications always use their real spine resources.

## Consequences

- One reader implementation builds on iPhone, iPad, and Mac and works offline.
- EPUB parsing, archive safety, catalog persistence, and reader navigation remain independently testable.
- The current implementation supports reflowable EPUB content; fixed-layout EPUB, media overlays, advanced accessibility conformance, and hostile/malformed publication coverage need dedicated hardening.
- A future dedicated EPUB toolkit may replace the navigator if it proves a stronger universal Apple-platform path. That change must preserve locators, annotations, original assets, and portable exports.
