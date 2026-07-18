import Foundation
import GlassleafDomain

actor LocalLibraryRepository {
    private struct Catalog: Codable {
        let schemaVersion: Int
        let books: [Book]
    }

    private let fileManager: FileManager
    private let rootOverride: URL?

    init(fileManager: FileManager = .default, rootURL: URL? = nil) {
        self.fileManager = fileManager
        self.rootOverride = rootURL
    }

    func load() throws -> [Book] {
        let catalogURL = try catalogURL(createDirectories: true)
        guard fileManager.fileExists(atPath: catalogURL.path) else { return [] }

        let data = try Data(contentsOf: catalogURL)
        return try JSONDecoder.glassleaf.decode(Catalog.self, from: data).books
    }

    func save(_ books: [Book]) throws {
        let catalogURL = try catalogURL(createDirectories: true)
        let data = try JSONEncoder.glassleaf.encode(Catalog(schemaVersion: 1, books: books))
        try data.write(to: catalogURL, options: [.atomic, .completeFileProtection])
    }

    private func catalogURL(createDirectories: Bool) throws -> URL {
        let root: URL
        if let rootOverride {
            root = rootOverride
        } else {
            root = try fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: createDirectories
            )
            .appending(path: "Glassleaf", directoryHint: .isDirectory)
        }

        if createDirectories {
            try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        }

        return root.appending(path: "catalog.json", directoryHint: .notDirectory)
    }
}

private extension JSONEncoder {
    static var glassleaf: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .deferredToDate
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return encoder
    }
}

private extension JSONDecoder {
    static var glassleaf: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .deferredToDate
        return decoder
    }
}
