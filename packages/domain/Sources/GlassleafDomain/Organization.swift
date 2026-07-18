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
        name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(with: Locale(identifier: "en_US_POSIX"))
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
    public var coverBookID: UUID?
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        sortOrder: Int = 0,
        coverBookID: UUID? = nil,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.sortOrder = sortOrder
        self.coverBookID = coverBookID
        self.updatedAt = updatedAt
    }

    public var normalizedName: String {
        name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(with: Locale(identifier: "en_US_POSIX"))
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, sortOrder, coverBookID, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        name = try values.decode(String.self, forKey: .name)
        sortOrder = try values.decodeIfPresent(Int.self, forKey: .sortOrder) ?? 0
        coverBookID = try values.decodeIfPresent(UUID.self, forKey: .coverBookID)
        updatedAt = try values.decodeIfPresent(Date.self, forKey: .updatedAt) ?? .distantPast
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
    case tagID(UUID)
    case folder(UUID)
    case collection(UUID)
    case series(UUID)
    case readingState(ReadingState)
    case favorite(Bool)
    case authorContains(String)
    case seriesContains(String)

    public func includes(_ book: Book, tags: [Tag] = [], series: [Series] = []) -> Bool {
        switch self {
        case .all(let rules): return rules.allSatisfy { $0.includes(book, tags: tags, series: series) }
        case .any(let rules): return rules.contains { $0.includes(book, tags: tags, series: series) }
        case .not(let rule): return !rule.includes(book, tags: tags, series: series)
        case .tag(let name): return book.legacyTagNames.contains { $0.localizedCaseInsensitiveCompare(name) == .orderedSame }
        case .tagID(let id): return book.tagIDs.contains(id)
        case .folder(let id): return book.folderID == id
        case .collection(let id): return book.collectionIDs.contains(id)
        case .series(let id): return book.seriesID == id
        case .readingState(let state): return book.readingState == state
        case .favorite(let expected): return book.isFavorite == expected
        case .authorContains(let query): return book.author.localizedStandardContains(query)
        case .seriesContains(let query):
            guard let id = book.seriesID else {
                return book.legacySeriesName?.localizedStandardContains(query) == true
            }
            return series.first(where: { $0.id == id })?.name.localizedStandardContains(query) == true
        }
    }

    fileprivate var legacyTagNames: Set<String> {
        switch self {
        case .all(let rules), .any(let rules):
            rules.reduce(into: []) { $0.formUnion($1.legacyTagNames) }
        case .not(let rule): rule.legacyTagNames
        case .tag(let name): [name]
        default: []
        }
    }

    fileprivate func migratingOrganizationIdentity(
        tagIDsByName: [String: UUID],
        tagAliases: [UUID: UUID],
        seriesAliases: [UUID: UUID]
    ) -> SmartCollectionRule {
        switch self {
        case .all(let rules): .all(rules.map {
            $0.migratingOrganizationIdentity(
                tagIDsByName: tagIDsByName,
                tagAliases: tagAliases,
                seriesAliases: seriesAliases
            )
        })
        case .any(let rules): .any(rules.map {
            $0.migratingOrganizationIdentity(
                tagIDsByName: tagIDsByName,
                tagAliases: tagAliases,
                seriesAliases: seriesAliases
            )
        })
        case .not(let rule): .not(rule.migratingOrganizationIdentity(
            tagIDsByName: tagIDsByName,
            tagAliases: tagAliases,
            seriesAliases: seriesAliases
        ))
        case .tag(let name):
            tagIDsByName[Tag(name: name).normalizedName].map(SmartCollectionRule.tagID) ?? self
        case .tagID(let id): .tagID(tagAliases[id] ?? id)
        case .series(let id): .series(seriesAliases[id] ?? id)
        default: self
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
            if lhs.seriesID == rhs.seriesID { return (lhs.seriesIndex ?? 0) < (rhs.seriesIndex ?? 0) }
            return (lhs.seriesID?.uuidString ?? "").localizedStandardCompare(rhs.seriesID?.uuidString ?? "") == .orderedAscending
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
        schemaVersion: Int = 3,
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

    public func migratingOrganizationIdentity() -> LibrarySnapshot {
        var migrated = self
        var canonicalTags: [Tag] = []
        var tagIDsByName: [String: UUID] = [:]
        var tagAliases: [UUID: UUID] = [:]

        for tag in tags.sorted(by: { $0.sortOrder < $1.sortOrder }) {
            if let canonicalID = tagIDsByName[tag.normalizedName] {
                tagAliases[tag.id] = canonicalID
            } else {
                tagIDsByName[tag.normalizedName] = tag.id
                tagAliases[tag.id] = tag.id
                canonicalTags.append(tag)
            }
        }

        let legacyTagNames = Set(books.flatMap(\.legacyTagNames))
            .union(smartCollections.flatMap { $0.rule.legacyTagNames })
        for name in legacyTagNames.sorted(by: { $0.localizedStandardCompare($1) == .orderedAscending }) {
            let normalized = Tag(name: name).normalizedName
            guard tagIDsByName[normalized] == nil else { continue }
            let tag = Tag(name: name, sortOrder: canonicalTags.count)
            canonicalTags.append(tag)
            tagIDsByName[normalized] = tag.id
            tagAliases[tag.id] = tag.id
        }

        var canonicalSeries: [Series] = []
        var seriesIDsByName: [String: UUID] = [:]
        var seriesAliases: [UUID: UUID] = [:]
        for item in series.sorted(by: { $0.sortOrder < $1.sortOrder }) {
            if let canonicalID = seriesIDsByName[item.normalizedName] {
                seriesAliases[item.id] = canonicalID
            } else {
                seriesIDsByName[item.normalizedName] = item.id
                seriesAliases[item.id] = item.id
                canonicalSeries.append(item)
            }
        }

        for name in Set(books.compactMap(\.legacySeriesName)).sorted(by: { $0.localizedStandardCompare($1) == .orderedAscending }) {
            let normalized = Series(name: name).normalizedName
            guard seriesIDsByName[normalized] == nil else { continue }
            let item = Series(name: name, sortOrder: canonicalSeries.count)
            canonicalSeries.append(item)
            seriesIDsByName[normalized] = item.id
            seriesAliases[item.id] = item.id
        }

        for index in migrated.books.indices {
            let legacyNames = migrated.books[index].legacyTagNames
            migrated.books[index].tagIDs = Set(
                migrated.books[index].tagIDs.compactMap { tagAliases[$0] ?? $0 }
            )
            for name in legacyNames {
                if let id = tagIDsByName[Tag(name: name).normalizedName] {
                    migrated.books[index].tagIDs.insert(id)
                }
            }
            migrated.books[index].legacyTagNames.removeAll()

            if let existingID = migrated.books[index].seriesID {
                migrated.books[index].seriesID = seriesAliases[existingID] ?? existingID
            } else if let legacyName = migrated.books[index].legacySeriesName {
                migrated.books[index].seriesID = seriesIDsByName[Series(name: legacyName).normalizedName]
            }
            migrated.books[index].legacySeriesName = nil
        }

        migrated.tags = canonicalTags
        migrated.series = canonicalSeries
        migrated.smartCollections = migrated.smartCollections.map { item in
            var value = item
            value.rule = value.rule.migratingOrganizationIdentity(
                tagIDsByName: tagIDsByName,
                tagAliases: tagAliases,
                seriesAliases: seriesAliases
            )
            return value
        }
        migrated.schemaVersion = max(schemaVersion, 3)
        return migrated
    }
}
