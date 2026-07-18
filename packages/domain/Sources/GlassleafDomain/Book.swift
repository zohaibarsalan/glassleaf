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
        self.coverStyle = coverStyle
        self.asset = asset
    }

    public var readingState: ReadingState {
        if progress.isCompleted { return .finished }
        if progress.fraction > 0 { return .reading }
        return .unread
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
