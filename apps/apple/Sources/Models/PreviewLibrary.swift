import Foundation
import GlassleafDomain

extension LibraryStore {
    static var preview: LibraryStore {
        let store = LibraryStore(books: PreviewLibrary.books)
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--reader-preview") {
            if var previewBook = store.books.first {
                previewBook.progress = .notStarted
                store.readerBook = previewBook
            }
        }
#endif
        return store
    }
}

enum PreviewLibrary {
    private static let now = Date.now

    static let books: [Book] = [
        Book(
            title: "The Garden Beyond",
            author: "Mira Ellison",
            summary: "A quiet, luminous journey through forgotten places and the memories rooted there.",
            series: "Field Notes",
            seriesIndex: 1,
            dateAdded: now.addingTimeInterval(-86_400 * 2),
            lastOpened: now.addingTimeInterval(-1_800),
            isFavorite: true,
            progress: ReadingProgress(locator: "chapter-8", fraction: 0.64),
            tags: ["Fiction", "Favorites"],
            coverStyle: .sage
        ),
        Book(
            title: "A Map of Small Stars",
            author: "Noah Vale",
            summary: "Essays about observation, night skies, and finding scale in ordinary life.",
            dateAdded: now.addingTimeInterval(-86_400 * 6),
            lastOpened: now.addingTimeInterval(-86_400),
            progress: ReadingProgress(locator: "essay-4", fraction: 0.28),
            tags: ["Essays"],
            coverStyle: .midnight
        ),
        Book(
            title: "The Shape of Rain",
            author: "Iris Rowan",
            summary: "A patient mystery set in a coastal town where every story changes with the weather.",
            dateAdded: now.addingTimeInterval(-86_400 * 9),
            isFavorite: true,
            tags: ["Mystery"],
            coverStyle: .ocean
        ),
        Book(
            title: "Common Ground",
            author: "Elias North",
            summary: "An illustrated field guide to resilient neighborhoods and the people who shape them.",
            dateAdded: now.addingTimeInterval(-86_400 * 14),
            progress: ReadingProgress(locator: "end", fraction: 1, isCompleted: true),
            tags: ["Design", "Reference"],
            coverStyle: .clay
        ),
        Book(
            title: "Letters from the Orchard",
            author: "June Bell",
            summary: "A warm collection of correspondence about seasons, friendship, and beginning again.",
            dateAdded: now.addingTimeInterval(-86_400 * 18),
            tags: ["Letters"],
            coverStyle: .linen
        ),
        Book(
            title: "After the Violet Hour",
            author: "Sana Wren",
            summary: "Poems for the blue edge of evening, where the familiar briefly becomes strange.",
            dateAdded: now.addingTimeInterval(-86_400 * 25),
            progress: ReadingProgress(locator: "poem-21", fraction: 0.82),
            tags: ["Poetry"],
            coverStyle: .plum
        ),
    ]
}
