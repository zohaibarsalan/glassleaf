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
    @Environment(\.dismiss) private var dismiss
    @State private var section = ReaderSection.contents
    @State private var searchText = ""
    @State private var searchResults: [PublicationSearchResult] = []
    @State private var isSearching = false
    private let searchService = PublicationSearchService()

    private var links: [PublicationLink] { book.asset?.tableOfContents.isEmpty == false ? book.asset!.tableOfContents : book.asset?.readingOrder ?? [] }
    private var readingOrder: [PublicationLink] { book.asset?.readingOrder ?? [] }

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
            .padding(.bottom, 12)

            if section == .contents {
                searchField
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)
            }

            Divider()

            switch section {
            case .contents: contentsList
            case .bookmarks: bookmarksList
            case .notes: notesList
            }
        }
        .frame(minWidth: 320, idealWidth: 360, minHeight: 420, idealHeight: 620)
        .task(id: searchText) { await performSearch() }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Book Navigation")
                    .font(.headline)
                Text(book.title)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Button("Close", systemImage: "xmark") { dismiss() }
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .font(.body.weight(.semibold))
                .frame(width: 32, height: 32)
                .contentShape(.circle)
        }
        .padding(16)
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
        .padding(.horizontal, 10)
        .frame(height: 34)
        .background(.quaternary.opacity(0.65), in: .rect(cornerRadius: 9))
    }

    private var contentsList: some View {
        Group {
            if searchText.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 {
                if isSearching {
                    ProgressView("Searching book…").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if searchResults.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                } else {
                    List(searchResults) { result in
                        Button { onSelect(ReaderDestination(chapterIndex: result.chapterIndex)) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(result.title).font(.headline)
                                Text(result.snippet).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
                            }
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                List(Array(links.enumerated()), id: \.offset) { index, link in
                    Button { onSelect(ReaderDestination(chapterIndex: indexForReadingOrder(link) ?? index)) } label: {
                        HStack(spacing: 14) {
                            Text(index + 1, format: .number).font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 28)
                            Text(link.title ?? "Chapter \(index + 1)")
                            Spacer()
                            if indexForReadingOrder(link) == selectedChapter {
                                Image(systemName: "location.fill").foregroundStyle(.secondary).accessibilityLabel("Current chapter")
                            }
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var bookmarksList: some View {
        let values = store.bookmarks.filter { $0.bookID == book.id }.sorted { $0.createdAt > $1.createdAt }
        return Group {
            if values.isEmpty {
                ContentUnavailableView("No Bookmarks", systemImage: "bookmark", description: Text("Bookmark a page from the reader to find it here."))
            } else {
                List(values) { bookmark in
                    Button { if let destination = destination(locator: bookmark.locator) { onSelect(destination) } } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "bookmark.fill")
                                .foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 3) {
                            Text(bookmark.label ?? chapterTitle(locator: bookmark.locator))
                            Text(bookmark.createdAt, style: .date).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.tertiary)
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var notesList: some View {
        let values = store.annotations.filter { $0.bookID == book.id }.sorted { $0.updatedAt > $1.updatedAt }
        return Group {
            if values.isEmpty {
                ContentUnavailableView("No Notes", systemImage: "highlighter", description: Text("Select text or add a note from the reader."))
            } else {
                List(values) { annotation in
                    Button {
                        if let destination = destination(locator: annotation.locator) { onSelect(destination) }
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "highlighter")
                                .foregroundStyle(.secondary)
                                .padding(.top, 2)
                            VStack(alignment: .leading, spacing: 5) {
                                if let selected = annotation.selectedText, !selected.isEmpty {
                                    Text(selected).font(.subheadline).lineLimit(3)
                                }
                                if !annotation.note.isEmpty { Text(annotation.note).foregroundStyle(.secondary).lineLimit(3) }
                                Text(chapterTitle(locator: annotation.locator))
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.tertiary)
                                .padding(.top, 3)
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .swipeActions {
                        Button("Delete", systemImage: "trash", role: .destructive) { store.deleteAnnotation(annotation.id) }
                    }
                    .contextMenu {
                        Button("Delete Note", systemImage: "trash", role: .destructive) { store.deleteAnnotation(annotation.id) }
                    }
                }
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
        readingOrder.firstIndex { $0.href == link.href }
    }

    private func chapterIndex(locator: String) -> Int? {
        let href = locator.split(separator: "#", maxSplits: 1).first.map(String.init) ?? locator
        return readingOrder.firstIndex { $0.href == href }
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
