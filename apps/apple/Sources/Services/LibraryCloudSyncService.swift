import CryptoKit
import Foundation
import GlassleafDomain

struct CloudSyncResult: Sendable {
    let snapshot: LibrarySnapshot
    let readerPreferences: ReaderPreferences
    let summary: SyncRunSummary
    let syncedAt: Date
}

actor LibraryCloudSyncService {
    private struct LibraryIdentityPayload: Codable {
        let id: UUID
        let schemaVersion: Int
    }

    private static let preferencesID = UUID(uuidString: "69636c6f-7564-4000-8000-000000000001")!

    private let repository: LocalLibraryRepository
    private let provider: CloudKitSyncProvider
    private let coordinator: SyncCoordinator
    private let libraryID: UUID
    private let deviceID: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        repository: LocalLibraryRepository,
        libraryID: UUID,
        deviceID: String,
        provider: CloudKitSyncProvider? = nil
    ) {
        let resolvedProvider = provider ?? CloudKitSyncProvider(
            assetStore: CloudBookAssetStore(repository: repository)
        )
        self.repository = repository
        self.provider = resolvedProvider
        coordinator = SyncCoordinator(provider: resolvedProvider, store: repository)
        self.libraryID = libraryID
        self.deviceID = deviceID
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .deferredToDate
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .deferredToDate
    }

    func accountIsAvailable() async throws -> Bool {
        try await provider.accountStatus() == .available
    }

    func synchronize(
        snapshot localSnapshot: LibrarySnapshot,
        readerPreferences: ReaderPreferences
    ) async throws -> CloudSyncResult {
        try await stageLocalChanges(snapshot: localSnapshot, readerPreferences: readerPreferences)
        let summary = try await coordinator.synchronize()
        let journal = try await repository.loadSyncJournal()
        let materialized = try materialize(journal: journal, preservingAssetsFrom: localSnapshot)
        try await repository.save(materialized.snapshot)
        return CloudSyncResult(
            snapshot: materialized.snapshot,
            readerPreferences: materialized.readerPreferences,
            summary: summary,
            syncedAt: .now
        )
    }

    private func stageLocalChanges(
        snapshot: LibrarySnapshot,
        readerPreferences: ReaderPreferences
    ) async throws {
        var journal = try await repository.loadSyncJournal()
        var desired = try desiredRecords(snapshot: snapshot, readerPreferences: readerPreferences, journal: journal)
        let stateKinds = Set(SyncRecordKind.allCases).subtracting([.readingEvent])
        let desiredIDs = Set(desired.map(\.id))

        for existing in journal.records
            where stateKinds.contains(existing.id.kind)
                && !existing.isTombstone
                && !desiredIDs.contains(existing.id) {
            desired.append(SyncRecord(
                id: existing.id,
                revision: nextRevision(after: existing.revision),
                parentRevision: existing.revision,
                isTombstone: true
            ))
        }

        for record in desired {
            let existing = journal.record(for: record.id)
            guard existing?.payload != record.payload
                    || existing?.isTombstone != record.isTombstone
                    || existing == nil else { continue }
            let revision = existing.map { nextRevision(after: $0.revision) }
                ?? SyncRevision(generation: 1, deviceID: deviceID)
            let mutationRecord = SyncRecord(
                id: record.id,
                revision: revision,
                parentRevision: existing?.revision,
                payload: record.payload,
                contentHash: record.contentHash,
                isTombstone: record.isTombstone
            )
            journal.enqueue(SyncMutation(record: mutationRecord, baseRevision: existing?.revision))
        }
        try await repository.saveSyncJournal(journal)
    }

    private func desiredRecords(
        snapshot: LibrarySnapshot,
        readerPreferences: ReaderPreferences,
        journal: SyncJournal
    ) throws -> [SyncRecord] {
        var records: [SyncRecord] = []
        records.append(try payloadRecord(
            kind: .library,
            id: libraryID,
            value: LibraryIdentityPayload(id: libraryID, schemaVersion: LibrarySnapshot.currentSchemaVersion)
        ))

        for var book in snapshot.books {
            let localProgress = book.progress
            book.progress = .notStarted
            records.append(try payloadRecord(kind: .book, id: book.id, value: book))
            if let asset = book.asset {
                records.append(try payloadRecord(
                    kind: .bookAsset,
                    id: book.id,
                    value: CloudBookAssetDescriptor(bookID: book.id, asset: asset),
                    contentHash: asset.contentHash
                ))
            }

            let existingEvents = journal.records
                .filter { $0.id.kind == .readingEvent && !$0.isTombstone }
                .compactMap { try? decoder.decode(ReadingPositionEvent.self, from: $0.payload) }
                .filter { $0.bookID == book.id }
            let resolved = ReadingPositionEvent.resolvedProgress(for: book.id, from: existingEvents)
            if resolved != localProgress {
                let event = ReadingPositionEvent(
                    bookID: book.id,
                    locator: localProgress.locator,
                    fraction: localProgress.fraction,
                    isCompleted: localProgress.isCompleted,
                    occurredAt: localProgress.updatedAt,
                    deviceID: deviceID
                )
                records.append(try payloadRecord(kind: .readingEvent, id: event.id, value: event))
            }
        }
        records += try snapshot.folders.map { try payloadRecord(kind: .folder, id: $0.id, value: $0) }
        records += try snapshot.tags.map { try payloadRecord(kind: .tag, id: $0.id, value: $0) }
        records += try snapshot.collections.map { try payloadRecord(kind: .collection, id: $0.id, value: $0) }
        records += try snapshot.series.map { try payloadRecord(kind: .series, id: $0.id, value: $0) }
        records += try snapshot.smartCollections.map { try payloadRecord(kind: .smartCollection, id: $0.id, value: $0) }
        records += try snapshot.bookmarks.map { try payloadRecord(kind: .bookmark, id: $0.id, value: $0) }
        records += try snapshot.annotations.map { try payloadRecord(kind: .annotation, id: $0.id, value: $0) }
        records.append(try payloadRecord(
            kind: .readerPreferences,
            id: Self.preferencesID,
            value: readerPreferences
        ))
        return records
    }

    private func materialize(
        journal: SyncJournal,
        preservingAssetsFrom local: LibrarySnapshot
    ) throws -> (snapshot: LibrarySnapshot, readerPreferences: ReaderPreferences) {
        let active = journal.records.filter { !$0.isTombstone }
        var books: [Book] = try decode(active, kind: .book)
        let localBooks = Dictionary(uniqueKeysWithValues: local.books.map { ($0.id, $0) })
        let events: [ReadingPositionEvent] = try decode(active, kind: .readingEvent)

        for index in books.indices {
            let localBook = localBooks[books[index].id]
            if localBook?.asset?.contentHash == books[index].asset?.contentHash {
                books[index].asset = localBook?.asset
                books[index].cover = localBook?.cover
            }
            books[index].progress = ReadingPositionEvent.resolvedProgress(for: books[index].id, from: events)
        }

        let preferences: [ReaderPreferences] = try decode(active, kind: .readerPreferences)
        return (
            LibrarySnapshot(
                books: books,
                folders: try decode(active, kind: .folder),
                tags: try decode(active, kind: .tag),
                collections: try decode(active, kind: .collection),
                series: try decode(active, kind: .series),
                smartCollections: try decode(active, kind: .smartCollection),
                bookmarks: try decode(active, kind: .bookmark),
                annotations: try decode(active, kind: .annotation)
            ).migratingOrganizationIdentity(),
            preferences.first ?? .init()
        )
    }

    private func payloadRecord<Value: Encodable>(
        kind: SyncRecordKind,
        id: UUID,
        value: Value,
        contentHash: String? = nil
    ) throws -> SyncRecord {
        let payload = try encoder.encode(value)
        return SyncRecord(
            id: SyncRecordID(kind: kind, entityID: id),
            revision: SyncRevision(generation: 0, deviceID: deviceID),
            payload: payload,
            contentHash: contentHash ?? SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        )
    }

    private func decode<Value: Decodable>(
        _ records: [SyncRecord],
        kind: SyncRecordKind
    ) throws -> [Value] {
        try records
            .filter { $0.id.kind == kind }
            .map { try decoder.decode(Value.self, from: $0.payload) }
    }

    private func nextRevision(after revision: SyncRevision) -> SyncRevision {
        SyncRevision(generation: revision.generation + 1, deviceID: deviceID)
    }
}

@MainActor
enum CloudSyncIdentityStore {
    private static let enabledKey = "icloud-sync-enabled-v1"
    private static let libraryIDKey = "icloud-library-id-v1"
    private static let deviceIDKey = "sync-device-id-v1"

    static var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    static var libraryID: UUID {
        stableUUID(forKey: libraryIDKey)
    }

    static var deviceID: String {
        stableUUID(forKey: deviceIDKey).uuidString.lowercased()
    }

    private static func stableUUID(forKey key: String) -> UUID {
        if let value = UserDefaults.standard.string(forKey: key),
           let id = UUID(uuidString: value) {
            return id
        }
        let id = UUID()
        UserDefaults.standard.set(id.uuidString.lowercased(), forKey: key)
        return id
    }
}
