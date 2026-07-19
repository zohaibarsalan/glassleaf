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

@Test("Series membership removes a book from Inbox")
func seriesMembershipOrganizesBook() {
    let series = Series(name: "Field Notes")
    let book = Book(title: "Volume One", author: "Ada", seriesID: series.id)
    #expect(!book.isInInbox)
    #expect(Book(title: "Loose Book", author: "Ada").isInInbox)
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
    let duplicateTag = Tag(name: "RESEARCH")
    let legacyBook = Book(
        title: "Legacy",
        author: "Ada",
        series: "Field Notes",
        tags: ["research", "Reference"]
    )
    let snapshot = LibrarySnapshot(
        schemaVersion: 2,
        books: [legacyBook],
        tags: [existingTag, duplicateTag],
        smartCollections: [SmartCollection(
            name: "Research",
            rule: .all([.tag("research"), .tagID(duplicateTag.id)])
        )]
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

@Test("Provider-neutral sync records preserve opaque payloads and tombstones")
func syncRecordRoundTrip() throws {
    let id = SyncRecordID(kind: .annotation, entityID: UUID())
    let revision = SyncRevision(generation: 3, updatedAt: .now, deviceID: "mac")
    let original = SyncRecord(
        id: id,
        revision: revision,
        payload: Data("opaque".utf8),
        contentHash: "content-hash",
        isTombstone: true
    )
    let restored = try JSONDecoder().decode(SyncRecord.self, from: JSONEncoder().encode(original))
    #expect(restored == original)
    #expect(SyncRecordDescriptor(record: restored).byteCount == 6)
}

@Test("Latest reading event wins even when its fraction moves backwards")
func readingEventsResolveByTime() {
    let bookID = UUID()
    let earlier = ReadingPositionEvent(
        bookID: bookID,
        locator: "chapter-8",
        fraction: 0.8,
        occurredAt: Date(timeIntervalSince1970: 100),
        deviceID: "iphone"
    )
    let later = ReadingPositionEvent(
        bookID: bookID,
        locator: "chapter-3",
        fraction: 0.3,
        occurredAt: Date(timeIntervalSince1970: 200),
        deviceID: "mac"
    )

    let resolved = ReadingPositionEvent.resolvedProgress(for: bookID, from: [earlier, later])
    #expect(resolved.locator == "chapter-3")
    #expect(resolved.fraction == 0.3)
    #expect(resolved.deviceID == "mac")
}

@Test("Direct descendants win and stale tombstones cannot erase newer edits")
func mergeHonorsAncestryAndTombstones() {
    let id = SyncRecordID(kind: .book, entityID: UUID())
    let firstRevision = SyncRevision(generation: 1, updatedAt: Date(timeIntervalSince1970: 1), deviceID: "mac")
    let secondRevision = SyncRevision(generation: 2, updatedAt: Date(timeIntervalSince1970: 2), deviceID: "iphone")
    let first = SyncRecord(id: id, revision: firstRevision, payload: Data("first".utf8))
    let deleted = SyncRecord(
        id: id,
        revision: secondRevision,
        parentRevision: firstRevision,
        isTombstone: true
    )

    let deletion = SyncMergePolicy.merge(local: first, remote: deleted)
    #expect(deletion.record.isTombstone)

    let restoredRevision = SyncRevision(generation: 3, updatedAt: Date(timeIntervalSince1970: 3), deviceID: "mac")
    let restored = SyncRecord(
        id: id,
        revision: restoredRevision,
        parentRevision: secondRevision,
        payload: Data("restored".utf8)
    )
    let staleDelete = SyncMergePolicy.merge(local: restored, remote: deleted)
    #expect(!staleDelete.record.isTombstone)
    if case .keptLocal = staleDelete.result {} else {
        Issue.record("A stale tombstone should not replace its descendant")
    }
}

@Test("Concurrent updates are projected deterministically and retained as conflicts")
func concurrentUpdatesCreateConflict() {
    let id = SyncRecordID(kind: .tag, entityID: UUID())
    let local = SyncRecord(
        id: id,
        revision: SyncRevision(generation: 2, updatedAt: Date(timeIntervalSince1970: 2), deviceID: "mac"),
        payload: Data("Local".utf8)
    )
    let remote = SyncRecord(
        id: id,
        revision: SyncRevision(generation: 2, updatedAt: Date(timeIntervalSince1970: 2), deviceID: "iphone"),
        payload: Data("Remote".utf8)
    )
    var journal = SyncJournal(records: [local])

    let result = journal.merge(remote)
    if case .conflict = result {} else {
        Issue.record("Concurrent edits should create a recoverable conflict")
    }
    #expect(journal.conflicts.count == 1)
    #expect(journal.record(for: id)?.revision == max(local.revision, remote.revision))
}

@Test("Offline synchronization preserves the durable outbox for retry")
func offlineOutboxRetries() async throws {
    let provider = InMemorySyncProvider(isAvailable: false)
    let store = InMemorySyncJournalStore()
    let coordinator = SyncCoordinator(provider: provider, store: store)
    let record = SyncRecord(
        id: SyncRecordID(kind: .folder, entityID: UUID()),
        revision: SyncRevision(generation: 1, deviceID: "mac"),
        payload: Data("Folder".utf8)
    )
    let mutation = SyncMutation(record: record)
    try await coordinator.enqueue(mutation)

    await #expect(throws: InMemorySyncProvider.ProviderError.unavailable) {
        try await coordinator.synchronize()
    }
    var journal = try await store.loadSyncJournal()
    #expect(journal.outbox.map(\.id) == [mutation.id])

    await provider.setAvailable(true)
    let summary = try await coordinator.synchronize()
    journal = try await store.loadSyncJournal()
    #expect(summary.acknowledgedMutationCount == 1)
    #expect(journal.outbox.isEmpty)
    #expect(await provider.record(for: record.id) == record)
}

@Test("Provider mutation IDs are idempotent across retries")
func providerRetriesAreIdempotent() async throws {
    let provider = InMemorySyncProvider()
    let record = SyncRecord(
        id: SyncRecordID(kind: .bookmark, entityID: UUID()),
        revision: SyncRevision(generation: 1, deviceID: "iphone"),
        payload: Data("Bookmark".utf8)
    )
    let mutation = SyncMutation(record: record)

    let first = try await provider.apply([mutation])
    let second = try await provider.apply([mutation])
    #expect(first.acknowledgedMutationIDs == [mutation.id])
    #expect(second.acknowledgedMutationIDs == [mutation.id])
    #expect(await provider.record(for: record.id) == record)
}
