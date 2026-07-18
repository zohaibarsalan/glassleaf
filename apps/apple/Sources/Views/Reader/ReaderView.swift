import GlassleafDomain
import SwiftUI

struct ReaderView: View {
    let book: Book
    @Bindable var store: LibraryStore

    var body: some View {
        if book.asset?.readingOrder.isEmpty == false {
            EPUBReaderView(book: book, store: store)
        } else {
            PrototypeReaderView(book: book, store: store)
        }
    }
}

private struct PrototypeReaderView: View {
    let book: Book
    @Bindable var store: LibraryStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    @State private var preferences: ReaderPreferences
    @State private var chapterIndex = 0
    @State private var pageIndex = 0
    @State private var controlsVisible = true
    @State private var isBookmarked = false
    @State private var showsContents = false
    @State private var showsSettings = false
    @State private var hideControlsTask: Task<Void, Never>?

    init(book: Book, store: LibraryStore) {
        self.book = book
        self.store = store
        _preferences = State(initialValue: store.readerPreferences)
    }

    private var chapter: ReaderChapter {
        ReaderSample.chapters[chapterIndex]
    }

    private var progress: Double {
        let pagesBeforeChapter = ReaderSample.chapters
            .prefix(chapterIndex)
            .reduce(0) { $0 + $1.pages.count }
        let currentPage = pagesBeforeChapter + pageIndex
        let pageCount = ReaderSample.chapters.reduce(0) { $0 + $1.pages.count }
        return Double(currentPage) / Double(max(pageCount - 1, 1))
    }

    private var readerColorScheme: ColorScheme {
        switch preferences.theme.resolved(for: colorScheme) {
        case .night, .black: .dark
        case .automatic, .paper, .sepia: .light
        }
    }

    var body: some View {
        ZStack {
            preferences.theme.background(for: colorScheme)
                .ignoresSafeArea()

            readingCanvas

            if controlsVisible {
                readerChrome
                    .transition(.opacity)
            }
        }
        .foregroundStyle(preferences.theme.foreground(for: colorScheme))
        .preferredColorScheme(readerColorScheme)
        .animation(reduceMotion ? nil : .smooth(duration: 0.22), value: controlsVisible)
        .modifier(ReaderSystemChromeModifier(controlsVisible: controlsVisible))
        .onAppear {
            seek(to: book.progress.fraction)
            scheduleControlsHide()
        }
        .onDisappear {
            hideControlsTask?.cancel()
        }
        .onChange(of: preferences) { _, value in
            store.updateReaderPreferences(value)
        }
        .sheet(isPresented: $showsContents) {
            ReaderContentsView(selectedChapter: chapterIndex) { index in
                chapterIndex = index
                pageIndex = 0
                showsContents = false
                revealControls()
            }
        }
        .sheet(isPresented: $showsSettings) {
            ReaderSettingsView(preferences: $preferences)
        }
    }

    @ViewBuilder
    private var readingCanvas: some View {
        switch preferences.mode {
        case .paginated:
            paginatedCanvas
        case .scrolling:
            scrollingCanvas
        }
    }

    private var paginatedCanvas: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                Spacer(minLength: controlsVisible ? 92 : 48)

                VStack(alignment: .leading, spacing: 22) {
                    if pageIndex == 0 {
                        Text(chapter.title)
                            .font(.system(size: 29 * preferences.fontScale, weight: .bold, design: .serif))
                            .accessibilityAddTraits(.isHeader)
                    }

                    Text(chapter.pages[pageIndex])
                        .font(preferences.fontFamily.swiftUIFont(size: 19 * preferences.fontScale))
                        .lineSpacing(preferences.lineSpacing)
                        .textSelection(.enabled)
                }
                .frame(
                    maxWidth: min(
                        900 - (preferences.horizontalMargin * 2),
                        proxy.size.width - (preferences.horizontalMargin * 2)
                    ),
                    maxHeight: .infinity,
                    alignment: .topLeading
                )
                .padding(.top, 24)

                Spacer(minLength: controlsVisible ? 96 : 50)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(.rect)
            .onTapGesture { toggleControls() }
            .simultaneousGesture(pageSwipe)
        }
    }

    private var scrollingCanvas: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 48) {
                ForEach(Array(ReaderSample.chapters.enumerated()), id: \.element.id) { index, item in
                    VStack(alignment: .leading, spacing: 22) {
                        Text(item.title)
                            .font(.system(size: 29 * preferences.fontScale, weight: .bold, design: .serif))
                            .accessibilityAddTraits(.isHeader)

                        ForEach(item.pages, id: \.self) { page in
                            Text(page)
                                .font(preferences.fontFamily.swiftUIFont(size: 19 * preferences.fontScale))
                                .lineSpacing(preferences.lineSpacing)
                                .textSelection(.enabled)
                        }
                    }
                    .id(index)
                }
            }
            .frame(maxWidth: 900 - (preferences.horizontalMargin * 2), alignment: .leading)
            .padding(.top, controlsVisible ? 110 : 52)
            .padding(.bottom, controlsVisible ? 120 : 60)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(controlsVisible ? .visible : .hidden)
        .contentShape(.rect)
        .onTapGesture { toggleControls() }
        .simultaneousGesture(pageSwipe)
    }

    private var readerChrome: some View {
        VStack {
            topControls
            Spacer()
            bottomControls
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .foregroundStyle(.primary)
    }

    private var macOSTitleBarControlClearance: CGFloat {
#if os(macOS)
        74
#else
        0
#endif
    }

    private var topControls: some View {
        ZStack(alignment: .top) {
            HStack(alignment: .top) {
                ReaderControlCluster {
                    ReaderChromeButton("Back to Library", systemImage: "chevron.left") {
                        store.closeReader(at: progress)
                    }
                }

                Spacer(minLength: 12)

                ReaderControlCluster {
                    ReaderChromeButton("Contents", systemImage: "list.bullet.rectangle") {
                        showsContents = true
                        revealControls()
                    }
                    ReaderChromeButton("Appearance", systemImage: "textformat.size") {
                        showsSettings = true
                        revealControls()
                    }
                    ReaderChromeButton(
                        isBookmarked ? "Remove Bookmark" : "Add Bookmark",
                        systemImage: isBookmarked ? "bookmark.fill" : "bookmark"
                    ) {
                        isBookmarked.toggle()
                        revealControls()
                    }
                }
            }
            .padding(.leading, macOSTitleBarControlClearance)

            if horizontalSizeClass != .compact {
                VStack(spacing: 2) {
                    Text(book.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(chapter.title)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding(.horizontal, 12)
                .frame(maxWidth: 300, minHeight: 44)
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var bottomControls: some View {
        HStack(spacing: 12) {
            ReaderChromeButton("Previous Page", systemImage: "chevron.left") {
                previousPage()
                revealControls()
            }
            .disabled(chapterIndex == 0 && pageIndex == 0)

            Slider(
                value: Binding(
                    get: { progress },
                    set: { value in seek(to: value) }
                ),
                in: 0...1
            )
            .tint(.primary)
            .frame(maxWidth: 520)
            .accessibilityLabel("Reading progress")

            Text(progress, format: .percent.precision(.fractionLength(0)))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 38, alignment: .trailing)

            ReaderChromeButton("Next Page", systemImage: "chevron.right") {
                nextPage()
                revealControls()
            }
            .disabled(
                chapterIndex == ReaderSample.chapters.count - 1
                    && pageIndex == chapter.pages.count - 1
            )
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .frame(maxWidth: 620)
        .glassEffect(.regular.interactive(), in: .capsule)
    }

    private var pageSwipe: some Gesture {
        DragGesture(minimumDistance: 28)
            .onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                if value.translation.width < 0 {
                    nextPage()
                } else {
                    previousPage()
                }
            }
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
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--reader-preview") { return }
#endif
        hideControlsTask = Task {
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            controlsVisible = false
        }
    }

    private func nextPage() {
        if pageIndex < chapter.pages.count - 1 {
            pageIndex += 1
        } else if chapterIndex < ReaderSample.chapters.count - 1 {
            chapterIndex += 1
            pageIndex = 0
        }
    }

    private func previousPage() {
        if pageIndex > 0 {
            pageIndex -= 1
        } else if chapterIndex > 0 {
            chapterIndex -= 1
            pageIndex = ReaderSample.chapters[chapterIndex].pages.count - 1
        }
    }

    private func seek(to fraction: Double) {
        let pageCount = ReaderSample.chapters.reduce(0) { $0 + $1.pages.count }
        let target = min(max(Int((fraction * Double(pageCount - 1)).rounded()), 0), pageCount - 1)
        var remaining = target

        for (index, item) in ReaderSample.chapters.enumerated() {
            if remaining < item.pages.count {
                chapterIndex = index
                pageIndex = remaining
                return
            }
            remaining -= item.pages.count
        }
    }
}

struct ReaderSystemChromeModifier: ViewModifier {
    let controlsVisible: Bool

    func body(content: Content) -> some View {
#if os(iOS)
        content
            .preference(
                key: ReaderChromeVisibilityPreferenceKey.self,
                value: controlsVisible
            )
#else
        content
            .toolbarVisibility(.hidden, for: .windowToolbar)
#endif
    }
}

struct ReaderChromeVisibilityPreferenceKey: PreferenceKey {
    static let defaultValue = true

    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = nextValue()
    }
}

struct AppReaderSystemChromeModifier: ViewModifier {
    let readerPresented: Bool
    let controlsVisible: Bool

    func body(content: Content) -> some View {
#if os(iOS)
        let hidesSystemChrome = readerPresented && !controlsVisible
        content
            .statusBarHidden(hidesSystemChrome)
            .persistentSystemOverlays(hidesSystemChrome ? .hidden : .automatic)
#else
        content
#endif
    }
}

private struct ReaderControlCluster<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        HStack(spacing: 0) {
            content
        }
        .padding(3)
        .glassEffect(.regular.interactive(), in: .capsule)
    }
}

private struct ReaderChromeButton: View {
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
                .font(.body.weight(.medium))
                .frame(width: 40, height: 40)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .help(title)
    }
}

private extension ReaderFont {
    func swiftUIFont(size: CGFloat) -> Font {
        switch self {
        case .serif: .system(size: size, design: .serif)
        case .sans: .system(size: size, design: .default)
        case .rounded: .system(size: size, design: .rounded)
        }
    }
}

extension ReaderTheme {
    func resolved(for colorScheme: ColorScheme) -> ReaderTheme {
        guard self == .automatic else { return self }
        return colorScheme == .dark ? .night : .paper
    }

    func background(for colorScheme: ColorScheme) -> Color {
        resolved(for: colorScheme).background
    }

    func foreground(for colorScheme: ColorScheme) -> Color {
        resolved(for: colorScheme).foreground
    }

    var background: Color {
        switch self {
        case .automatic: Color(red: 0.95, green: 0.94, blue: 0.90)
        case .paper: Color(red: 0.95, green: 0.94, blue: 0.90)
        case .sepia: Color(red: 0.89, green: 0.82, blue: 0.68)
        case .night: Color(red: 0.10, green: 0.11, blue: 0.13)
        case .black: .black
        }
    }

    var foreground: Color {
        switch self {
        case .automatic: Color(red: 0.14, green: 0.13, blue: 0.11)
        case .paper: Color(red: 0.14, green: 0.13, blue: 0.11)
        case .sepia: Color(red: 0.20, green: 0.15, blue: 0.10)
        case .night: Color(red: 0.86, green: 0.86, blue: 0.84)
        case .black: Color(red: 0.84, green: 0.84, blue: 0.82)
        }
    }
}
