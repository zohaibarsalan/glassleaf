# Reader fixes and PDF night reading

Follow-up to the [downloaded-file audit](2026-09-06-results.md). The original downloads and historical failure screenshots remain intact.

## Changes

- EPUB resources resolve against the actual chapter directory, retaining its trailing slash. Generated local reader documents give the WebView access to publication images and fonts without embedding the whole book in memory.
- Image-only spine entries render as images rather than being decoded as text. SVG image wrappers, including the Gutenberg cover, render their image content.
- Local publication stylesheets load with relative resource paths resolved against the stylesheet. Legacy `-epub-writing-mode` is normalized. UTF-8 is explicit, Japanese ruby is retained, and vertical text advances horizontally from right to left. Reader colors override the publication's white page background.
- EPUB3 navigation and NCX labels populate the contents list for existing books. Missing navigation still falls back to numbered entries.
- Selecting the current chapter or entering its number now seeks to its start; the jump field clears after use.
- Image-only chapters no longer generate text-decoding failures during search indexing. A one-time index-version update retries older failures. The imported corpus reached **81 completed jobs, zero unavailable** in the simulator database.
- PDF **Reading settings → Night reading** changes white paper to dark gray and black text to light gray with a compositor blend layer. The original file stays intact. The option is saved per book and included in the existing book serialization/sync model. **Original colors** removes the effect. Illustrations also change color, which the settings explain.

## Verification

Actual iPhone 17 Pro Max / iOS 26.5 Simulator, existing imported books; no re-import or direct book-data seeding:

| Check | Result |
| --- | --- |
| Haruko direct-JPEG EPUB | Page artwork renders; next page advances without a text-encoding error. |
| Haruko HTML/JPEG EPUB | Page 3 artwork renders instead of a broken-image placeholder. |
| Kusamakura | Japanese UTF-8 text and ruby render vertically; next advances horizontally; jumping back to the same chapter returns to its opening. |
| Alice EPUB | Cover renders; prose renders in the dark theme; contents displays publication labels. |
| Attention PDF | Dark page/light text visually confirmed; restart restores night mode and page 9; next reaches page 10. |
| Existing automated checks | Workspace typecheck, 11 library tests, MCP protocol check, and theme validation passed. Final mobile typecheck and formatting passed after the last reader changes. |

Capture flows in `apps/mobile/flows/compatibility/reader-fixes-*.yaml` depend on the downloaded corpus and the documented simulator state. The Japanese flow expects the library filtered to `ja-jp`, newest first; its duplicate-title index 1 is the HTML variant. The night flow starts in a reader. These are focused native reproduction flows, not a clean-install regression suite. Screenshots were visually inspected; reaching a counter alone was not treated as rendering proof.

[Updated single-file phone gallery](../ui-gallery/reader-fixes/index.html). Images are embedded for offline viewing. Source PNGs are retained separately.

## Remaining scope limits

This fixes the sampled compatibility defects, not full EPUB conformance. General SVG vector layouts, arbitrary fixed-layout viewport scaling, media overlays, DRM and CBR/RAR/TXT support are outside this change. Android and physical-device rendering/performance remain unverified. PDF night mode transforms artwork colors as well as text; use Original colors when color fidelity matters.
