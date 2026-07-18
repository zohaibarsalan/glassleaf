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
    var books: [Book]
    var selection: SidebarDestination = .home
    var presentedBook: Book?
    var readerBook: Book?
    var searchText = ""
    var layout: LibraryLayout = .grid

    init(books: [Book] = []) {
        self.books = books
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
