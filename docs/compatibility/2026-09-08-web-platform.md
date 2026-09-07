# Web platform evidence — 2026-09-08

## Browser corpus checks

Fresh Chromium contexts at 390 px imported the source files through the visible **Import books** chooser. The library retained `alice.epub`, `attention.pdf`, and `haruko.cbz` after reload.

- **EPUB:** Alice cover rendered; selecting the third entry in Contents rendered prose. `haruko-jpeg.epub` also rendered its first comic-image spine document.
- **PDF:** `attention.pdf` rendered one 390 × 505 canvas with 24,669 non-white pixels. It used no iframe or embed and did not reproduce the concurrent-canvas-render error.
- **CBZ:** `haruko.cbz` rendered a 600 × 837 blob-backed image without browser errors.

The first Alice check failed before the EPUB resource-rewrite fix: Chromium blocked `http://localhost:8082/3809243430796983855_cover.jpg` under `img-src blob: data:` and the reader showed a broken cover. After the fix, the local SVG image resource was rewritten safely; fresh imports rendered both the Alice cover and prose, with no console or page errors.

## Static PWA offline check

The production export was served from `apps/mobile/dist` by Python `SimpleHTTP` at `http://localhost:4173`, not Metro. In a new Chromium storage context, CBZ and PDF were imported through the chooser. The service worker was active and controlled the page after an online reload. With browser networking disabled, the shell reloaded and the imported CBZ reopened as a 600 × 837 image. There were no console or page errors.

These are Chromium web checks. They do not establish physical iPhone or Android native-reader behavior.
