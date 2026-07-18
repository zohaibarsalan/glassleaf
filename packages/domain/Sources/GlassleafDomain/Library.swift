import Foundation

public struct Library: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var provider: StorageProvider
    public var schemaVersion: Int

    public init(
        id: UUID = UUID(),
        name: String,
        provider: StorageProvider = .local,
        schemaVersion: Int = 1
    ) {
        self.id = id
        self.name = name
        self.provider = provider
        self.schemaVersion = schemaVersion
    }
}

public enum StorageProvider: String, Codable, CaseIterable, Sendable {
    case local
    case iCloud
    case googleDrive
}

public enum LibraryFilter: String, CaseIterable, Identifiable, Sendable {
    case all
    case unread
    case reading
    case finished
    case favorites

    public var id: Self { self }

    public func includes(_ book: Book) -> Bool {
        switch self {
        case .all:
            true
        case .unread:
            book.readingState == .unread
        case .reading:
            book.readingState == .reading
        case .finished:
            book.readingState == .finished
        case .favorites:
            book.isFavorite
        }
    }
}
