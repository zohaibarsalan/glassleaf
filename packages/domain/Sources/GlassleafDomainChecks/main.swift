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

let publicationAsset = BookAsset(
    contentHash: String(repeating: "b", count: 64),
    byteCount: 2_048,
    originalFilename: "Publication.epub",
    localRelativePath: "Books/publication/Publication.epub",
    extractedRelativePath: "Books/publication/Publication",
    readingOrder: [PublicationLink(href: "chapter-1.xhtml", title: "Chapter One")]
)
let publicationData = try JSONEncoder().encode(publicationAsset)
let decodedPublicationAsset = try JSONDecoder().decode(BookAsset.self, from: publicationData)
check(decodedPublicationAsset == publicationAsset, "publication navigation survives portable encoding")

let folder = Folder(name: "Research")
let collection = BookCollection(name: "Summer")
let organized = Book(
    title: "Organized",
    author: "Writer",
    tags: ["Reference"],
    folderID: folder.id,
    collectionIDs: [collection.id]
)
check(SmartCollectionRule.tag("reference").includes(organized), "smart tag rules ignore case")
check(SmartCollectionRule.folder(folder.id).includes(organized), "smart folder rules match membership")
check(SmartCollectionRule.collection(collection.id).includes(organized), "smart collection rules match membership")
check(!organized.isInInbox, "organized books leave the inbox")
check(Book(title: "New", author: "Writer").isInInbox, "unclassified books appear in the inbox")

let snapshot = LibrarySnapshot(books: [organized], folders: [folder], collections: [collection])
let snapshotData = try JSONEncoder().encode(snapshot)
let decodedSnapshot = try JSONDecoder().decode(LibrarySnapshot.self, from: snapshotData)
check(decodedSnapshot.books == [organized], "portable snapshots preserve organized books")
check(decodedSnapshot.folders == [folder], "portable snapshots preserve folders")

guard failureCount == 0 else {
    fatalError("\(failureCount) domain checks failed")
}

print("All Glassleaf domain checks passed.")
