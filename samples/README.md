# Glassleaf sample library

Run `node scripts/generate-sample-epubs.mjs` to regenerate the seven EPUB 3
fixtures in `samples/epubs`.

Run `scripts/load-sample-library.sh` to import any missing fixtures into the
current macOS user's local Glassleaf library. The loader preserves existing
books and safely skips samples that are already present.

All titles and text in these fixtures are original generated test material.
They exist to exercise library layouts, metadata import, search, pagination,
chapter navigation, reading progress, and multi-file import without committing
copyrighted or private books.

`the-long-way-home.epub` is intentionally much larger than the other fixtures
so reader performance and navigation can be tested against a substantial book.
