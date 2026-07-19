import Foundation

/// Stable, provider-independent record categories. Providers store the payload as opaque bytes.
public enum SyncRecordKind: String, Codable, CaseIterable, Sendable {
    case library
    case book
    case bookAsset
    case folder
    case tag
    case collection
    case series
    case smartCollection
    case bookmark
    case annotation
    case readingEvent
    case readerPreferences
}

public struct SyncRecordID: Codable, Hashable, Sendable {
    public let kind: SyncRecordKind
    public let entityID: UUID

    public init(kind: SyncRecordKind, entityID: UUID) {
        self.kind = kind
        self.entityID = entityID
    }
}

/// A revision is ordered deterministically without depending on any provider's revision format.
public struct SyncRevision: Codable, Hashable, Comparable, Sendable {
    public let generation: UInt64
    public let updatedAt: Date
    public let deviceID: String

    public init(generation: UInt64, updatedAt: Date = .now, deviceID: String) {
        self.generation = generation
        self.updatedAt = updatedAt
        self.deviceID = deviceID
    }

    public static func < (lhs: Self, rhs: Self) -> Bool {
        if lhs.generation != rhs.generation { return lhs.generation < rhs.generation }
        if lhs.updatedAt != rhs.updatedAt { return lhs.updatedAt < rhs.updatedAt }
        return lhs.deviceID < rhs.deviceID
    }
}

public struct SyncRecord: Identifiable, Codable, Hashable, Sendable {
    public let id: SyncRecordID
    public let revision: SyncRevision
    /// The revision this mutation was based on. A nil parent creates a new record.
    public let parentRevision: SyncRevision?
    public let payload: Data
    public let contentHash: String?
    public let isTombstone: Bool

    public init(
        id: SyncRecordID,
        revision: SyncRevision,
        parentRevision: SyncRevision? = nil,
        payload: Data = Data(),
        contentHash: String? = nil,
        isTombstone: Bool = false
    ) {
        self.id = id
        self.revision = revision
        self.parentRevision = parentRevision
        self.payload = payload
        self.contentHash = contentHash
        self.isTombstone = isTombstone
    }
}

public struct SyncRecordDescriptor: Codable, Hashable, Sendable {
    public let id: SyncRecordID
    public let revision: SyncRevision
    public let contentHash: String?
    public let byteCount: Int
    public let isTombstone: Bool

    public init(record: SyncRecord) {
        id = record.id
        revision = record.revision
        contentHash = record.contentHash
        byteCount = record.payload.count
        isTombstone = record.isTombstone
    }
}

public struct SyncCursor: RawRepresentable, Codable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }
}

public struct SyncManifest: Codable, Hashable, Sendable {
    public static let currentSchemaVersion = 1

    public let schemaVersion: Int
    public let libraryID: UUID
    public let generation: UInt64
    public let records: [SyncRecordDescriptor]
    public let cursor: SyncCursor?
    public let updatedAt: Date

    public init(
        schemaVersion: Int = SyncManifest.currentSchemaVersion,
        libraryID: UUID,
        generation: UInt64,
        records: [SyncRecordDescriptor],
        cursor: SyncCursor? = nil,
        updatedAt: Date = .now
    ) {
        self.schemaVersion = schemaVersion
        self.libraryID = libraryID
        self.generation = generation
        self.records = records
        self.cursor = cursor
        self.updatedAt = updatedAt
    }
}

/// Reading positions are append-only events so a device opening an older page cannot erase newer progress.
public struct ReadingPositionEvent: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let bookID: UUID
    public let locator: String?
    public let fraction: Double
    public let isCompleted: Bool
    public let occurredAt: Date
    public let deviceID: String

    public init(
        id: UUID = UUID(),
        bookID: UUID,
        locator: String? = nil,
        fraction: Double,
        isCompleted: Bool = false,
        occurredAt: Date = .now,
        deviceID: String
    ) {
        self.id = id
        self.bookID = bookID
        self.locator = locator
        self.fraction = min(max(fraction, 0), 1)
        self.isCompleted = isCompleted
        self.occurredAt = occurredAt
        self.deviceID = deviceID
    }

    public static func resolvedProgress(for bookID: UUID, from events: some Sequence<Self>) -> ReadingProgress {
        guard let latest = events
            .filter({ $0.bookID == bookID })
            .max(by: { lhs, rhs in
                if lhs.occurredAt != rhs.occurredAt { return lhs.occurredAt < rhs.occurredAt }
                return lhs.id.uuidString < rhs.id.uuidString
            }) else {
            return .notStarted
        }
        return ReadingProgress(
            locator: latest.locator,
            fraction: latest.fraction,
            updatedAt: latest.occurredAt,
            deviceID: latest.deviceID,
            isCompleted: latest.isCompleted
        )
    }
}
