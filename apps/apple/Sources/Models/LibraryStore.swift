import Foundation
import GlassleafDomain
import Observation

enum SidebarDestination: Hashable, Sendable {
    case home
    case library(LibraryFilter)

    var title: String {
        switch self {
        case .home:
            "Home"
        case .library(let filter):
            filter.title
        }
    }

    var systemImage: String {
        switch self {
        case .home:
            "house"
        case .library(.all):
            "books.vertical"
        case .library(.unread):
            "circle"
        case .library(.reading):
            "bookmark"
        case .library(.finished):
            "checkmark.circle"
        case .library(.favorites):
            "star"
        }
    }
}

enum LibraryLayout: String, CaseIterable, Identifiable, Sendable {
    case grid
    case list

    var id: Self { self }
}

@MainActor
@Observable
final class LibraryStore {
    struct ImportAlert: Identifiable {
        let id = UUID()
        let title: String
        let message: String
    }

    var books: [Book]
    var selection: SidebarDestination = .home
    var presentedBook: Book?
    var readerBook: Book?
    var searchText = ""
    var layout: LibraryLayout = .grid
    var showsImporter = false
    var isImporting = false
    var importAlert: ImportAlert?

    private let isPreview: Bool
    private let repository = LocalLibraryRepository()
    private let importer = LocalBookImporter()

    init(books: [Book] = [], isPreview: Bool = false) {
        self.books = books
        self.isPreview = isPreview
    }

    func books(matching filter: LibraryFilter) -> [Book] {
        books
            .filter(filter.includes)
            .filter(matchesSearch)
            .sorted { lhs, rhs in
                (lhs.lastOpened ?? lhs.dateAdded) > (rhs.lastOpened ?? rhs.dateAdded)
            }
    }

    func toggleFavorite(for id: Book.ID) {
        guard let index = books.firstIndex(where: { $0.id == id }) else { return }
        books[index].isFavorite.toggle()
        refreshPresentedBook(id: id)
        persist()
    }

    func showDetails(for book: Book) {
        presentedBook = book
    }

    func startReading(_ book: Book) {
        presentedBook = nil
        readerBook = book
    }

    func closeReader(at fraction: Double) {
        guard let id = readerBook?.id,
              let index = books.firstIndex(where: { $0.id == id }) else {
            readerBook = nil
            return
        }

        books[index].progress = ReadingProgress(
            locator: "prototype:\(fraction)",
            fraction: fraction,
            deviceID: "local-preview",
            isCompleted: fraction >= 0.995
        )
        books[index].lastOpened = .now
        readerBook = nil
        persist()
    }

    func loadLibrary() async {
        guard !isPreview else { return }

        do {
            books = try await repository.load().books
        } catch {
            importAlert = ImportAlert(
                title: "Library Couldn’t Be Loaded",
                message: "Your stored books were left unchanged. Try reopening Glassleaf."
            )
        }
    }

    func requestImport() {
        showsImporter = true
    }

    func importBooks(from urls: [URL]) async {
        guard !urls.isEmpty else { return }
        isImporting = true
        defer { isImporting = false }

        var existingHashes = Set(books.compactMap(\.asset?.contentHash))
        var importedCount = 0
        var failures: [String] = []

        for url in urls {
            do {
                let book = try await importer.importBook(
                    from: url,
                    existingHashes: existingHashes
                )
                books.insert(book, at: 0)
                if let hash = book.asset?.contentHash {
                    existingHashes.insert(hash)
                }
                importedCount += 1
            } catch {
                failures.append(error.localizedDescription)
            }
        }

        if importedCount > 0 {
            selection = .library(.all)
            persist()
        }

        if !failures.isEmpty {
            let uniqueFailures = Array(Set(failures)).sorted().joined(separator: "\n")
            importAlert = ImportAlert(
                title: importedCount > 0 ? "Some Books Weren’t Imported" : "Import Failed",
                message: uniqueFailures
            )
        }
    }

    private func matchesSearch(_ book: Book) -> Bool {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return true }

        return book.title.localizedStandardContains(query)
            || book.author.localizedStandardContains(query)
            || book.series?.localizedStandardContains(query) == true
            || book.tags.contains(where: { $0.localizedStandardContains(query) })
    }

    private func refreshPresentedBook(id: Book.ID) {
        guard presentedBook?.id == id else { return }
        presentedBook = books.first(where: { $0.id == id })
    }

    private func persist() {
        guard !isPreview else { return }
        let snapshot = books
        Task {
            try? await repository.save(LibrarySnapshot(books: snapshot))
        }
    }
}

extension LibraryFilter {
    var title: String {
        switch self {
        case .all: "Library"
        case .unread: "Unread"
        case .reading: "Reading"
        case .finished: "Finished"
        case .favorites: "Favorites"
        }
    }
}
