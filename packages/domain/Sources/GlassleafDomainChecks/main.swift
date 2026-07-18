import Foundation
import GlassleafDomain

private var failureCount = 0

@MainActor
private func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if condition() {
        print("PASS: \(message)")
    } else {
        failureCount += 1
        print("FAIL: \(message)")
    }
}

check(ReadingProgress(fraction: -0.2).fraction == 0, "progress clamps below zero")
check(ReadingProgress(fraction: 1.4).fraction == 1, "progress clamps above one")

check(
    Book(title: "Unread", author: "A").readingState == .unread,
    "untouched books are unread"
)
check(
    Book(
        title: "Reading",
        author: "A",
        progress: ReadingProgress(fraction: 0.35)
    ).readingState == .reading,
    "partial progress marks a book as reading"
)
check(
    Book(
        title: "Done",
        author: "A",
        progress: ReadingProgress(fraction: 0.8, isCompleted: true)
    ).readingState == .finished,
    "completion overrides partial progress"
)

let favorite = Book(title: "Favorite", author: "A", isFavorite: true)
let active = Book(
    title: "Active",
    author: "B",
    progress: ReadingProgress(fraction: 0.5)
)
check(LibraryFilter.favorites.includes(favorite), "favorites filter includes favorites")
check(!LibraryFilter.favorites.includes(active), "favorites filter excludes other books")
check(LibraryFilter.reading.includes(active), "reading filter includes active books")

let preferences = ReaderPreferences(
    fontScale: 4,
    lineSpacing: 0,
    horizontalMargin: 200
)
check(preferences.fontScale == 2, "font scale has a legible maximum")
check(preferences.lineSpacing == 2, "line spacing has a legible minimum")
check(preferences.horizontalMargin == 72, "reader margins have a useful maximum")

let asset = BookAsset(
    contentHash: String(repeating: "a", count: 64),
    byteCount: 1_024,
    originalFilename: "Example.epub",
    localRelativePath: "Books/example/Example.epub"
)
let assetBook = Book(title: "Example", author: "A", asset: asset)
let encodedBook = try JSONEncoder().encode(assetBook)
let decodedBook = try JSONDecoder().decode(Book.self, from: encodedBook)
check(decodedBook.asset == asset, "book assets survive portable encoding")

guard failureCount == 0 else {
    fatalError("\(failureCount) domain checks failed")
}

print("All Glassleaf domain checks passed.")
