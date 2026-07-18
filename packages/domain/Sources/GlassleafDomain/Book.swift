import Foundation

public struct Book: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public var title: String
    public var author: String
    public var summary: String
    public var series: String?
    public var seriesIndex: Decimal?
    public var dateAdded: Date
    public var lastOpened: Date?
    public var isFavorite: Bool
    public var progress: ReadingProgress
    public var tags: Set<String>
    public var folderID: UUID?
    public var collectionIDs: Set<UUID>
    public var language: String?
    public var identifiers: Set<String>
    public var updatedAt: Date
    public var deletedAt: Date?
    public var coverStyle: CoverStyle
    public var asset: BookAsset?

    public init(
        id: UUID = UUID(),
        title: String,
        author: String,
        summary: String = "",
        series: String? = nil,
        seriesIndex: Decimal? = nil,
        dateAdded: Date = .now,
        lastOpened: Date? = nil,
        isFavorite: Bool = false,
        progress: ReadingProgress = .notStarted,
        tags: Set<String> = [],
        folderID: UUID? = nil,
        collectionIDs: Set<UUID> = [],
        language: String? = nil,
        identifiers: Set<String> = [],
        updatedAt: Date = .now,
        deletedAt: Date? = nil,
        coverStyle: CoverStyle = .sage,
        asset: BookAsset? = nil
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.summary = summary
        self.series = series
        self.seriesIndex = seriesIndex
        self.dateAdded = dateAdded
        self.lastOpened = lastOpened
        self.isFavorite = isFavorite
        self.progress = progress
        self.tags = tags
        self.folderID = folderID
        self.collectionIDs = collectionIDs
        self.language = language
        self.identifiers = identifiers
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
        self.coverStyle = coverStyle
        self.asset = asset
    }

    public var readingState: ReadingState {
        if progress.isCompleted { return .finished }
        if progress.fraction > 0 { return .reading }
        return .unread
    }

    public var isInInbox: Bool {
        folderID == nil && collectionIDs.isEmpty && tags.isEmpty
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, author, summary, series, seriesIndex, dateAdded, lastOpened
        case isFavorite, progress, tags, folderID, collectionIDs, language, identifiers
        case updatedAt, deletedAt, coverStyle, asset
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        title = try values.decode(String.self, forKey: .title)
        author = try values.decode(String.self, forKey: .author)
        summary = try values.decodeIfPresent(String.self, forKey: .summary) ?? ""
        series = try values.decodeIfPresent(String.self, forKey: .series)
        seriesIndex = try values.decodeIfPresent(Decimal.self, forKey: .seriesIndex)
        dateAdded = try values.decodeIfPresent(Date.self, forKey: .dateAdded) ?? .now
        lastOpened = try values.decodeIfPresent(Date.self, forKey: .lastOpened)
        isFavorite = try values.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
        progress = try values.decodeIfPresent(ReadingProgress.self, forKey: .progress) ?? .notStarted
        tags = try values.decodeIfPresent(Set<String>.self, forKey: .tags) ?? []
        folderID = try values.decodeIfPresent(UUID.self, forKey: .folderID)
        collectionIDs = try values.decodeIfPresent(Set<UUID>.self, forKey: .collectionIDs) ?? []
        language = try values.decodeIfPresent(String.self, forKey: .language)
        identifiers = try values.decodeIfPresent(Set<String>.self, forKey: .identifiers) ?? []
        updatedAt = try values.decodeIfPresent(Date.self, forKey: .updatedAt) ?? dateAdded
        deletedAt = try values.decodeIfPresent(Date.self, forKey: .deletedAt)
        coverStyle = try values.decodeIfPresent(CoverStyle.self, forKey: .coverStyle) ?? .sage
        asset = try values.decodeIfPresent(BookAsset.self, forKey: .asset)
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(title, forKey: .title)
        try values.encode(author, forKey: .author)
        try values.encode(summary, forKey: .summary)
        try values.encodeIfPresent(series, forKey: .series)
        try values.encodeIfPresent(seriesIndex, forKey: .seriesIndex)
        try values.encode(dateAdded, forKey: .dateAdded)
        try values.encodeIfPresent(lastOpened, forKey: .lastOpened)
        try values.encode(isFavorite, forKey: .isFavorite)
        try values.encode(progress, forKey: .progress)
        try values.encode(tags, forKey: .tags)
        try values.encodeIfPresent(folderID, forKey: .folderID)
        try values.encode(collectionIDs, forKey: .collectionIDs)
        try values.encodeIfPresent(language, forKey: .language)
        try values.encode(identifiers, forKey: .identifiers)
        try values.encode(updatedAt, forKey: .updatedAt)
        try values.encodeIfPresent(deletedAt, forKey: .deletedAt)
        try values.encode(coverStyle, forKey: .coverStyle)
        try values.encodeIfPresent(asset, forKey: .asset)
    }
}

public struct BookAsset: Codable, Hashable, Sendable {
    public let contentHash: String
    public let byteCount: Int64
    public let mediaType: String
    public let originalFilename: String
    public let localRelativePath: String

    public init(
        contentHash: String,
        byteCount: Int64,
        mediaType: String = "application/epub+zip",
        originalFilename: String,
        localRelativePath: String
    ) {
        self.contentHash = contentHash
        self.byteCount = byteCount
        self.mediaType = mediaType
        self.originalFilename = originalFilename
        self.localRelativePath = localRelativePath
    }
}

public enum ReadingState: String, Codable, CaseIterable, Sendable {
    case unread
    case reading
    case finished
}

public enum CoverStyle: String, Codable, CaseIterable, Sendable {
    case sage
    case midnight
    case clay
    case linen
    case ocean
    case plum
}
