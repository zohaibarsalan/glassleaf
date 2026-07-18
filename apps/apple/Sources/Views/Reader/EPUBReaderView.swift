import GlassleafDomain
import Observation
import QuartzCore
import SwiftUI
import WebKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct EPUBReaderView: View {
    let book: Book
    @Bindable var store: LibraryStore
    @State private var navigator = PublicationNavigator()
    @State private var preferences: ReaderPreferences
    @State private var controlsVisible = true
    @State private var showsContents = false
    @State private var showsSettings = false
    @State private var showsNoteEditor = false
    @State private var hideControlsTask: Task<Void, Never>?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    init(book: Book, store: LibraryStore) {
        self.book = book
        self.store = store
        _preferences = State(initialValue: store.readerPreferences)
    }

    private var links: [PublicationLink] { book.asset?.readingOrder ?? [] }
    private var annotations: [Annotation] { store.annotations.filter { $0.bookID == book.id } }
    private var progress: Double { navigator.overallProgress(chapterCount: links.count) }
    private var locator: String { navigator.locator(links: links) }
    private var isBookmarked: Bool { store.isBookmarked(bookID: book.id, locator: locator) }
    private var resolvedPreferences: ReaderPreferences {
        var value = preferences
        value.theme = preferences.theme.resolved(for: colorScheme)
        return value
    }
    private var readerColorScheme: ColorScheme {
        switch resolvedPreferences.theme {
        case .night, .black: .dark
        case .automatic, .paper, .sepia: .light
        }
    }

    var body: some View {
        ZStack {
            preferences.theme.background(for: colorScheme).ignoresSafeArea()
#if os(macOS)
            PublicationWebView(book: book, preferences: resolvedPreferences, annotations: annotations, navigator: navigator)
                .ignoresSafeArea(.container, edges: [.top, .bottom, .leading])
#else
            PublicationWebView(book: book, preferences: resolvedPreferences, annotations: annotations, navigator: navigator)
                .ignoresSafeArea()
#endif

            if !navigator.hasLoadedContent {
                ProgressView("Opening \(book.title)…")
                    .padding(18)
                    .glassEffect(.regular, in: .rect(cornerRadius: 16))
            }

            if controlsVisible { readerChrome.transition(.opacity) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(preferences.theme.background(for: colorScheme))
        .preferredColorScheme(readerColorScheme)
        .animation(reduceMotion ? nil : .smooth(duration: 0.18), value: controlsVisible)
        .modifier(ReaderSystemChromeModifier(controlsVisible: controlsVisible))
        .onAppear {
            navigator.onTap = toggleControls
            navigator.open(book: book, initialProgress: book.progress.fraction)
            scheduleControlsHide()
        }
        .onDisappear { hideControlsTask?.cancel() }
        .onChange(of: preferences) { _, value in
            store.updateReaderPreferences(value)
            var resolved = value
            resolved.theme = value.theme.resolved(for: colorScheme)
            navigator.apply(preferences: resolved)
        }
        .onChange(of: colorScheme) { _, _ in
            navigator.apply(preferences: resolvedPreferences)
        }
        .inspector(isPresented: $showsContents) {
            EPUBContentsView(
                book: book,
                store: store,
                selectedChapter: navigator.chapterIndex,
                onSelect: { destination in
                    navigator.goToChapter(destination.chapterIndex, progress: destination.progress)
                    showsContents = false
                    revealControls()
                },
                onClose: {
                    showsContents = false
                    revealControls()
                },
                onBookmarkCurrent: {
                    if !isBookmarked {
                        store.toggleBookmark(bookID: book.id, locator: locator, label: currentChapterTitle)
                    }
                    revealControls()
                },
                onAddNote: {
                    showsNoteEditor = true
                    revealControls()
                }
            )
            .inspectorColumnWidth(min: 320, ideal: 360, max: 440)
        }
        .sheet(isPresented: $showsSettings) {
            ReaderSettingsView(preferences: $preferences)
        }
        .sheet(isPresented: $showsNoteEditor) {
            ReaderNoteEditor(selectedText: navigator.selectedText) { note, color in
                store.addAnnotation(bookID: book.id, locator: locator, selectedText: navigator.selectedText.nilIfEmpty, note: note, color: color)
            }
        }
    }

    private var readerChrome: some View {
        ZStack {
            VStack {
                topControls
                Spacer()
                bottomControls
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)
            .padding(.bottom, 14)

#if os(macOS)
            if horizontalSizeClass != .compact {
                edgeNavigationControls
            }
#endif
        }
        .foregroundStyle(.primary)
    }

#if os(macOS)
    private var edgeNavigationControls: some View {
        HStack {
            EPUBEdgeNavigationButton("Previous Page", systemImage: "chevron.left") {
                navigator.previous()
                revealControls()
            }
            .disabled(navigator.chapterIndex == 0 && navigator.chapterProgress <= 0.001)

            Spacer()

            EPUBEdgeNavigationButton("Next Page", systemImage: "chevron.right") {
                navigator.next()
                revealControls()
            }
            .disabled(navigator.chapterIndex == max(links.count - 1, 0) && navigator.chapterProgress >= 0.999)
        }
        .padding(.horizontal, 8)
    }
#endif

    private var topControls: some View {
        ZStack(alignment: .top) {
            HStack(alignment: .top) {
                EPUBControlCluster {
                    EPUBChromeButton("Back to Library", systemImage: "chevron.left") {
                        store.closeReader(at: progress, locator: locator)
                    }
                }

                Spacer(minLength: 12)

                EPUBControlCluster {
                    EPUBChromeButton("Contents and Search", systemImage: "list.bullet.rectangle") { showsContents = true; revealControls() }
                    EPUBChromeButton("Appearance", systemImage: "textformat.size") { showsSettings = true; revealControls() }
                    EPUBChromeButton("Add Note", systemImage: "pencil.tip") { showsNoteEditor = true; revealControls() }
                    EPUBChromeButton(isBookmarked ? "Remove Bookmark" : "Add Bookmark", systemImage: isBookmarked ? "bookmark.fill" : "bookmark") {
                        store.toggleBookmark(bookID: book.id, locator: locator, label: currentChapterTitle)
                        revealControls()
                    }
                }
            }
            .padding(.leading, macOSTitleBarControlClearance)

            if horizontalSizeClass != .compact {
                VStack(spacing: 2) {
                    Text(book.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text(currentChapterTitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                .padding(.horizontal, 12)
                .frame(maxWidth: 300, minHeight: 44)
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var bottomControls: some View {
        HStack(spacing: 12) {
            EPUBChromeButton("Previous Page", systemImage: "chevron.left") { navigator.previous(); revealControls() }
                .disabled(navigator.chapterIndex == 0 && navigator.chapterProgress <= 0.001)
            Slider(value: Binding(get: { progress }, set: { navigator.seek(to: $0, chapterCount: links.count) }), in: 0...1)
                .tint(.primary)
                .frame(maxWidth: 520)
                .accessibilityLabel("Reading progress")
            Text(progress, format: .percent.precision(.fractionLength(0)))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 38, alignment: .trailing)
            EPUBChromeButton("Next Page", systemImage: "chevron.right") { navigator.next(); revealControls() }
                .disabled(navigator.chapterIndex == max(links.count - 1, 0) && navigator.chapterProgress >= 0.999)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .frame(maxWidth: 620)
        .glassEffect(.regular.interactive(), in: .capsule)
    }

    private var currentChapterTitle: String {
        guard links.indices.contains(navigator.chapterIndex) else { return "" }
        return links[navigator.chapterIndex].title ?? "Chapter \(navigator.chapterIndex + 1)"
    }

    private var macOSTitleBarControlClearance: CGFloat {
#if os(macOS)
        74
#else
        0
#endif
    }

    private func toggleControls() {
        if controlsVisible {
            hideControlsTask?.cancel()
            controlsVisible = false
        } else {
            revealControls()
        }
    }

    private func revealControls() {
        controlsVisible = true
        scheduleControlsHide()
    }

    private func scheduleControlsHide() {
        hideControlsTask?.cancel()
        hideControlsTask = Task {
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            controlsVisible = false
        }
    }
}

@MainActor
@Observable
final class PublicationNavigator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    var chapterIndex = 0
    var chapterProgress = 0.0
    var isReady = false
    var hasLoadedContent = false
    var selectedText = ""
    var onTap: (() -> Void)?
    @ObservationIgnored private weak var webHost: (any PublicationWebHosting)?
    @ObservationIgnored private var book: Book?
    @ObservationIgnored private var preferences = ReaderPreferences()
    @ObservationIgnored private var annotations: [Annotation] = []
    @ObservationIgnored private var pendingProgress = 0.0
    @ObservationIgnored private var isWaitingForWebView = false
    @ObservationIgnored private var isTransitioning = false
    @ObservationIgnored private var preloadTask: Task<Void, Never>?
    @ObservationIgnored private var chapterPositions: [Int: Double] = [:]
    @ObservationIgnored private var transitionDirection = ChapterNavigationDirection.neutral

    fileprivate func attach(_ webHost: any PublicationWebHosting, book: Book, preferences: ReaderPreferences, annotations: [Annotation]) {
        guard self.webHost !== webHost else {
            let annotationsChanged = self.annotations != annotations
            self.annotations = annotations
            apply(preferences: preferences)
            if annotationsChanged { renderAnnotations() }
            return
        }
        self.webHost = webHost
        self.book = book
        self.preferences = preferences
        self.annotations = annotations
        if isWaitingForWebView {
            isWaitingForWebView = false
            loadChapter(chapterIndex)
        }
    }

    func open(book: Book, initialProgress: Double) {
        self.book = book
        let count = max(book.asset?.readingOrder.count ?? 0, 1)
        let scaled = min(max(initialProgress, 0), 1) * Double(count)
        chapterIndex = min(Int(scaled), count - 1)
        pendingProgress = scaled - Double(chapterIndex)
        chapterPositions[chapterIndex] = pendingProgress
        transitionDirection = .neutral
        guard webHost != nil else {
            isWaitingForWebView = true
            return
        }
        loadChapter(chapterIndex)
    }

    func goToChapter(_ index: Int, progress: Double? = nil) {
        guard let links = book?.asset?.readingOrder, links.indices.contains(index) else { return }
        chapterPositions[chapterIndex] = chapterProgress
        transitionDirection = ChapterNavigationDirection(from: chapterIndex, to: index)
        chapterIndex = index
        let destinationProgress = progress ?? chapterPositions[index] ?? 0
        pendingProgress = min(max(destinationProgress, 0), 1)
        loadChapter(index)
    }

    func next() {
        guard !isTransitioning else { return }
        evaluate("window.glassleafNext && window.glassleafNext()") { [weak self] value in
            guard let self, value as? Bool != true else { return }
            self.goToChapter(self.chapterIndex + 1)
        }
    }

    func previous() {
        guard !isTransitioning else { return }
        evaluate("window.glassleafPrevious && window.glassleafPrevious()") { [weak self] value in
            guard let self, value as? Bool != true else { return }
            self.goToChapter(self.chapterIndex - 1)
        }
    }

    func navigateWithTrackpad(forward: Bool) {
        guard !isTransitioning else { return }
        switch preferences.mode {
        case .paginated:
            forward ? next() : previous()
        case .scrolling:
            navigateChapter(forward: forward)
        }
    }

    func navigateChapter(forward: Bool) {
        guard !isTransitioning else { return }
        goToChapter(chapterIndex + (forward ? 1 : -1))
    }

    func seek(to fraction: Double, chapterCount: Int) {
        guard chapterCount > 0 else { return }
        let scaled = min(max(fraction, 0), 0.999_999) * Double(chapterCount)
        let chapter = min(Int(scaled), chapterCount - 1)
        let local = scaled - Double(chapter)
        if chapter == chapterIndex {
            evaluate("window.glassleafSeek && window.glassleafSeek(\(local))")
        } else {
            goToChapter(chapter, progress: local)
        }
    }

    func overallProgress(chapterCount: Int) -> Double {
        guard chapterCount > 0 else { return 0 }
        return min(max((Double(chapterIndex) + chapterProgress) / Double(chapterCount), 0), 1)
    }

    func locator(links: [PublicationLink]) -> String {
        guard links.indices.contains(chapterIndex) else { return "" }
        return "\(links[chapterIndex].href)#progress=\(String(format: "%.5f", chapterProgress))"
    }

    func apply(preferences: ReaderPreferences) {
        let modeChanged = self.preferences.mode != preferences.mode
        self.preferences = preferences
        if modeChanged {
            pendingProgress = chapterProgress
            loadChapter(chapterIndex)
        } else {
            evaluate(Self.appearanceScript(preferences))
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let webHost else { return }
        if webHost.isPreloadNavigation(webView) {
            evaluate(Self.bootstrapScript(preferences: preferences, progress: 0), in: webView) { [weak webView, weak webHost] _ in
                guard let webView, let webHost, webHost.isPreloadNavigation(webView) else { return }
                webHost.markPreloadedChapter(webView)
            }
            return
        }

        guard webHost.isCurrentNavigation(webView) else { return }
        finishLoadingChapter(in: webView)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.webView === webHost?.activeWebView else { return }
        switch message.name {
        case "glassleafPage":
            switch message.body as? String {
            case "next": next()
            case "previous": previous()
            case "nextChapter": goToChapter(chapterIndex + 1)
            case "previousChapter": goToChapter(chapterIndex - 1)
            default: break
            }
        case "glassleafProgress":
            if let value = message.body as? NSNumber { chapterProgress = min(max(value.doubleValue, 0), 1) }
        case "glassleafSelection": selectedText = message.body as? String ?? ""
        default: break
        }
    }

    private func loadChapter(_ index: Int) {
        guard let webHost, let book, let asset = book.asset, let rootPath = asset.extractedRelativePath,
              asset.readingOrder.indices.contains(index), let root = PublicationLocation.rootURL() else { return }
        preloadTask?.cancel()
        isReady = false
        isTransitioning = hasLoadedContent
        chapterProgress = pendingProgress
        let publicationRoot = root.appending(path: rootPath, directoryHint: .isDirectory)
        let resource = publicationRoot.appending(path: asset.readingOrder[index].href)
        if let preloadedWebView = webHost.loadChapter(resource, allowingReadAccessTo: publicationRoot, retainingCurrentContent: hasLoadedContent) {
            finishLoadingChapter(in: preloadedWebView)
        }
    }

    private func finishLoadingChapter(in webView: WKWebView) {
        guard let webHost, webHost.isCurrentNavigation(webView) else { return }
        let progress = pendingProgress
        evaluate(Self.bootstrapScript(preferences: preferences, progress: progress), in: webView) { [weak self, weak webView, weak webHost] _ in
            guard let self, let webView, let webHost, webHost.isCurrentNavigation(webView) else { return }
            self.isReady = true
            self.hasLoadedContent = true
            self.isTransitioning = false
            self.renderAnnotations(in: webView)
            webHost.revealLoadedChapter(webView, direction: self.transitionDirection)
            self.transitionDirection = .neutral
            self.scheduleFollowingChapterPreload()
        }
    }

    private func scheduleFollowingChapterPreload() {
        preloadTask?.cancel()
        let expectedChapter = chapterIndex
        preloadTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(220))
            guard !Task.isCancelled, let self, self.chapterIndex == expectedChapter, !self.isTransitioning,
                  let webHost = self.webHost, let asset = self.book?.asset,
                  let rootPath = asset.extractedRelativePath, let root = PublicationLocation.rootURL(),
                  asset.readingOrder.indices.contains(expectedChapter + 1) else { return }
            let publicationRoot = root.appending(path: rootPath, directoryHint: .isDirectory)
            let resource = publicationRoot.appending(path: asset.readingOrder[expectedChapter + 1].href)
            webHost.preloadChapter(resource, allowingReadAccessTo: publicationRoot)
        }
    }

    private func evaluate(_ script: String, in webView: WKWebView? = nil, completion: ((Any?) -> Void)? = nil) {
        (webView ?? webHost?.activeWebView)?.evaluateJavaScript(script) { value, _ in completion?(value) }
    }

    private func renderAnnotations(in webView: WKWebView? = nil) {
        guard isReady, let href = book?.asset?.readingOrder[safe: chapterIndex]?.href else { return }
        let values: [[String: Any]] = annotations.compactMap { annotation in
            guard annotation.locator.split(separator: "#", maxSplits: 1).first.map(String.init) == href,
                  let text = annotation.selectedText?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
            let progress = annotation.locator.components(separatedBy: "#progress=").last.flatMap(Double.init) ?? 0
            return [
                "id": annotation.id.uuidString.lowercased(),
                "text": text,
                "progress": min(max(progress, 0), 1),
                "color": annotation.color.cssHighlight,
            ]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: values), let json = String(data: data, encoding: .utf8) else { return }
        evaluate(Self.highlightScript(json: json), in: webView)
    }

    private static func highlightScript(json: String) -> String {
        """
        (() => {
          const annotations = \(json);
          const styleID = 'glassleaf-highlights';
          let style = document.getElementById(styleID);
          if (!style) { style = document.createElement('style'); style.id = styleID; document.head.appendChild(style); }
          style.textContent = '[data-glassleaf-highlight] { color: inherit; border-radius: .14em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }';
          for (const highlight of Array.from(document.querySelectorAll('[data-glassleaf-highlight]'))) {
            highlight.replaceWith(document.createTextNode(highlight.textContent || ''));
          }
          document.body.normalize();

          const collectText = () => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
              acceptNode: node => node.parentElement?.closest('script, style, noscript') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
            });
            const segments = [];
            let full = '';
            while (walker.nextNode()) {
              const node = walker.currentNode;
              const start = full.length;
              full += node.data;
              segments.push({node, start, end: full.length});
            }
            return {full, segments};
          };
          const point = (segments, offset) => {
            for (const segment of segments) {
              if (offset >= segment.start && offset <= segment.end) {
                return {node: segment.node, offset: Math.min(offset - segment.start, segment.node.length)};
              }
            }
            return null;
          };

          let rendered = 0;
          for (const item of annotations) {
            const textMap = collectText();
            const occurrences = [];
            let from = 0;
            while (from < textMap.full.length) {
              const index = textMap.full.indexOf(item.text, from);
              if (index < 0) break;
              occurrences.push(index);
              from = index + Math.max(item.text.length, 1);
            }
            if (!occurrences.length) continue;
            const expected = item.progress * textMap.full.length;
            const startIndex = occurrences.reduce((best, value) => Math.abs(value - expected) < Math.abs(best - expected) ? value : best);
            const start = point(textMap.segments, startIndex);
            const end = point(textMap.segments, startIndex + item.text.length);
            if (!start || !end) continue;
            const range = new Range();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            const highlight = document.createElement('span');
            highlight.dataset.glassleafHighlight = item.id;
            highlight.style.backgroundColor = item.color;
            highlight.appendChild(range.extractContents());
            range.insertNode(highlight);
            rendered += 1;
          }
          return {annotations: annotations.length, rendered};
        })();
        """
    }

    private static func bootstrapScript(preferences: ReaderPreferences, progress: Double) -> String {
#if os(macOS)
        let keyboardNavigation = """
          if (event.key === 'PageDown') {
            event.preventDefault(); webkit.messageHandlers.glassleafPage.postMessage('next');
          } else if (event.key === 'PageUp') {
            event.preventDefault(); webkit.messageHandlers.glassleafPage.postMessage('previous');
          }
        """
#else
        let keyboardNavigation = """
          if (event.key === 'ArrowRight' || event.key === 'PageDown') {
            event.preventDefault(); webkit.messageHandlers.glassleafPage.postMessage('next');
          } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
            event.preventDefault(); webkit.messageHandlers.glassleafPage.postMessage('previous');
          }
        """
#endif
        return """
        (() => {
          let viewport = document.querySelector('meta[name="viewport"]');
          if (!viewport) { viewport = document.createElement('meta'); viewport.name = 'viewport'; document.head.appendChild(viewport); }
          viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1';
          \(appearanceScript(preferences))
          const root = document.scrollingElement;
          const horizontal = () => \(preferences.mode == .paginated ? "true" : "false");
          const maxScroll = () => horizontal() ? Math.max(root.scrollWidth - innerWidth, 1) : Math.max(root.scrollHeight - innerHeight, 1);
          const position = () => horizontal() ? scrollX : scrollY;
          const report = () => webkit.messageHandlers.glassleafProgress.postMessage(Math.min(Math.max(position() / maxScroll(), 0), 1));
          window.glassleafSeek = value => { scrollTo(horizontal() ? value * maxScroll() : 0, horizontal() ? 0 : value * maxScroll()); setTimeout(report, 40); };
          const paginatedTarget = direction => {
            const page = Math.round(scrollX / innerWidth);
            const lastPage = Math.max(Math.ceil(root.scrollWidth / innerWidth) - 1, 0);
            const targetPage = Math.min(Math.max(page + direction, 0), lastPage);
            if (targetPage === page) return false;
            scrollTo({left: targetPage * innerWidth, top: 0, behavior: 'smooth'});
            return true;
          };
          window.glassleafNext = () => {
            if (horizontal()) return paginatedTarget(1);
            if (position() >= maxScroll() - 4) return false;
            scrollBy({top: innerHeight * .86, behavior: 'smooth'});
            return true;
          };
          window.glassleafPrevious = () => {
            if (horizontal()) return paginatedTarget(-1);
            if (position() <= 4) return false;
            scrollBy({top: -innerHeight * .86, behavior: 'smooth'});
            return true;
          };
          addEventListener('keydown', event => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            \(keyboardNavigation)
          });
          addEventListener('scroll', report, {passive: true});
          document.addEventListener('selectionchange', () => webkit.messageHandlers.glassleafSelection.postMessage(String(getSelection()).slice(0, 10000)));
          requestAnimationFrame(() => window.glassleafSeek(\(progress)));
        })();
        """
    }

    private static func appearanceScript(_ preferences: ReaderPreferences) -> String {
        let font = switch preferences.fontFamily {
        case .serif: "ui-serif, Georgia, serif"
        case .sans: "ui-sans-serif, -apple-system, sans-serif"
        case .rounded: "ui-rounded, -apple-system, sans-serif"
        }
        return """
        (() => {
          let style = document.getElementById('glassleaf-style');
          if (!style) { style = document.createElement('style'); style.id = 'glassleaf-style'; document.head.appendChild(style); }
          style.textContent = `
            html { background: \(preferences.theme.cssBackground) !important; color: \(preferences.theme.cssForeground) !important; }
            body { box-sizing: border-box; max-width: none !important; font-family: \(font) !important; font-size: \(19 * preferences.fontScale)px !important; line-height: \(1.35 + preferences.lineSpacing / 20) !important; text-align: \(preferences.alignment == .justified ? "justify" : "start") !important; color: \(preferences.theme.cssForeground) !important; background: transparent !important; hyphens: auto; orphans: 2; widows: 2; }
            img, svg, video { max-width: 100% !important; height: auto !important; }
            a { color: inherit !important; }
            ::selection { background: rgba(255, 204, 64, .45); }
            \(preferences.mode == .paginated ? "html { overflow: hidden !important; } body { --glassleaf-side: max(\(preferences.horizontalMargin)px, calc((100vw - 900px) / 2 + \(preferences.horizontalMargin)px)); height: calc(100vh - 176px); margin: 88px var(--glassleaf-side) !important; padding: 0 !important; column-width: calc(100vw - var(--glassleaf-side) - var(--glassleaf-side)); column-gap: calc(var(--glassleaf-side) + var(--glassleaf-side)); overflow: visible !important; }" : "html { overflow-y: auto !important; } body { max-width: 900px !important; margin: 0 auto !important; padding: 104px \(preferences.horizontalMargin)px 124px !important; }")
          `;
        })();
        """
    }
}

private enum PublicationLocation {
    static func rootURL() -> URL? {
        try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
            .appending(path: "Glassleaf", directoryHint: .isDirectory)
    }
}

@MainActor
private protocol PublicationWebHosting: AnyObject {
    var activeWebView: WKWebView { get }
    func loadChapter(_ resource: URL, allowingReadAccessTo publicationRoot: URL, retainingCurrentContent: Bool) -> WKWebView?
    func preloadChapter(_ resource: URL, allowingReadAccessTo publicationRoot: URL)
    func isCurrentNavigation(_ webView: WKWebView) -> Bool
    func isPreloadNavigation(_ webView: WKWebView) -> Bool
    func markPreloadedChapter(_ webView: WKWebView)
    func revealLoadedChapter(_ webView: WKWebView, direction: ChapterNavigationDirection)
}

private enum ChapterNavigationDirection: Equatable {
    case backward
    case neutral
    case forward

    init(from source: Int, to destination: Int) {
        if destination > source {
            self = .forward
        } else if destination < source {
            self = .backward
        } else {
            self = .neutral
        }
    }

    var horizontalSign: CGFloat {
        switch self {
        case .backward: -1
        case .neutral: 0
        case .forward: 1
        }
    }
}

private enum ChapterTransitionMotion {
    static let crossfadeDuration: TimeInterval = 0.18
    static let slideDuration: TimeInterval = 0.28
}

@MainActor
private func makePublicationConfiguration(for navigator: PublicationNavigator) -> WKWebViewConfiguration {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(navigator, name: "glassleafPage")
    configuration.userContentController.add(navigator, name: "glassleafProgress")
    configuration.userContentController.add(navigator, name: "glassleafSelection")
    return configuration
}

#if os(macOS)
private struct PublicationWebView: NSViewRepresentable {
    let book: Book
    let preferences: ReaderPreferences
    let annotations: [Annotation]
    let navigator: PublicationNavigator

    func makeNSView(context: Context) -> PublicationWebHostView {
        PublicationWebHostView(navigator: navigator)
    }

    func updateNSView(_ webHost: PublicationWebHostView, context: Context) {
        navigator.attach(webHost, book: book, preferences: preferences, annotations: annotations)
    }
}

private final class PublicationWebHostView: NSView, PublicationWebHosting, NSGestureRecognizerDelegate {
    private(set) var activeWebView: WKWebView
    private let primaryWebView: WKWebView
    private let secondaryWebView: WKWebView
    private weak var navigator: PublicationNavigator?
    private weak var loadingWebView: WKWebView?
    private weak var preloadingWebView: WKWebView?
    private var preloadedResource: URL?
    private var isPreloadedChapterReady = false
    private let pageClickGesture = NSClickGestureRecognizer()
    private var readerKeyMonitor: Any?

    init(navigator: PublicationNavigator) {
        let primary = Self.makeWebView(navigator: navigator)
        let secondary = Self.makeWebView(navigator: navigator)
        primaryWebView = primary
        activeWebView = primary
        secondaryWebView = secondary
        self.navigator = navigator
        super.init(frame: .zero)
        addSubview(primary)
        configureReadingClick()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layout() {
        super.layout()
        activeWebView.frame = bounds
        secondaryWebView.frame = bounds
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil {
            removeReaderKeyMonitor()
        } else {
            installReaderKeyMonitorIfNeeded()
        }
    }

    private func configureReadingClick() {
        pageClickGesture.target = self
        pageClickGesture.action = #selector(handlePageClick)
        pageClickGesture.numberOfClicksRequired = 1
        pageClickGesture.buttonMask = 0x1
        pageClickGesture.delegate = self
        addGestureRecognizer(pageClickGesture)
    }

    @objc private func handlePageClick() {
        navigator?.onTap?()
    }

    private func installReaderKeyMonitorIfNeeded() {
        guard readerKeyMonitor == nil else { return }
        readerKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.shouldHandleReaderKey(event) else { return event }
            switch event.specialKey {
            case .rightArrow:
                self.navigator?.navigateChapter(forward: true)
                return nil
            case .leftArrow:
                self.navigator?.navigateChapter(forward: false)
                return nil
            case .downArrow:
                self.navigator?.next()
                return nil
            case .upArrow:
                self.navigator?.previous()
                return nil
            default:
                return event
            }
        }
    }

    private func removeReaderKeyMonitor() {
        guard let readerKeyMonitor else { return }
        NSEvent.removeMonitor(readerKeyMonitor)
        self.readerKeyMonitor = nil
    }

    private func shouldHandleReaderKey(_ event: NSEvent) -> Bool {
        let navigationModifiers: NSEvent.ModifierFlags = [.command, .control, .option, .shift]
        let readerKeys: Set<NSEvent.SpecialKey> = [.leftArrow, .rightArrow, .upArrow, .downArrow]
        guard event.window === window,
              !event.isARepeat,
              event.modifierFlags.intersection(navigationModifiers).isEmpty,
              let specialKey = event.specialKey,
              readerKeys.contains(specialKey)
        else { return false }

        guard let responder = window?.firstResponder else { return true }
        if let textView = responder as? NSTextView, textView.isFieldEditor { return false }
        guard let responderView = responder as? NSView else { return true }
        return responderView === self || responderView.isDescendant(of: self)
    }

    func gestureRecognizer(
        _ gestureRecognizer: NSGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: NSGestureRecognizer
    ) -> Bool {
        gestureRecognizer === pageClickGesture || otherGestureRecognizer === pageClickGesture
    }

    func loadChapter(_ resource: URL, allowingReadAccessTo publicationRoot: URL, retainingCurrentContent: Bool) -> WKWebView? {
        let destination = retainingCurrentContent ? inactiveWebView : activeWebView
        let reusesPreload = retainingCurrentContent
            && preloadingWebView === destination
            && preloadedResource == resource
        let usesPreloadedChapter = reusesPreload && isPreloadedChapterReady
        if !reusesPreload { destination.stopLoading() }
        destination.layer?.removeAllAnimations()
        destination.alphaValue = 1
        destination.isHidden = false
        destination.frame = bounds

        if retainingCurrentContent {
            activeWebView.layer?.removeAllAnimations()
            activeWebView.alphaValue = 1
            addSubview(destination, positioned: .below, relativeTo: activeWebView)
        } else if destination.superview !== self {
            addSubview(destination)
        }

        loadingWebView = destination
        preloadingWebView = nil
        preloadedResource = nil
        isPreloadedChapterReady = false
        guard !usesPreloadedChapter else { return destination }
        guard !reusesPreload else { return nil }
        _ = destination.loadFileURL(resource, allowingReadAccessTo: publicationRoot)
        return nil
    }

    func preloadChapter(_ resource: URL, allowingReadAccessTo publicationRoot: URL) {
        guard loadingWebView == nil else { return }
        if preloadedResource == resource, isPreloadedChapterReady { return }

        let destination = inactiveWebView
        destination.stopLoading()
        destination.layer?.removeAllAnimations()
        destination.alphaValue = 1
        destination.isHidden = true
        destination.frame = bounds
        addSubview(destination, positioned: .below, relativeTo: activeWebView)

        preloadingWebView = destination
        preloadedResource = resource
        isPreloadedChapterReady = false
        _ = destination.loadFileURL(resource, allowingReadAccessTo: publicationRoot)
    }

    func isCurrentNavigation(_ webView: WKWebView) -> Bool {
        loadingWebView === webView
    }

    func isPreloadNavigation(_ webView: WKWebView) -> Bool {
        preloadingWebView === webView
    }

    func markPreloadedChapter(_ webView: WKWebView) {
        guard preloadingWebView === webView else { return }
        isPreloadedChapterReady = true
    }

    func revealLoadedChapter(_ webView: WKWebView, direction: ChapterNavigationDirection) {
        guard loadingWebView === webView else { return }
        loadingWebView = nil
        guard webView !== activeWebView else { return }

        let outgoing = activeWebView
        let reducesMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        activeWebView = webView
        addSubview(webView, positioned: .above, relativeTo: outgoing)

        guard !reducesMotion else {
            webView.frame = bounds
            outgoing.removeFromSuperview()
            return
        }

        guard direction != .neutral else {
            webView.alphaValue = 0
            webView.frame = bounds
            NSAnimationContext.runAnimationGroup({ context in
                context.duration = ChapterTransitionMotion.crossfadeDuration
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                outgoing.animator().alphaValue = 0
                webView.animator().alphaValue = 1
            }, completionHandler: { [weak self, weak outgoing] in
                guard let self, let outgoing, outgoing !== self.activeWebView else { return }
                outgoing.alphaValue = 1
                outgoing.removeFromSuperview()
            })
            return
        }

        let travel = max(bounds.width, 1)
        webView.frame = bounds.offsetBy(dx: direction.horizontalSign * travel, dy: 0)
        outgoing.frame = bounds
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = ChapterTransitionMotion.slideDuration
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            outgoing.animator().frame = self.bounds.offsetBy(dx: -direction.horizontalSign * travel, dy: 0)
            webView.animator().frame = self.bounds
        }, completionHandler: { [weak self, weak outgoing] in
            guard let self, let outgoing, outgoing !== self.activeWebView else { return }
            outgoing.frame = self.bounds
            outgoing.removeFromSuperview()
        })
    }

    private var inactiveWebView: WKWebView {
        activeWebView === primaryWebView ? secondaryWebView : primaryWebView
    }

    private static func makeWebView(navigator: PublicationNavigator) -> TrackpadAwareWebView {
        let webView = TrackpadAwareWebView(frame: .zero, configuration: makePublicationConfiguration(for: navigator))
        webView.navigationDelegate = navigator
        webView.onHorizontalSwipe = { [weak navigator] forward in navigator?.navigateWithTrackpad(forward: forward) }
        webView.onChapterKeyNavigation = { [weak navigator] forward in navigator?.navigateChapter(forward: forward) }
        webView.onPageKeyNavigation = { [weak navigator] forward in forward ? navigator?.next() : navigator?.previous() }
        webView.setValue(false, forKey: "drawsBackground")
        return webView
    }
}

private final class TrackpadAwareWebView: WKWebView {
    var onHorizontalSwipe: ((Bool) -> Void)?
    var onChapterKeyNavigation: ((Bool) -> Void)?
    var onPageKeyNavigation: ((Bool) -> Void)?

    private var horizontalDistance: CGFloat = 0
    private var verticalDistance: CGFloat = 0
    private var gestureAxis: GestureAxis = .undecided
    private var didCommitGesture = false
    private var suppressesMomentum = false

    override func keyDown(with event: NSEvent) {
        let navigationModifiers: NSEvent.ModifierFlags = [.command, .control, .option, .shift]
        guard !event.isARepeat, event.modifierFlags.intersection(navigationModifiers).isEmpty else {
            super.keyDown(with: event)
            return
        }

        switch event.specialKey {
        case .rightArrow:
            onChapterKeyNavigation?(true)
        case .leftArrow:
            onChapterKeyNavigation?(false)
        case .downArrow:
            onPageKeyNavigation?(true)
        case .upArrow:
            onPageKeyNavigation?(false)
        default:
            super.keyDown(with: event)
        }
    }

    override func scrollWheel(with event: NSEvent) {
        if !event.momentumPhase.isEmpty {
            if suppressesMomentum { return }
            super.scrollWheel(with: event)
            return
        }

        if event.phase.contains(.began) {
            horizontalDistance = 0
            verticalDistance = 0
            gestureAxis = .undecided
            didCommitGesture = false
            suppressesMomentum = false
        }

        guard !event.phase.isEmpty else {
            super.scrollWheel(with: event)
            return
        }

        horizontalDistance += event.scrollingDeltaX
        verticalDistance += event.scrollingDeltaY
        resolveGestureAxisIfNeeded()

        let gestureEnded = event.phase.contains(.ended) || event.phase.contains(.cancelled)
        if gestureAxis == .horizontal {
            suppressesMomentum = true
            if !didCommitGesture, abs(horizontalDistance) >= commitDistance {
                didCommitGesture = true
                // NSEvent's horizontal delta is the inverse of the DOM scroll direction.
                onHorizontalSwipe?(horizontalDistance < 0)
            }
            if gestureEnded { resetGesture() }
            return
        }

        if gestureEnded {
            resetGesture()
            super.scrollWheel(with: event)
            return
        }

        super.scrollWheel(with: event)
    }

    private var commitDistance: CGFloat {
        min(max(bounds.width * 0.035, 44), 58)
    }

    private func resolveGestureAxisIfNeeded() {
        guard gestureAxis == .undecided else { return }
        let horizontal = abs(horizontalDistance)
        let vertical = abs(verticalDistance)
        guard horizontal >= 8 else { return }

        if horizontal > vertical * 1.1 {
            gestureAxis = .horizontal
        }
    }

    private func resetGesture() {
        horizontalDistance = 0
        verticalDistance = 0
        gestureAxis = .undecided
        didCommitGesture = false
    }

    private enum GestureAxis {
        case undecided
        case horizontal
    }
}
#else
private struct PublicationWebView: UIViewRepresentable {
    let book: Book
    let preferences: ReaderPreferences
    let annotations: [Annotation]
    let navigator: PublicationNavigator

    func makeUIView(context: Context) -> PublicationWebHostView {
        PublicationWebHostView(navigator: navigator)
    }

    func updateUIView(_ webHost: PublicationWebHostView, context: Context) {
        navigator.attach(webHost, book: book, preferences: preferences, annotations: annotations)
    }
}

private final class PublicationWebHostView: UIView, PublicationWebHosting, UIGestureRecognizerDelegate {
    private(set) var activeWebView: WKWebView
    private let primaryWebView: WKWebView
    private let secondaryWebView: WKWebView
    private weak var navigator: PublicationNavigator?
    private weak var loadingWebView: WKWebView?
    private weak var preloadingWebView: WKWebView?
    private var preloadedResource: URL?
    private var isPreloadedChapterReady = false
    private let pageTapGesture = UITapGestureRecognizer()
    private let pagePanGesture = UIPanGestureRecognizer()
    private var didCommitPageSwipe = false

    init(navigator: PublicationNavigator) {
        let primary = Self.makeWebView(navigator: navigator)
        let secondary = Self.makeWebView(navigator: navigator)
        primaryWebView = primary
        secondaryWebView = secondary
        activeWebView = primary
        self.navigator = navigator
        super.init(frame: .zero)
        addSubview(primary)
        configureReadingGestures()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        primaryWebView.frame = bounds
        secondaryWebView.frame = bounds
    }

    func loadChapter(_ resource: URL, allowingReadAccessTo publicationRoot: URL, retainingCurrentContent: Bool) -> WKWebView? {
        let destination = retainingCurrentContent ? inactiveWebView : activeWebView
        let reusesPreload = retainingCurrentContent
            && preloadingWebView === destination
            && preloadedResource == resource
        let usesPreloadedChapter = reusesPreload && isPreloadedChapterReady
        if !reusesPreload { destination.stopLoading() }
        destination.layer.removeAllAnimations()
        destination.alpha = 1
        destination.transform = .identity
        destination.isHidden = false
        destination.accessibilityElementsHidden = false
        destination.isUserInteractionEnabled = !retainingCurrentContent
        destination.frame = bounds

        if retainingCurrentContent {
            activeWebView.layer.removeAllAnimations()
            activeWebView.alpha = 1
            insertSubview(destination, belowSubview: activeWebView)
        } else if destination.superview !== self {
            addSubview(destination)
        }

        loadingWebView = destination
        preloadingWebView = nil
        preloadedResource = nil
        isPreloadedChapterReady = false
        guard !usesPreloadedChapter else { return destination }
        guard !reusesPreload else { return nil }
        _ = destination.loadFileURL(resource, allowingReadAccessTo: publicationRoot)
        return nil
    }

    func preloadChapter(_ resource: URL, allowingReadAccessTo publicationRoot: URL) {
        guard loadingWebView == nil else { return }
        if preloadedResource == resource, isPreloadedChapterReady { return }

        let destination = inactiveWebView
        destination.stopLoading()
        destination.layer.removeAllAnimations()
        destination.alpha = 1
        destination.transform = .identity
        destination.isHidden = false
        destination.accessibilityElementsHidden = true
        destination.isUserInteractionEnabled = false
        destination.frame = bounds
        insertSubview(destination, belowSubview: activeWebView)

        preloadingWebView = destination
        preloadedResource = resource
        isPreloadedChapterReady = false
        _ = destination.loadFileURL(resource, allowingReadAccessTo: publicationRoot)
    }

    func isCurrentNavigation(_ webView: WKWebView) -> Bool {
        loadingWebView === webView
    }

    func isPreloadNavigation(_ webView: WKWebView) -> Bool {
        preloadingWebView === webView
    }

    func markPreloadedChapter(_ webView: WKWebView) {
        guard preloadingWebView === webView else { return }
        isPreloadedChapterReady = true
    }

    func revealLoadedChapter(_ webView: WKWebView, direction: ChapterNavigationDirection) {
        guard loadingWebView === webView else { return }
        loadingWebView = nil
        guard webView !== activeWebView else { return }

        let outgoing = activeWebView
        let reducesMotion = UIAccessibility.isReduceMotionEnabled
        activeWebView = webView
        webView.isUserInteractionEnabled = true
        bringSubviewToFront(webView)

        guard !reducesMotion else {
            webView.transform = .identity
            outgoing.removeFromSuperview()
            return
        }

        guard direction != .neutral else {
            webView.alpha = 0
            UIView.animate(
                withDuration: ChapterTransitionMotion.crossfadeDuration,
                delay: 0,
                options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseInOut],
                animations: {
                    outgoing.alpha = 0
                    webView.alpha = 1
                },
                completion: { _ in
                    guard outgoing !== self.activeWebView else { return }
                    outgoing.alpha = 1
                    outgoing.removeFromSuperview()
                }
            )
            return
        }

        let travel = max(bounds.width, 1)
        webView.transform = CGAffineTransform(translationX: direction.horizontalSign * travel, y: 0)
        outgoing.transform = .identity
        let animator = UIViewPropertyAnimator(
            duration: ChapterTransitionMotion.slideDuration,
            timingParameters: UICubicTimingParameters(
                controlPoint1: CGPoint(x: 0.22, y: 0.72),
                controlPoint2: CGPoint(x: 0, y: 1)
            )
        )
        animator.addAnimations {
            outgoing.transform = CGAffineTransform(translationX: -direction.horizontalSign * travel, y: 0)
            webView.transform = .identity
        }
        animator.addCompletion { _ in
                guard outgoing !== self.activeWebView else { return }
                outgoing.transform = .identity
                outgoing.removeFromSuperview()
        }
        animator.startAnimation()
    }

    private func configureReadingGestures() {
        pageTapGesture.addTarget(self, action: #selector(handlePageTap))
        pageTapGesture.cancelsTouchesInView = false
        pageTapGesture.delegate = self
        addGestureRecognizer(pageTapGesture)

        pagePanGesture.addTarget(self, action: #selector(handlePagePan(_:)))
        pagePanGesture.cancelsTouchesInView = true
        pagePanGesture.maximumNumberOfTouches = 1
        pagePanGesture.delegate = self
        addGestureRecognizer(pagePanGesture)

        pageTapGesture.require(toFail: pagePanGesture)
        primaryWebView.scrollView.panGestureRecognizer.require(toFail: pagePanGesture)
        secondaryWebView.scrollView.panGestureRecognizer.require(toFail: pagePanGesture)
    }

    @objc private func handlePageTap() {
        navigator?.onTap?()
    }

    @objc private func handlePagePan(_ gesture: UIPanGestureRecognizer) {
        let translation = gesture.translation(in: self)
        let velocity = gesture.velocity(in: self)

        switch gesture.state {
        case .began:
            didCommitPageSwipe = false
        case .changed:
            guard !didCommitPageSwipe, abs(translation.x) >= pageSwipeCommitDistance else { return }
            didCommitPageSwipe = true
            navigator?.navigateWithTrackpad(forward: translation.x < 0)
        case .ended:
            guard !didCommitPageSwipe,
                  abs(translation.x) >= 28 || abs(velocity.x) >= 420 else { return }
            didCommitPageSwipe = true
            navigator?.navigateWithTrackpad(forward: translation.x < 0)
        case .cancelled, .failed:
            didCommitPageSwipe = false
        default:
            break
        }
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === pagePanGesture else { return true }
        let velocity = pagePanGesture.velocity(in: self)
        return abs(velocity.x) > abs(velocity.y) * 1.1
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        gestureRecognizer === pageTapGesture || otherGestureRecognizer === pageTapGesture
    }

    private var pageSwipeCommitDistance: CGFloat {
        min(max(bounds.width * 0.09, 38), 54)
    }

    private var inactiveWebView: WKWebView {
        activeWebView === primaryWebView ? secondaryWebView : primaryWebView
    }

    private static func makeWebView(navigator: PublicationNavigator) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: makePublicationConfiguration(for: navigator))
        webView.navigationDelegate = navigator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        return webView
    }
}
#endif

private struct EPUBControlCluster<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View { HStack(spacing: 0) { content }.padding(3).glassEffect(.regular.interactive(), in: .capsule) }
}

private struct EPUBChromeButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void
    init(_ title: String, systemImage: String, action: @escaping () -> Void) { self.title = title; self.systemImage = systemImage; self.action = action }
    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage).font(.body.weight(.medium)).frame(width: 40, height: 40).contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .help(title)
    }
}

#if os(macOS)
private struct EPUBEdgeNavigationButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    init(_ title: String, systemImage: String, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 24, weight: .medium))
                .frame(width: 48, height: 76)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .help(title)
    }
}
#endif

private extension ReaderTheme {
    var cssBackground: String {
        switch self { case .automatic, .paper: "#F2EFE6"; case .sepia: "#E3D1AD"; case .night: "#1A1C21"; case .black: "#000000" }
    }
    var cssForeground: String {
        switch self { case .automatic, .paper: "#24211C"; case .sepia: "#332619"; case .night: "#DBDBD6"; case .black: "#D6D6D1" }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

private extension AnnotationColor {
    var cssHighlight: String {
        switch self {
        case .yellow: "rgba(255, 214, 64, .48)"
        case .green: "rgba(92, 214, 126, .42)"
        case .blue: "rgba(80, 170, 255, .42)"
        case .pink: "rgba(255, 105, 180, .40)"
        case .purple: "rgba(175, 120, 255, .42)"
        }
    }
}
