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
    private let archives = PortableLibraryArchiveService()

    func makeDocument(snapshot: LibrarySnapshot) async throws -> PortableLibraryDocument {
        PortableLibraryDocument(wrapper: try await archives.makeArchive(snapshot: snapshot))
    }
}
