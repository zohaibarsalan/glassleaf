import Foundation

public struct SyncAuthority: Codable, Hashable, Sendable {
    public let libraryID: UUID
    public let activeProvider: StorageProvider
    public let previousProvider: StorageProvider?
    public let changedAt: Date

    public init(
        libraryID: UUID,
        activeProvider: StorageProvider,
        previousProvider: StorageProvider? = nil,
        changedAt: Date = .now
    ) {
        self.libraryID = libraryID
        self.activeProvider = activeProvider
        self.previousProvider = previousProvider
        self.changedAt = changedAt
    }
}

public enum ProviderMigrationPhase: String, Codable, Sendable {
    case planned
    case backupVerified
    case destinationImported
    case destinationVerified
    case completed
    case rolledBack
}

public enum ProviderMigrationError: Error, Equatable, Sendable {
    case sameProvider
    case emptyBackupFingerprint
    case mismatchedLibrary
    case unsupportedManifestSchema(Int)
    case invalidTransition(expected: ProviderMigrationPhase, actual: ProviderMigrationPhase)
}

/// A provider cutover cannot complete until a portable backup and the destination import are verified.
public struct ProviderMigrationPlan: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let libraryID: UUID
    public let source: StorageProvider
    public let destination: StorageProvider
    public let sourceCursor: SyncCursor?
    public let createdAt: Date
    public private(set) var updatedAt: Date
    public private(set) var phase: ProviderMigrationPhase
    public private(set) var backupFingerprint: String?
    public private(set) var destinationManifestGeneration: UInt64?

    public init(
        id: UUID = UUID(),
        libraryID: UUID,
        source: StorageProvider,
        destination: StorageProvider,
        sourceCursor: SyncCursor? = nil,
        createdAt: Date = .now
    ) throws {
        guard source != destination else { throw ProviderMigrationError.sameProvider }
        self.id = id
        self.libraryID = libraryID
        self.source = source
        self.destination = destination
        self.sourceCursor = sourceCursor
        self.createdAt = createdAt
        updatedAt = createdAt
        phase = .planned
        backupFingerprint = nil
        destinationManifestGeneration = nil
    }

    public mutating func markBackupVerified(fingerprint: String, at date: Date = .now) throws {
        try require(.planned)
        guard !fingerprint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ProviderMigrationError.emptyBackupFingerprint
        }
        backupFingerprint = fingerprint
        phase = .backupVerified
        updatedAt = date
    }

    public mutating func markDestinationImported(manifest: SyncManifest, at date: Date = .now) throws {
        try require(.backupVerified)
        guard manifest.libraryID == libraryID else { throw ProviderMigrationError.mismatchedLibrary }
        guard manifest.schemaVersion <= SyncManifest.currentSchemaVersion else {
            throw ProviderMigrationError.unsupportedManifestSchema(manifest.schemaVersion)
        }
        destinationManifestGeneration = manifest.generation
        phase = .destinationImported
        updatedAt = date
    }

    public mutating func markDestinationVerified(at date: Date = .now) throws {
        try require(.destinationImported)
        phase = .destinationVerified
        updatedAt = date
    }

    public mutating func completeCutover(at date: Date = .now) throws -> SyncAuthority {
        try require(.destinationVerified)
        phase = .completed
        updatedAt = date
        return SyncAuthority(
            libraryID: libraryID,
            activeProvider: destination,
            previousProvider: source,
            changedAt: date
        )
    }

    public mutating func rollBack(at date: Date = .now) throws {
        guard phase != .completed else {
            throw ProviderMigrationError.invalidTransition(expected: .destinationVerified, actual: phase)
        }
        phase = .rolledBack
        updatedAt = date
    }

    private func require(_ expected: ProviderMigrationPhase) throws {
        guard phase == expected else {
            throw ProviderMigrationError.invalidTransition(expected: expected, actual: phase)
        }
    }
}
