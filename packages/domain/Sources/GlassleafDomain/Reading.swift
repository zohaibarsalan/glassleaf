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
