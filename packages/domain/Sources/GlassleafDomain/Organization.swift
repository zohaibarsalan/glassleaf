import Foundation

public struct Folder: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var parentID: UUID?
    public var sortOrder: Int
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        parentID: UUID? = nil,
        sortOrder: Int = 0,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.parentID = parentID
        self.sortOrder = sortOrder
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct Tag: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var color: TagColor
    public var sortOrder: Int

    public init(id: UUID = UUID(), name: String, color: TagColor = .gray, sortOrder: Int = 0) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.color = color
        self.sortOrder = sortOrder
    }

    public var normalizedName: String {
        name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

public enum TagColor: String, Codable, CaseIterable, Identifiable, Sendable {
    case gray, red, orange, yellow, green, blue, purple
    public var id: Self { self }
}

public struct BookCollection: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var sortOrder: Int
    public var createdAt: Date

    public init(id: UUID = UUID(), name: String, sortOrder: Int = 0, createdAt: Date = .now) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}

public struct Series: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var sortOrder: Int

    public init(id: UUID = UUID(), name: String, sortOrder: Int = 0) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.sortOrder = sortOrder
    }
}

public struct SmartCollection: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var rule: SmartCollectionRule
    public var sortOrder: Int

    public init(id: UUID = UUID(), name: String, rule: SmartCollectionRule, sortOrder: Int = 0) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.rule = rule
        self.sortOrder = sortOrder
    }
}

public indirect enum SmartCollectionRule: Codable, Hashable, Sendable {
    case all([SmartCollectionRule])
    case any([SmartCollectionRule])
    case not(SmartCollectionRule)
    case tag(String)
    case folder(UUID)
    case collection(UUID)
    case readingState(ReadingState)
    case favorite(Bool)
    case authorContains(String)
    case seriesContains(String)

    public func includes(_ book: Book) -> Bool {
        switch self {
        case .all(let rules): rules.allSatisfy { $0.includes(book) }
        case .any(let rules): rules.contains { $0.includes(book) }
        case .not(let rule): !rule.includes(book)
        case .tag(let name): book.tags.contains { $0.localizedCaseInsensitiveCompare(name) == .orderedSame }
        case .folder(let id): book.folderID == id
        case .collection(let id): book.collectionIDs.contains(id)
        case .readingState(let state): book.readingState == state
        case .favorite(let expected): book.isFavorite == expected
        case .authorContains(let query): book.author.localizedStandardContains(query)
        case .seriesContains(let query): book.series?.localizedStandardContains(query) == true
        }
    }
}

public enum LibrarySort: String, Codable, CaseIterable, Identifiable, Sendable {
    case recentlyAdded
    case lastOpened
    case title
    case author
    case series
    case progress

    public var id: Self { self }

    public func areInIncreasingOrder(_ lhs: Book, _ rhs: Book) -> Bool {
        switch self {
        case .recentlyAdded: return lhs.dateAdded > rhs.dateAdded
        case .lastOpened: return (lhs.lastOpened ?? .distantPast) > (rhs.lastOpened ?? .distantPast)
        case .title: return lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
        case .author: return lhs.author.localizedStandardCompare(rhs.author) == .orderedAscending
        case .series:
            if lhs.series == rhs.series { return (lhs.seriesIndex ?? 0) < (rhs.seriesIndex ?? 0) }
            return (lhs.series ?? "").localizedStandardCompare(rhs.series ?? "") == .orderedAscending
        case .progress: return lhs.progress.fraction > rhs.progress.fraction
        }
    }
}

public struct LibrarySnapshot: Codable, Hashable, Sendable {
    public var schemaVersion: Int
    public var exportedAt: Date
    public var books: [Book]
    public var folders: [Folder]
    public var tags: [Tag]
    public var collections: [BookCollection]
    public var series: [Series]
    public var smartCollections: [SmartCollection]
    public var bookmarks: [Bookmark]
    public var annotations: [Annotation]

    public init(
        schemaVersion: Int = 2,
        exportedAt: Date = .now,
        books: [Book] = [],
        folders: [Folder] = [],
        tags: [Tag] = [],
        collections: [BookCollection] = [],
        series: [Series] = [],
        smartCollections: [SmartCollection] = [],
        bookmarks: [Bookmark] = [],
        annotations: [Annotation] = []
    ) {
        self.schemaVersion = schemaVersion
        self.exportedAt = exportedAt
        self.books = books
        self.folders = folders
        self.tags = tags
        self.collections = collections
        self.series = series
        self.smartCollections = smartCollections
        self.bookmarks = bookmarks
        self.annotations = annotations
    }
}
