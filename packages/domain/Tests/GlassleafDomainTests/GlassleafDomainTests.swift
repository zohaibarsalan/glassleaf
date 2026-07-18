import Foundation
import GlassleafDomain
import Testing

@Test("Reading progress is always clamped to a valid fraction")
func readingProgressClamps() {
    #expect(ReadingProgress(fraction: -1).fraction == 0)
    #expect(ReadingProgress(fraction: 2).fraction == 1)
}

@Test("Legacy reader preferences receive new defaults")
func legacyReaderPreferencesDecode() throws {
    let data = Data(#"{"fontFamily":"serif","fontScale":1,"lineSpacing":8,"horizontalMargin":28,"theme":"paper","mode":"paginated"}"#.utf8)
    let preferences = try JSONDecoder().decode(ReaderPreferences.self, from: data)
    #expect(preferences.alignment == .leading)
}

@Test
func readerPreferencesDefaultToScrolling() {
    #expect(ReaderPreferences().mode == .scrolling)
}

@Test("Nested smart-collection predicates honor all and any groups")
func nestedSmartCollectionRules() {
    let book = Book(title: "Field Notes", author: "Ada", isFavorite: true, tags: ["Research"])
    let rule = SmartCollectionRule.all([
        .favorite(true),
        .any([.tag("research"), .authorContains("nobody")]),
    ])
    #expect(rule.includes(book))
    #expect(!SmartCollectionRule.all([.favorite(false), .tag("research")]).includes(book))
}

@Test("Portable snapshots preserve the complete organization graph")
func portableSnapshotRoundTrip() throws {
    let parent = Folder(name: "Reference")
    let child = Folder(name: "Design", parentID: parent.id)
    let collection = BookCollection(name: "Favorites")
    let book = Book(
        title: "Interfaces",
        author: "Ada",
        series: "Craft",
        seriesIndex: 2,
        tags: ["UI", "Research"],
        folderID: child.id,
        collectionIDs: [collection.id]
    )
    let bookmark = Bookmark(bookID: book.id, locator: "chapter.xhtml#progress=0.5")
    let note = Annotation(bookID: book.id, locator: bookmark.locator, note: "Revisit")
    let original = LibrarySnapshot(
        books: [book],
        folders: [parent, child],
        tags: [Tag(name: "UI"), Tag(name: "Research")],
        collections: [collection],
        smartCollections: [SmartCollection(name: "UI books", rule: .tag("ui"))],
        bookmarks: [bookmark],
        annotations: [note]
    )

    let data = try JSONEncoder().encode(original)
    let restored = try JSONDecoder().decode(LibrarySnapshot.self, from: data)
    #expect(restored == original)
}

@Test("Every library sort can order equal-looking records without losing them")
func librarySortsRemainTotal() {
    let first = Book(title: "Same", author: "Author", dateAdded: .distantPast)
    let second = Book(title: "Same", author: "Author", dateAdded: .now)
    for sort in LibrarySort.allCases {
        let ordered = [first, second].sorted(by: sort.areInIncreasingOrder)
        #expect(Set(ordered.map(\.id)) == Set([first.id, second.id]))
    }
}
