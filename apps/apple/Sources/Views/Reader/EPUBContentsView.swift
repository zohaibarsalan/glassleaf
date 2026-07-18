import GlassleafDomain
import SwiftUI

struct ReaderDestination: Hashable, Sendable {
    let chapterIndex: Int
    let progress: Double

    init(chapterIndex: Int, progress: Double = 0) {
        self.chapterIndex = chapterIndex
        self.progress = min(max(progress, 0), 1)
    }
}

struct EPUBContentsView: View {
    let book: Book
    @Bindable var store: LibraryStore
    let selectedChapter: Int
    let onSelect: (ReaderDestination) -> Void
    let onClose: () -> Void
    let onBookmarkCurrent: () -> Void
    let onAddNote: () -> Void
    @State private var section = ReaderSection.contents
    @State private var searchText = ""
    @State private var searchResults: [PublicationSearchResult] = []
    @State private var isSearching = false
    private let searchService = PublicationSearchService()

    private var links: [PublicationLink] { book.asset?.tableOfContents.isEmpty == false ? book.asset!.tableOfContents : book.asset?.readingOrder ?? [] }
    private var readingOrder: [PublicationLink] { book.asset?.readingOrder ?? [] }
    private var bookmarks: [Bookmark] {
        store.bookmarks.filter { $0.bookID == book.id }.sorted { $0.createdAt > $1.createdAt }
    }
    private var notes: [Annotation] {
        store.annotations.filter { $0.bookID == book.id }.sorted { $0.updatedAt > $1.updatedAt }
    }
    private var contentEntries: [ReaderContentEntry] {
        let tableEntries = links.compactMap { link -> ReaderContentEntry? in
            guard let chapterIndex = indexForReadingOrder(link) else { return nil }
            return ReaderContentEntry(link: link, chapterIndex: chapterIndex)
        }
        guard !tableEntries.isEmpty else {
            return readingOrder.enumerated().map { index, link in
                ReaderContentEntry(link: link, chapterIndex: index)
            }
        }
        return tableEntries
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            Picker("Reader section", selection: $section) {
                Text("Contents").tag(ReaderSection.contents)
                Text("Bookmarks").tag(ReaderSection.bookmarks)
                Text("Notes").tag(ReaderSection.notes)
            }
            .labelsHidden()
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.bottom, 14)

            if section == .contents {
                searchField
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)
            }

            Divider().opacity(0.65)

            switch section {
            case .contents: contentsList
            case .bookmarks: bookmarksList
            case .notes: notesList
            }
        }
        .frame(minWidth: 320, idealWidth: 360, maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(.regularMaterial)
        #if os(macOS)
        .onExitCommand(perform: onClose)
        #endif
        .task(id: searchText) { await performSearch() }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(book.title)
                    .font(.headline.weight(.semibold))
                    .lineLimit(1)
                Text(section.summary(chapterCount: contentEntries.count, bookmarkCount: bookmarks.count, noteCount: notes.count))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Button("Close", systemImage: "xmark", action: onClose)
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .font(.subheadline.weight(.semibold))
                .frame(width: 34, height: 34)
                .contentShape(.circle)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 14)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search this book", text: $searchText)
                .textFieldStyle(.plain)
            if !searchText.isEmpty {
                Button("Clear Search", systemImage: "xmark.circle.fill") { searchText = "" }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 11)
        .frame(height: 36)
        .background(.quaternary.opacity(0.75), in: .rect(cornerRadius: 10))
    }

    private var contentsList: some View {
        Group {
            if searchText.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 {
                if isSearching {
                    ProgressView("Searching book…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if searchResults.isEmpty {
                    ReaderPaneEmptyState(
                        title: "No Results",
                        description: "Try a different title, phrase, or character name.",
                        systemImage: "magnifyingglass"
                    )
                } else {
                    List(searchResults) { result in
                        Button { onSelect(ReaderDestination(chapterIndex: result.chapterIndex)) } label: {
                            ReaderSearchResultRow(result: result)
                        }
                        .buttonStyle(ReaderPaneRowButtonStyle())
                        .readerPaneListRow()
                    }
                    .readerPaneListStyle()
                }
            } else {
                List(contentEntries) { entry in
                    Button { onSelect(ReaderDestination(chapterIndex: entry.chapterIndex)) } label: {
                        ReaderChapterRow(entry: entry, isCurrent: entry.chapterIndex == selectedChapter)
                    }
                    .buttonStyle(ReaderPaneRowButtonStyle())
                    .readerPaneListRow()
                }
                .readerPaneListStyle()
            }
        }
    }

    private var bookmarksList: some View {
        Group {
            if bookmarks.isEmpty {
                ReaderPaneEmptyState(
                    title: "No Bookmarks Yet",
                    description: "Save the current page so you can return to it instantly.",
                    systemImage: "bookmark",
                    actionTitle: "Bookmark Current Page",
                    actionSystemImage: "bookmark.fill",
                    action: onBookmarkCurrent
                )
            } else {
                List(bookmarks) { bookmark in
                    Button { if let destination = destination(locator: bookmark.locator) { onSelect(destination) } } label: {
                        ReaderBookmarkRow(
                            title: bookmark.label ?? chapterTitle(locator: bookmark.locator),
                            date: bookmark.createdAt
                        )
                    }
                    .buttonStyle(ReaderPaneRowButtonStyle())
                    .readerPaneListRow()
                    .swipeActions {
                        Button("Delete", systemImage: "trash", role: .destructive) { store.deleteBookmark(bookmark.id) }
                    }
                    .contextMenu {
                        Button("Delete Bookmark", systemImage: "trash", role: .destructive) { store.deleteBookmark(bookmark.id) }
                    }
                }
                .readerPaneListStyle()
            }
        }
    }

    private var notesList: some View {
        Group {
            if notes.isEmpty {
                ReaderPaneEmptyState(
                    title: "No Notes Yet",
                    description: "Capture a thought or highlight something worth remembering.",
                    systemImage: "pencil.and.scribble",
                    actionTitle: "Add a Note",
                    actionSystemImage: "pencil.tip",
                    action: onAddNote
                )
            } else {
                List(notes) { annotation in
                    Button {
                        if let destination = destination(locator: annotation.locator) { onSelect(destination) }
                    } label: {
                        ReaderNoteRow(annotation: annotation, chapterTitle: chapterTitle(locator: annotation.locator))
                    }
                    .buttonStyle(ReaderPaneRowButtonStyle())
                    .readerPaneListRow()
                    .swipeActions {
                        Button("Delete", systemImage: "trash", role: .destructive) { store.deleteAnnotation(annotation.id) }
                    }
                    .contextMenu {
                        Button("Delete Note", systemImage: "trash", role: .destructive) { store.deleteAnnotation(annotation.id) }
                    }
                }
                .readerPaneListStyle()
            }
        }
    }

    private func performSearch() async {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2, let asset = book.asset, let path = asset.extractedRelativePath,
              let support = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: false) else {
            searchResults = []
            isSearching = false
            return
        }
        isSearching = true
        let root = support.appending(path: "Glassleaf").appending(path: path)
        let result = try? await searchService.search(query, rootURL: root, links: readingOrder)
        guard !Task.isCancelled, searchText.trimmingCharacters(in: .whitespacesAndNewlines) == query else { return }
        searchResults = result ?? []
        isSearching = false
    }

    private func indexForReadingOrder(_ link: PublicationLink) -> Int? {
        let resource = normalizedResourcePath(link.href)
        return readingOrder.firstIndex { normalizedResourcePath($0.href) == resource }
    }

    private func normalizedResourcePath(_ href: String) -> String {
        let resource = href.split(separator: "#", maxSplits: 1).first.map(String.init) ?? href
        return ((resource.removingPercentEncoding ?? resource) as NSString).standardizingPath
    }

    private func chapterIndex(locator: String) -> Int? {
        let href = locator.split(separator: "#", maxSplits: 1).first.map(String.init) ?? locator
        let resource = normalizedResourcePath(href)
        return readingOrder.firstIndex { normalizedResourcePath($0.href) == resource }
    }

    private func destination(locator: String) -> ReaderDestination? {
        guard let chapterIndex = chapterIndex(locator: locator) else { return nil }
        let progress = locator.components(separatedBy: "#progress=").last.flatMap(Double.init) ?? 0
        return ReaderDestination(chapterIndex: chapterIndex, progress: progress)
    }

    private func chapterTitle(locator: String) -> String {
        guard let index = chapterIndex(locator: locator) else { return "Bookmark" }
        return readingOrder[index].title ?? "Chapter \(index + 1)"
    }
}

private enum ReaderSection: Hashable {
    case contents, bookmarks, notes

    func summary(chapterCount: Int, bookmarkCount: Int, noteCount: Int) -> String {
        switch self {
        case .contents:
            "\(chapterCount) \(chapterCount == 1 ? "chapter" : "chapters")"
        case .bookmarks:
            "\(bookmarkCount) \(bookmarkCount == 1 ? "bookmark" : "bookmarks")"
        case .notes:
            "\(noteCount) \(noteCount == 1 ? "note" : "notes")"
        }
    }
}

private struct ReaderContentEntry: Identifiable {
    let link: PublicationLink
    let chapterIndex: Int
    var id: String { "\(chapterIndex):\(link.href)" }
}

private struct ReaderChapterRow: View {
    let entry: ReaderContentEntry
    let isCurrent: Bool

    var body: some View {
        HStack(spacing: 12) {
            Text(entry.chapterIndex + 1, format: .number)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 28, alignment: .trailing)

            Text(entry.link.title ?? "Chapter \(entry.chapterIndex + 1)")
                .font(.subheadline.weight(isCurrent ? .semibold : .regular))
                .lineLimit(2)

            Spacer(minLength: 8)

            if isCurrent {
                Image(systemName: "checkmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(.tint)
                    .accessibilityLabel("Current chapter")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(minHeight: 42)
        .background(isCurrent ? Color.accentColor.opacity(0.14) : .clear, in: .rect(cornerRadius: 9))
        .contentShape(.rect)
    }
}

private struct ReaderSearchResultRow: View {
    let result: PublicationSearchResult

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(result.title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
            Text(result.snippet)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
        .contentShape(.rect)
    }
}

private struct ReaderBookmarkRow: View {
    let title: String
    let date: Date

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "bookmark.fill")
                .font(.subheadline)
                .foregroundStyle(.tint)
                .frame(width: 28, height: 28)
                .background(Color.accentColor.opacity(0.13), in: .rect(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                Text(date, format: .dateTime.month(.abbreviated).day().year())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(minHeight: 54)
        .contentShape(.rect)
    }
}

private struct ReaderNoteRow: View {
    let annotation: Annotation
    let chapterTitle: String

    private var primaryText: String {
        if let selectedText = annotation.selectedText?.trimmingCharacters(in: .whitespacesAndNewlines), !selectedText.isEmpty {
            return selectedText
        }
        let note = annotation.note.trimmingCharacters(in: .whitespacesAndNewlines)
        return note.isEmpty ? "Untitled note" : note
    }

    private var secondaryText: String? {
        guard annotation.selectedText?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else { return nil }
        let note = annotation.note.trimmingCharacters(in: .whitespacesAndNewlines)
        return note.isEmpty ? nil : note
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "highlighter")
                .font(.subheadline)
                .foregroundStyle(annotation.color.readerColor)
                .frame(width: 28, height: 28)
                .background(annotation.color.readerColor.opacity(0.14), in: .rect(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 4) {
                Text(primaryText)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(3)
                if let secondaryText {
                    Text(secondaryText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Text("\(chapterTitle) · \(annotation.updatedAt.formatted(.dateTime.month(.abbreviated).day()))")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .padding(.top, 5)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(minHeight: 62)
        .contentShape(.rect)
    }
}

private struct ReaderPaneEmptyState: View {
    let title: String
    let description: String
    let systemImage: String
    var actionTitle: String?
    var actionSystemImage: String?
    var action: (() -> Void)?

    init(
        title: String,
        description: String,
        systemImage: String,
        actionTitle: String? = nil,
        actionSystemImage: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.description = description
        self.systemImage = systemImage
        self.actionTitle = actionTitle
        self.actionSystemImage = actionSystemImage
        self.action = action
    }

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 30, weight: .regular))
                .foregroundStyle(.secondary)
                .frame(height: 36)
            Text(title)
                .font(.headline)
            Text(description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 250)

            if let actionTitle, let action {
                Button(actionTitle, systemImage: actionSystemImage ?? "plus", action: action)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.regular)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }
}

private struct ReaderPaneRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.65 : 1)
    }
}

private extension View {
    func readerPaneListRow() -> some View {
        listRowInsets(.init(top: 2, leading: 8, bottom: 2, trailing: 8))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }

    func readerPaneListStyle() -> some View {
        listStyle(.plain)
            .scrollContentBackground(.hidden)
    }
}

private extension AnnotationColor {
    var readerColor: Color {
        switch self {
        case .yellow: .yellow
        case .green: .green
        case .blue: .blue
        case .pink: .pink
        case .purple: .purple
        }
    }
}

struct ReaderNoteEditor: View {
    let selectedText: String
    let onSave: (String, AnnotationColor) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var color = AnnotationColor.yellow

    var body: some View {
        NavigationStack {
            Form {
                if !selectedText.isEmpty {
                    Section("Selection") { Text(selectedText).textSelection(.enabled) }
                }
                Section("Note") {
                    TextField("Add your thoughts", text: $note, axis: .vertical).lineLimit(5...12)
                    Picker("Highlight", selection: $color) {
                        ForEach(AnnotationColor.allCases) { value in Text(value.rawValue.capitalized).tag(value) }
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle(selectedText.isEmpty ? "Add Note" : "Highlight and Note")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(note.trimmingCharacters(in: .whitespacesAndNewlines), color); dismiss() }
                }
            }
        }
        .frame(minWidth: 360, idealWidth: 480, minHeight: 360, idealHeight: 520)
    }
}
