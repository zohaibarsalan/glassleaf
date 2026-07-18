import Foundation

public struct ReadingProgress: Codable, Hashable, Sendable {
    public var locator: String?
    public var fraction: Double
    public var updatedAt: Date
    public var deviceID: String?
    public var isCompleted: Bool

    public init(
        locator: String? = nil,
        fraction: Double = 0,
        updatedAt: Date = .now,
        deviceID: String? = nil,
        isCompleted: Bool = false
    ) {
        self.locator = locator
        self.fraction = min(max(fraction, 0), 1)
        self.updatedAt = updatedAt
        self.deviceID = deviceID
        self.isCompleted = isCompleted
    }

    public static let notStarted = ReadingProgress(updatedAt: .distantPast)
}

public struct ReaderPreferences: Codable, Hashable, Sendable {
    public var fontFamily: ReaderFont
    public var fontScale: Double
    public var lineSpacing: Double
    public var horizontalMargin: Double
    public var theme: ReaderTheme
    public var mode: ReadingMode

    public init(
        fontFamily: ReaderFont = .serif,
        fontScale: Double = 1,
        lineSpacing: Double = 8,
        horizontalMargin: Double = 28,
        theme: ReaderTheme = .paper,
        mode: ReadingMode = .paginated
    ) {
        self.fontFamily = fontFamily
        self.fontScale = min(max(fontScale, 0.8), 2)
        self.lineSpacing = min(max(lineSpacing, 2), 20)
        self.horizontalMargin = min(max(horizontalMargin, 16), 72)
        self.theme = theme
        self.mode = mode
    }
}

public enum ReaderFont: String, Codable, CaseIterable, Identifiable, Sendable {
    case serif
    case sans
    case rounded

    public var id: Self { self }
}

public enum ReaderTheme: String, Codable, CaseIterable, Identifiable, Sendable {
    case paper
    case sepia
    case night
    case black

    public var id: Self { self }
}

public enum ReadingMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case paginated
    case scrolling

    public var id: Self { self }
}

public struct Bookmark: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let bookID: UUID
    public var locator: String
    public var label: String?
    public var createdAt: Date

    public init(id: UUID = UUID(), bookID: UUID, locator: String, label: String? = nil, createdAt: Date = .now) {
        self.id = id
        self.bookID = bookID
        self.locator = locator
        self.label = label
        self.createdAt = createdAt
    }
}

public struct Annotation: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let bookID: UUID
    public var locator: String
    public var selectedText: String?
    public var note: String
    public var color: AnnotationColor
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        bookID: UUID,
        locator: String,
        selectedText: String? = nil,
        note: String = "",
        color: AnnotationColor = .yellow,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.bookID = bookID
        self.locator = locator
        self.selectedText = selectedText
        self.note = note
        self.color = color
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum AnnotationColor: String, Codable, CaseIterable, Identifiable, Sendable {
    case yellow, green, blue, pink, purple
    public var id: Self { self }
}
