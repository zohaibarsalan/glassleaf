# Glassleaf web and desktop

Glassleaf’s browser app is installable as a PWA. It keeps imported EPUB, PDF, and CBZ files in browser storage and opens its local library without a network connection after the first successful load. Clearing browser site data removes that local library.

The browser reader supports EPUB chapter navigation, reader appearance preferences, bookmarks, PDF page rendering, and CBZ pages. EPUB files may use vertical Japanese writing and image-only or SVG spine items. Browser reader preferences match the native reader: paper, typeface, text size, line spacing, margins, and alignment.

The browser currently cannot create text highlights or notes. Existing bookmarks and notes can be exported, and this limitation is deliberate rather than represented as a finished annotation tool.

Desktop packaging reuses the built web app. Build each desktop target on its target operating system: macOS bundles require Xcode and Rust, while Windows and Linux installers should be produced by their corresponding CI runners. The PWA remains the supported path for browser offline use; desktop WebView storage capabilities should be exercised on each packaged target before release.
