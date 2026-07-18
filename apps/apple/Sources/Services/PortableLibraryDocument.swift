import Foundation
import GlassleafDomain
import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let glassleafLibrary = UTType(exportedAs: "app.glassleaf.library", conformingTo: .package)
}

struct PortableLibraryDocument: FileDocument, @unchecked Sendable {
    static var readableContentTypes: [UTType] { [.glassleafLibrary] }
    private let wrapper: FileWrapper

    init(wrapper: FileWrapper) {
        self.wrapper = wrapper
    }

    init(configuration: ReadConfiguration) throws {
        wrapper = configuration.file
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        wrapper
    }
}

actor LibraryExportService {
    func makeDocument(snapshot: LibrarySnapshot) throws -> PortableLibraryDocument {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let metadata = FileWrapper(regularFileWithContents: try encoder.encode(snapshot))
        metadata.preferredFilename = "library.json"

        let support = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        ).appending(path: "Glassleaf", directoryHint: .isDirectory)

        var originals: [String: FileWrapper] = [:]
        var covers: [String: FileWrapper] = [:]
        for book in snapshot.books where book.deletedAt == nil {
            if let asset = book.asset {
                let source = support.appending(path: asset.localRelativePath)
                if FileManager.default.fileExists(atPath: source.path) {
                    let wrapper = try FileWrapper(url: source, options: .immediate)
                    let extensionName = source.pathExtension.isEmpty ? "epub" : source.pathExtension
                    originals["\(book.id.uuidString).\(extensionName)"] = wrapper
                }
            }
            if let cover = book.cover {
                let source = support.appending(path: cover.localRelativePath)
                if FileManager.default.fileExists(atPath: source.path) {
                    let wrapper = try FileWrapper(url: source, options: .immediate)
                    let extensionName = source.pathExtension.isEmpty ? "cover" : source.pathExtension
                    covers["\(book.id.uuidString).\(extensionName)"] = wrapper
                }
            }
        }

        let readme = FileWrapper(regularFileWithContents: Data("""
            Glassleaf portable library

            library.json contains versioned metadata, organization, progress, bookmarks, and annotations.
            Originals contains the unmodified EPUB files. Covers contains extracted cover artwork.
            No book content was transmitted to create this export.
            """.utf8))
        readme.preferredFilename = "README.txt"

        let root = FileWrapper(directoryWithFileWrappers: [
            "library.json": metadata,
            "Originals": FileWrapper(directoryWithFileWrappers: originals),
            "Covers": FileWrapper(directoryWithFileWrappers: covers),
            "README.txt": readme,
        ])
        return PortableLibraryDocument(wrapper: root)
    }
}
