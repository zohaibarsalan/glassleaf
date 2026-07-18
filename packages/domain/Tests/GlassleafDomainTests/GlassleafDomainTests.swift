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
    let tag = Tag(name: "Research")
    let book = Book(title: "Field Notes", author: "Ada", isFavorite: true, tagIDs: [tag.id])
    let rule = SmartCollectionRule.all([
        .favorite(true),
        .any([.tagID(tag.id), .authorContains("nobody")]),
    ])
    #expect(rule.includes(book))
    #expect(!SmartCollectionRule.all([.favorite(false), .tagID(tag.id)]).includes(book))
}

@Test("Portable snapshots preserve the complete organization graph")
func portableSnapshotRoundTrip() throws {
    let parent = Folder(name: "Reference")
    let child = Folder(name: "Design", parentID: parent.id)
    let collection = BookCollection(name: "Favorites")
    let uiTag = Tag(name: "UI")
    let researchTag = Tag(name: "Research")
    let series = Series(name: "Craft")
    let book = Book(
        title: "Interfaces",
        author: "Ada",
        seriesID: series.id,
        seriesIndex: 2,
        tagIDs: [uiTag.id, researchTag.id],
        folderID: child.id,
        collectionIDs: [collection.id]
    )
    let bookmark = Bookmark(bookID: book.id, locator: "chapter.xhtml#progress=0.5")
    let note = Annotation(bookID: book.id, locator: bookmark.locator, note: "Revisit")
    let original = LibrarySnapshot(
        books: [book],
        folders: [parent, child],
        tags: [uiTag, researchTag],
        collections: [collection],
        series: [series],
        smartCollections: [SmartCollection(name: "UI books", rule: .tagID(uiTag.id))],
        bookmarks: [bookmark],
        annotations: [note]
    )

    let data = try JSONEncoder().encode(original)
    let restored = try JSONDecoder().decode(LibrarySnapshot.self, from: data)
    #expect(restored == original)
}

@Test("Legacy names migrate to canonical tag and series IDs")
func legacyOrganizationIdentityMigration() {
    let existingTag = Tag(name: "Research")
    let legacyBook = Book(
        title: "Legacy",
        author: "Ada",
        series: "Field Notes",
        tags: ["research", "Reference"]
    )
    let snapshot = LibrarySnapshot(
        schemaVersion: 2,
        books: [legacyBook],
        tags: [existingTag, Tag(name: "RESEARCH")],
        smartCollections: [SmartCollection(name: "Research", rule: .tag("research"))]
    )

    let migrated = snapshot.migratingOrganizationIdentity()
    let book = migrated.books[0]
    #expect(migrated.schemaVersion == 3)
    #expect(migrated.tags.filter { $0.normalizedName == existingTag.normalizedName }.count == 1)
    #expect(book.tagIDs.count == 2)
    #expect(book.seriesID == migrated.series.first?.id)
    #expect(!book.hasLegacyOrganizationIdentity)
    #expect(migrated.smartCollections[0].rule.includes(book, tags: migrated.tags, series: migrated.series))
}

@Test("Older series records receive cover and timestamp defaults")
func legacySeriesDecode() throws {
    let id = UUID()
    let data = Data(#"{"id":"\#(id.uuidString)","name":"Field Notes","sortOrder":2}"#.utf8)
    let decoded = try JSONDecoder().decode(Series.self, from: data)
    #expect(decoded.coverBookID == nil)
    #expect(decoded.updatedAt == .distantPast)
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
