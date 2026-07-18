import GlassleafDomain
import Observation
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
            PublicationWebView(book: book, preferences: resolvedPreferences, annotations: annotations, navigator: navigator)
                .ignoresSafeArea()

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
            EPUBContentsView(book: book, store: store, selectedChapter: navigator.chapterIndex) { destination in
                navigator.goToChapter(destination.chapterIndex, progress: destination.progress)
                showsContents = false
                revealControls()
            }
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
        controlsVisible ? (controlsVisible = false) : revealControls()
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
    @ObservationIgnored private weak var webView: WKWebView?
    @ObservationIgnored private var book: Book?
    @ObservationIgnored private var preferences = ReaderPreferences()
    @ObservationIgnored private var annotations: [Annotation] = []
    @ObservationIgnored private var pendingProgress = 0.0
    @ObservationIgnored private var isWaitingForWebView = false

    func attach(_ webView: WKWebView, book: Book, preferences: ReaderPreferences, annotations: [Annotation]) {
        guard self.webView !== webView else {
            let annotationsChanged = self.annotations != annotations
            self.annotations = annotations
            apply(preferences: preferences)
            if annotationsChanged { renderAnnotations() }
            return
        }
        self.webView = webView
        self.book = book
        self.preferences = preferences
        self.annotations = annotations
        webView.navigationDelegate = self
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
        guard webView != nil else {
            isWaitingForWebView = true
            return
        }
        loadChapter(chapterIndex)
    }

    func goToChapter(_ index: Int, progress: Double = 0) {
        guard let links = book?.asset?.readingOrder, links.indices.contains(index) else { return }
        chapterIndex = index
        pendingProgress = min(max(progress, 0), 1)
        loadChapter(index)
    }

    func next() {
        evaluate("window.glassleafNext && window.glassleafNext()") { [weak self] value in
            guard let self, value as? Bool != true else { return }
            self.goToChapter(self.chapterIndex + 1)
        }
    }

    func previous() {
        evaluate("window.glassleafPrevious && window.glassleafPrevious()") { [weak self] value in
            guard let self, value as? Bool != true else { return }
            self.goToChapter(self.chapterIndex - 1, progress: 1)
        }
    }

    func navigateWithTrackpad(forward: Bool) {
        switch preferences.mode {
        case .paginated:
            forward ? next() : previous()
        case .scrolling:
            goToChapter(chapterIndex + (forward ? 1 : -1), progress: forward ? 0 : 1)
        }
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
        evaluate(Self.bootstrapScript(preferences: preferences, progress: pendingProgress)) { [weak self, weak webView] _ in
            guard let self else { return }
            self.isReady = true
            self.hasLoadedContent = true
            self.renderAnnotations()
            (webView as? ChapterTransitioningWebView)?.revealLoadedChapter()
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "glassleafTap": onTap?()
        case "glassleafPage":
            switch message.body as? String {
            case "next": next()
            case "previous": previous()
            case "nextChapter": goToChapter(chapterIndex + 1)
            case "previousChapter": goToChapter(chapterIndex - 1, progress: 1)
            default: break
            }
        case "glassleafProgress":
            if let value = message.body as? NSNumber { chapterProgress = min(max(value.doubleValue, 0), 1) }
        case "glassleafSelection": selectedText = message.body as? String ?? ""
        default: break
        }
    }

    private func loadChapter(_ index: Int) {
        guard let webView, let book, let asset = book.asset, let rootPath = asset.extractedRelativePath,
              asset.readingOrder.indices.contains(index), let root = PublicationLocation.rootURL() else { return }
        isReady = false
        chapterProgress = pendingProgress
        let publicationRoot = root.appending(path: rootPath, directoryHint: .isDirectory)
        let resource = publicationRoot.appending(path: asset.readingOrder[index].href)
        let beginLoad = {
            _ = webView.loadFileURL(resource, allowingReadAccessTo: publicationRoot)
        }
        if hasLoadedContent, let transitioningWebView = webView as? ChapterTransitioningWebView {
            transitioningWebView.prepareForChapterNavigation(beginLoad)
        } else {
            beginLoad()
        }
    }

    private func evaluate(_ script: String, completion: ((Any?) -> Void)? = nil) {
        webView?.evaluateJavaScript(script) { value, _ in completion?(value) }
    }

    private func renderAnnotations() {
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
        evaluate(Self.highlightScript(json: json))
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
        """
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
            if (event.key === 'ArrowRight' || event.key === 'PageDown') {
              event.preventDefault(); webkit.messageHandlers.glassleafPage.postMessage('next');
            } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
              event.preventDefault(); webkit.messageHandlers.glassleafPage.postMessage('previous');
            }
          });
          addEventListener('scroll', report, {passive: true});
          addEventListener('click', event => { if (!event.target.closest('a')) webkit.messageHandlers.glassleafTap.postMessage('tap'); });
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
private protocol ChapterTransitioningWebView: AnyObject {
    func prepareForChapterNavigation(_ completion: @escaping () -> Void)
    func revealLoadedChapter()
}

private enum ChapterTransitionMotion {
    static let crossfadeDuration: TimeInterval = 0.28
}

#if os(macOS)
private struct PublicationWebView: NSViewRepresentable {
    let book: Book
    let preferences: ReaderPreferences
    let annotations: [Annotation]
    let navigator: PublicationNavigator

    func makeNSView(context: Context) -> WKWebView { makeWebView() }
    func updateNSView(_ webView: WKWebView, context: Context) { navigator.attach(webView, book: book, preferences: preferences, annotations: annotations) }

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(navigator, name: "glassleafTap")
        configuration.userContentController.add(navigator, name: "glassleafPage")
        configuration.userContentController.add(navigator, name: "glassleafProgress")
        configuration.userContentController.add(navigator, name: "glassleafSelection")
        let webView = TrackpadAwareWebView(frame: .zero, configuration: configuration)
        webView.onHorizontalSwipe = { [weak navigator] forward in
            navigator?.navigateWithTrackpad(forward: forward)
        }
        webView.setValue(false, forKey: "drawsBackground")
        return webView
    }
}

private final class TrackpadAwareWebView: WKWebView, ChapterTransitioningWebView {
    var onHorizontalSwipe: ((Bool) -> Void)?

    private var transitionSnapshot: NSImageView?
    private var horizontalDistance: CGFloat = 0
    private var verticalDistance: CGFloat = 0
    private var gestureAxis: GestureAxis = .undecided
    private var suppressesMomentum = false

    func prepareForChapterNavigation(_ completion: @escaping () -> Void) {
        transitionSnapshot?.removeFromSuperview()
        takeSnapshot(with: nil) { [weak self] image, _ in
            guard let self, let image else {
                completion()
                return
            }
            let snapshot = PassthroughImageView(frame: self.bounds)
            snapshot.image = image
            snapshot.imageScaling = .scaleAxesIndependently
            snapshot.autoresizingMask = [.width, .height]
            self.addSubview(snapshot)
            self.transitionSnapshot = snapshot
            completion()
        }
    }

    func revealLoadedChapter() {
        guard let transitionSnapshot else { return }
        self.transitionSnapshot = nil
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else {
            transitionSnapshot.removeFromSuperview()
            return
        }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = ChapterTransitionMotion.crossfadeDuration
            transitionSnapshot.animator().alphaValue = 0
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
        if gestureEnded {
            defer { resetGesture() }
            guard gestureAxis == .horizontal else {
                super.scrollWheel(with: event)
                return
            }

            suppressesMomentum = true
            guard abs(horizontalDistance) >= commitDistance else { return }

            // NSEvent's horizontal delta is the inverse of the DOM scroll direction.
            onHorizontalSwipe?(horizontalDistance < 0)
            return
        }

        if gestureAxis == .horizontal {
            suppressesMomentum = true
            return
        }

        super.scrollWheel(with: event)
    }

    private var commitDistance: CGFloat {
        min(max(bounds.width * 0.075, 82), 120)
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
    }

    private enum GestureAxis {
        case undecided
        case horizontal
    }
}

private final class PassthroughImageView: NSImageView {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}
#else
private struct PublicationWebView: UIViewRepresentable {
    let book: Book
    let preferences: ReaderPreferences
    let annotations: [Annotation]
    let navigator: PublicationNavigator

    func makeUIView(context: Context) -> WKWebView { makeWebView() }
    func updateUIView(_ webView: WKWebView, context: Context) { navigator.attach(webView, book: book, preferences: preferences, annotations: annotations) }

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(navigator, name: "glassleafTap")
        configuration.userContentController.add(navigator, name: "glassleafPage")
        configuration.userContentController.add(navigator, name: "glassleafProgress")
        configuration.userContentController.add(navigator, name: "glassleafSelection")
        let webView = TransitioningWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        return webView
    }
}

private final class TransitioningWebView: WKWebView, ChapterTransitioningWebView {
    private var transitionSnapshot: UIImageView?

    func prepareForChapterNavigation(_ completion: @escaping () -> Void) {
        transitionSnapshot?.removeFromSuperview()
        takeSnapshot(with: nil) { [weak self] image, _ in
            guard let self, let image else {
                completion()
                return
            }
            let snapshot = UIImageView(image: image)
            snapshot.frame = self.bounds
            snapshot.contentMode = .scaleToFill
            snapshot.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            self.addSubview(snapshot)
            self.transitionSnapshot = snapshot
            completion()
        }
    }

    func revealLoadedChapter() {
        guard let transitionSnapshot else { return }
        self.transitionSnapshot = nil
        guard !UIAccessibility.isReduceMotionEnabled else {
            transitionSnapshot.removeFromSuperview()
            return
        }
        UIView.animate(
            withDuration: ChapterTransitionMotion.crossfadeDuration,
            delay: 0,
            options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseInOut],
            animations: {
                transitionSnapshot.alpha = 0
            },
            completion: { _ in
                transitionSnapshot.removeFromSuperview()
            }
        )
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
