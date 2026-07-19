import Foundation

public struct SyncMutation: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let record: SyncRecord
    public let baseRevision: SyncRevision?
    public let queuedAt: Date
    public var attemptCount: Int
    public var lastAttemptAt: Date?

    public init(
        id: UUID = UUID(),
        record: SyncRecord,
        baseRevision: SyncRevision? = nil,
        queuedAt: Date = .now,
        attemptCount: Int = 0,
        lastAttemptAt: Date? = nil
    ) {
        self.id = id
        self.record = record
        self.baseRevision = baseRevision
        self.queuedAt = queuedAt
        self.attemptCount = attemptCount
        self.lastAttemptAt = lastAttemptAt
    }
}

public enum SyncConflictReason: String, Codable, Sendable {
    case concurrentUpdate
    case revisionCollision
}

public struct SyncConflict: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let recordID: SyncRecordID
    public let local: SyncRecord
    public let remote: SyncRecord
    public let projectedWinner: SyncRevision
    public let reason: SyncConflictReason
    public let detectedAt: Date

    public init(
        id: UUID = UUID(),
        local: SyncRecord,
        remote: SyncRecord,
        projectedWinner: SyncRevision,
        reason: SyncConflictReason,
        detectedAt: Date = .now
    ) {
        self.id = id
        recordID = local.id
        self.local = local
        self.remote = remote
        self.projectedWinner = projectedWinner
        self.reason = reason
        self.detectedAt = detectedAt
    }
}

public enum SyncMergeResult: Sendable {
    case unchanged
    case acceptedRemote
    case keptLocal
    case conflict(SyncConflict)
}

public enum SyncMergePolicy {
    public static func merge(local: SyncRecord, remote: SyncRecord) -> (record: SyncRecord, result: SyncMergeResult) {
        precondition(local.id == remote.id, "Sync records must have the same identity before merging")

        if local == remote {
            return (local, .unchanged)
        }
        if local.revision == remote.revision {
            let winner = deterministicWinner(local, remote)
            return (winner, .conflict(SyncConflict(
                local: local,
                remote: remote,
                projectedWinner: winner.revision,
                reason: .revisionCollision
            )))
        }
        if remote.parentRevision == local.revision {
            return (remote, .acceptedRemote)
        }
        if local.parentRevision == remote.revision {
            return (local, .keptLocal)
        }

        let winner = deterministicWinner(local, remote)
        return (winner, .conflict(SyncConflict(
            local: local,
            remote: remote,
            projectedWinner: winner.revision,
            reason: .concurrentUpdate
        )))
    }

    private static func deterministicWinner(_ lhs: SyncRecord, _ rhs: SyncRecord) -> SyncRecord {
        if lhs.revision != rhs.revision {
            return lhs.revision < rhs.revision ? rhs : lhs
        }
        if lhs.isTombstone != rhs.isTombstone {
            return lhs.isTombstone ? lhs : rhs
        }
        if lhs.contentHash != rhs.contentHash {
            return (lhs.contentHash ?? "") < (rhs.contentHash ?? "") ? rhs : lhs
        }
        return lhs.payload.lexicographicallyPrecedes(rhs.payload) ? rhs : lhs
    }
}

public struct SyncJournal: Codable, Hashable, Sendable {
    public static let currentSchemaVersion = 1

    public var schemaVersion: Int
    public var records: [SyncRecord]
    public var outbox: [SyncMutation]
    public var conflicts: [SyncConflict]
    public var cursor: SyncCursor?

    public init(
        schemaVersion: Int = SyncJournal.currentSchemaVersion,
        records: [SyncRecord] = [],
        outbox: [SyncMutation] = [],
        conflicts: [SyncConflict] = [],
        cursor: SyncCursor? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.records = records
        self.outbox = outbox
        self.conflicts = conflicts
        self.cursor = cursor
    }

    public mutating func enqueue(_ mutation: SyncMutation) {
        if let index = records.firstIndex(where: { $0.id == mutation.record.id }) {
            records[index] = mutation.record
        } else {
            records.append(mutation.record)
        }
        if !outbox.contains(where: { $0.id == mutation.id }) {
            outbox.append(mutation)
        }
    }

    @discardableResult
    public mutating func merge(_ remote: SyncRecord) -> SyncMergeResult {
        guard let index = records.firstIndex(where: { $0.id == remote.id }) else {
            records.append(remote)
            return .acceptedRemote
        }

        let merged = SyncMergePolicy.merge(local: records[index], remote: remote)
        records[index] = merged.record
        if case .conflict(let conflict) = merged.result,
           !conflicts.contains(where: {
               $0.recordID == conflict.recordID
                   && $0.local.revision == conflict.local.revision
                   && $0.remote.revision == conflict.remote.revision
           }) {
            conflicts.append(conflict)
        }
        return merged.result
    }

    public mutating func markAttempted(_ mutationIDs: Set<UUID>, at date: Date = .now) {
        for index in outbox.indices where mutationIDs.contains(outbox[index].id) {
            outbox[index].attemptCount += 1
            outbox[index].lastAttemptAt = date
        }
    }

    public mutating func acknowledge(_ mutationIDs: Set<UUID>) {
        outbox.removeAll { mutationIDs.contains($0.id) }
    }

    public func record(for id: SyncRecordID) -> SyncRecord? {
        records.first { $0.id == id }
    }
}

public struct SyncChangeBatch: Codable, Hashable, Sendable {
    public let records: [SyncRecord]
    public let cursor: SyncCursor?

    public init(records: [SyncRecord], cursor: SyncCursor?) {
        self.records = records
        self.cursor = cursor
    }
}

public struct SyncPushResult: Codable, Hashable, Sendable {
    public let acknowledgedMutationIDs: Set<UUID>
    public let remoteRecords: [SyncRecord]
    public let cursor: SyncCursor?

    public init(
        acknowledgedMutationIDs: Set<UUID>,
        remoteRecords: [SyncRecord] = [],
        cursor: SyncCursor? = nil
    ) {
        self.acknowledgedMutationIDs = acknowledgedMutationIDs
        self.remoteRecords = remoteRecords
        self.cursor = cursor
    }
}

public protocol SyncProvider: Sendable {
    func fetchChanges(since cursor: SyncCursor?) async throws -> SyncChangeBatch
    func apply(_ mutations: [SyncMutation]) async throws -> SyncPushResult
}

public protocol SyncJournalStore: Sendable {
    func loadSyncJournal() async throws -> SyncJournal
    func saveSyncJournal(_ journal: SyncJournal) async throws
}

public struct SyncRunSummary: Equatable, Sendable {
    public let pulledRecordCount: Int
    public let acknowledgedMutationCount: Int
    public let pendingMutationCount: Int
    public let conflictCount: Int

    public init(
        pulledRecordCount: Int,
        acknowledgedMutationCount: Int,
        pendingMutationCount: Int,
        conflictCount: Int
    ) {
        self.pulledRecordCount = pulledRecordCount
        self.acknowledgedMutationCount = acknowledgedMutationCount
        self.pendingMutationCount = pendingMutationCount
        self.conflictCount = conflictCount
    }
}

public actor SyncCoordinator {
    private let provider: any SyncProvider
    private let store: any SyncJournalStore

    public init(provider: any SyncProvider, store: any SyncJournalStore) {
        self.provider = provider
        self.store = store
    }

    public func enqueue(_ mutation: SyncMutation) async throws {
        var journal = try await store.loadSyncJournal()
        journal.enqueue(mutation)
        try await store.saveSyncJournal(journal)
    }

    public func synchronize() async throws -> SyncRunSummary {
        var journal = try await store.loadSyncJournal()
        let conflictsBefore = journal.conflicts.count

        let pulled = try await provider.fetchChanges(since: journal.cursor)
        for record in pulled.records {
            journal.merge(record)
        }
        journal.cursor = pulled.cursor ?? journal.cursor
        try await store.saveSyncJournal(journal)

        var acknowledged = Set<UUID>()
        let pending = journal.outbox
        if !pending.isEmpty {
            let pendingIDs = Set(pending.map(\.id))
            journal.markAttempted(pendingIDs)
            try await store.saveSyncJournal(journal)

            let pushed = try await provider.apply(pending)
            acknowledged = pushed.acknowledgedMutationIDs
            for record in pushed.remoteRecords {
                journal.merge(record)
            }
            journal.acknowledge(acknowledged)
            journal.cursor = pushed.cursor ?? journal.cursor
            try await store.saveSyncJournal(journal)
        }

        return SyncRunSummary(
            pulledRecordCount: pulled.records.count,
            acknowledgedMutationCount: acknowledged.count,
            pendingMutationCount: journal.outbox.count,
            conflictCount: journal.conflicts.count - conflictsBefore
        )
    }
}

public actor InMemorySyncJournalStore: SyncJournalStore {
    private var journal: SyncJournal

    public init(journal: SyncJournal = SyncJournal()) {
        self.journal = journal
    }

    public func loadSyncJournal() async throws -> SyncJournal {
        journal
    }

    public func saveSyncJournal(_ journal: SyncJournal) async throws {
        self.journal = journal
    }
}

public actor InMemorySyncProvider: SyncProvider {
    public enum ProviderError: Error, Equatable {
        case unavailable
    }

    private var records: [SyncRecordID: SyncRecord]
    private var appliedMutations: [UUID: SyncPushResult]
    private var changes: [(generation: UInt64, record: SyncRecord)]
    private var generation: UInt64
    private var available: Bool

    public init(records: [SyncRecord] = [], isAvailable: Bool = true) {
        self.records = Dictionary(uniqueKeysWithValues: records.map { ($0.id, $0) })
        appliedMutations = [:]
        changes = records.enumerated().map { (UInt64($0.offset + 1), $0.element) }
        generation = UInt64(records.count)
        available = isAvailable
    }

    public func setAvailable(_ isAvailable: Bool) {
        available = isAvailable
    }

    public func fetchChanges(since cursor: SyncCursor?) async throws -> SyncChangeBatch {
        guard available else { throw ProviderError.unavailable }
        let previous = cursor.flatMap { UInt64($0.rawValue) } ?? 0
        return SyncChangeBatch(
            records: changes.filter { $0.generation > previous }.map(\.record),
            cursor: SyncCursor(rawValue: String(generation))
        )
    }

    public func apply(_ mutations: [SyncMutation]) async throws -> SyncPushResult {
        guard available else { throw ProviderError.unavailable }
        var acknowledged = Set<UUID>()
        var remoteRecords: [SyncRecord] = []

        for mutation in mutations {
            if let prior = appliedMutations[mutation.id] {
                acknowledged.formUnion(prior.acknowledgedMutationIDs)
                remoteRecords.append(contentsOf: prior.remoteRecords)
                continue
            }

            let existing = records[mutation.record.id]
            let canApply = existing == nil
                ? mutation.baseRevision == nil
                : existing == mutation.record || existing?.revision == mutation.baseRevision
            if canApply {
                if existing != mutation.record {
                    records[mutation.record.id] = mutation.record
                    generation += 1
                    changes.append((generation, mutation.record))
                }
                acknowledged.insert(mutation.id)
                appliedMutations[mutation.id] = SyncPushResult(
                    acknowledgedMutationIDs: [mutation.id],
                    cursor: SyncCursor(rawValue: String(generation))
                )
            } else if let existing {
                remoteRecords.append(existing)
            }
        }

        return SyncPushResult(
            acknowledgedMutationIDs: acknowledged,
            remoteRecords: remoteRecords,
            cursor: SyncCursor(rawValue: String(generation))
        )
    }

    public func record(for id: SyncRecordID) -> SyncRecord? {
        records[id]
    }
}
