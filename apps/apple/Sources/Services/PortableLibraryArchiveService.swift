import CryptoKit
import Foundation
import GlassleafDomain

actor PortableLibraryArchiveService {
    struct PreparedArchive: @unchecked Sendable {
        let wrapper: FileWrapper
    }

    struct PreparedRestore: Sendable {
        let stagedRoot: URL
    }

    enum ArchiveError: LocalizedError {
        case invalidPackage
        case missingMetadata
        case unsupportedSchema(Int)
        case inconsistentMetadata(String)
        case missingOriginal(String)
        case mismatchedOriginal(String)
        case unsafePath(String)

        var errorDescription: String? {
            switch self {
            case .invalidPackage:
                "The selected file isn’t a readable Glassleaf library."
            case .missingMetadata:
                "The selected library is missing library.json."
            case .unsupportedSchema(let version):
                "This library uses schema version \(version), which this version of Glassleaf cannot restore."
            case .inconsistentMetadata(let detail):
                "The library metadata is inconsistent: \(detail)"
            case .missingOriginal(let title):
                "The original EPUB for “\(title)” is missing from the library package."
            case .mismatchedOriginal(let title):
                "The original EPUB for “\(title)” does not match its recorded content hash."
            case .unsafePath(let path):
                "The library contains an unsafe asset path: \(path)"
            }
        }
    }

    private let fileManager: FileManager
    private let rootOverride: URL?

    init(fileManager: FileManager = .default, rootURL: URL? = nil) {
        self.fileManager = fileManager
        self.rootOverride = rootURL
    }

    func makeArchive(snapshot: LibrarySnapshot) throws -> PreparedArchive {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .deferredToDate
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let metadata = FileWrapper(regularFileWithContents: try encoder.encode(snapshot))
        metadata.preferredFilename = "library.json"

        let root = try libraryRoot()
        var originals: [String: FileWrapper] = [:]
        var covers: [String: FileWrapper] = [:]
        for book in snapshot.books {
            if let asset = book.asset {
                let source = try safeURL(for: asset.localRelativePath, under: root)
                if fileManager.fileExists(atPath: source.path) {
                    let wrapper = FileWrapper(regularFileWithContents: try Data(contentsOf: source, options: .mappedIfSafe))
                    let extensionName = source.pathExtension.isEmpty ? "epub" : source.pathExtension
                    let filename = "\(book.id.uuidString).\(extensionName)"
                    wrapper.preferredFilename = filename
                    originals[filename] = wrapper
                }
            }
            if let cover = book.cover {
                let source = try safeURL(for: cover.localRelativePath, under: root)
                if fileManager.fileExists(atPath: source.path) {
                    let wrapper = FileWrapper(regularFileWithContents: try Data(contentsOf: source, options: .mappedIfSafe))
                    let extensionName = source.pathExtension.isEmpty ? "cover" : source.pathExtension
                    let filename = "\(book.id.uuidString).\(extensionName)"
                    wrapper.preferredFilename = filename
                    covers[filename] = wrapper
                }
            }
        }

        let readme = FileWrapper(regularFileWithContents: Data("""
            Glassleaf portable library

            library.json contains versioned metadata, organization, progress, bookmarks, and annotations.
            Originals contains the unmodified EPUB files. Covers contains extracted or custom cover artwork.
            Restore validates metadata and original-file hashes before replacing a local library.
            No book content was transmitted to create this export.
            """.utf8))
        readme.preferredFilename = "README.txt"

        return PreparedArchive(
            wrapper: FileWrapper(directoryWithFileWrappers: [
                "library.json": metadata,
                "Originals": FileWrapper(directoryWithFileWrappers: originals),
                "Covers": FileWrapper(directoryWithFileWrappers: covers),
                "README.txt": readme,
            ])
        )
    }

    func prepareRestore(from packageURL: URL, destinationParent: URL) async throws -> PreparedRestore {
        let accessedSecurityScope = packageURL.startAccessingSecurityScopedResource()
        defer {
            if accessedSecurityScope { packageURL.stopAccessingSecurityScopedResource() }
        }

        let wrapper: FileWrapper
        do {
            wrapper = try FileWrapper(url: packageURL, options: .immediate)
        } catch {
            throw ArchiveError.invalidPackage
        }
        guard wrapper.isDirectory, let contents = wrapper.fileWrappers else {
            throw ArchiveError.invalidPackage
        }
        guard let metadata = contents["library.json"]?.regularFileContents else {
            throw ArchiveError.missingMetadata
        }

        let decoded: LibrarySnapshot
        do {
            decoded = try decodeSnapshot(from: metadata)
        } catch {
            throw ArchiveError.invalidPackage
        }
        guard decoded.schemaVersion <= LibrarySnapshot.currentSchemaVersion else {
            throw ArchiveError.unsupportedSchema(decoded.schemaVersion)
        }
        let snapshot = decoded.migratingOrganizationIdentity()
        try validate(snapshot)

        let originals = contents["Originals"]?.fileWrappers ?? [:]
        let covers = contents["Covers"]?.fileWrappers ?? [:]
        let stagedRoot = destinationParent.appending(
            path: ".glassleaf-restore-\(UUID().uuidString)",
            directoryHint: .isDirectory
        )
        do {
            try fileManager.createDirectory(at: stagedRoot, withIntermediateDirectories: false)
            for book in snapshot.books {
                try stageAssets(for: book, originals: originals, covers: covers, under: stagedRoot)
            }
            let stagedRepository = LocalLibraryRepository(rootURL: stagedRoot)
            try await stagedRepository.save(snapshot)
            try await stagedRepository.close()
            return PreparedRestore(stagedRoot: stagedRoot)
        } catch {
            try? fileManager.removeItem(at: stagedRoot)
            throw error
        }
    }

    func discard(_ restore: PreparedRestore) {
        try? fileManager.removeItem(at: restore.stagedRoot)
    }

    private func stageAssets(
        for book: Book,
        originals: [String: FileWrapper],
        covers: [String: FileWrapper],
        under stagedRoot: URL
    ) throws {
        guard let asset = book.asset else { return }
        guard let original = wrapper(for: book.id, in: originals) else {
            if book.deletedAt != nil { return }
            throw ArchiveError.missingOriginal(book.title)
        }

        let destination = try safeURL(for: asset.localRelativePath, under: stagedRoot)
        try fileManager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try original.write(to: destination, options: .atomic, originalContentsURL: nil)
        guard try hashFile(at: destination) == asset.contentHash else {
            throw ArchiveError.mismatchedOriginal(book.title)
        }

        if let extractedRelativePath = asset.extractedRelativePath {
            let extracted = try safeURL(for: extractedRelativePath, under: stagedRoot)
            do {
                try ZIPArchive(url: destination).extract(to: extracted, fileManager: fileManager)
            } catch {
                throw ArchiveError.mismatchedOriginal(book.title)
            }
        }

        guard let cover = book.cover else { return }
        let coverDestination = try safeURL(for: cover.localRelativePath, under: stagedRoot)
        if fileManager.fileExists(atPath: coverDestination.path) { return }
        guard let coverWrapper = wrapper(for: book.id, in: covers) else { return }
        try fileManager.createDirectory(at: coverDestination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try coverWrapper.write(to: coverDestination, options: .atomic, originalContentsURL: nil)
    }

    private func validate(_ snapshot: LibrarySnapshot) throws {
        try requireUnique(snapshot.books.map(\.id), label: "book IDs")
        try requireUnique(snapshot.folders.map(\.id), label: "folder IDs")
        try requireUnique(snapshot.tags.map(\.id), label: "tag IDs")
        try requireUnique(snapshot.collections.map(\.id), label: "collection IDs")
        try requireUnique(snapshot.series.map(\.id), label: "series IDs")
        try requireUnique(snapshot.smartCollections.map(\.id), label: "smart collection IDs")
        try requireUnique(snapshot.bookmarks.map(\.id), label: "bookmark IDs")
        try requireUnique(snapshot.annotations.map(\.id), label: "annotation IDs")

        let bookIDs = Set(snapshot.books.map(\.id))
        let folderIDs = Set(snapshot.folders.map(\.id))
        let tagIDs = Set(snapshot.tags.map(\.id))
        let collectionIDs = Set(snapshot.collections.map(\.id))
        let seriesIDs = Set(snapshot.series.map(\.id))
        for folder in snapshot.folders {
            if let parentID = folder.parentID, !folderIDs.contains(parentID) {
                throw ArchiveError.inconsistentMetadata("folder “\(folder.name)” has a missing parent")
            }
        }
        for book in snapshot.books {
            if let folderID = book.folderID, !folderIDs.contains(folderID) {
                throw ArchiveError.inconsistentMetadata("“\(book.title)” references a missing folder")
            }
            if !book.tagIDs.isSubset(of: tagIDs) {
                throw ArchiveError.inconsistentMetadata("“\(book.title)” references a missing tag")
            }
            if !book.collectionIDs.isSubset(of: collectionIDs) {
                throw ArchiveError.inconsistentMetadata("“\(book.title)” references a missing collection")
            }
            if let seriesID = book.seriesID, !seriesIDs.contains(seriesID) {
                throw ArchiveError.inconsistentMetadata("“\(book.title)” references a missing series")
            }
        }
        if snapshot.bookmarks.contains(where: { !bookIDs.contains($0.bookID) }) {
            throw ArchiveError.inconsistentMetadata("a bookmark references a missing book")
        }
        if snapshot.annotations.contains(where: { !bookIDs.contains($0.bookID) }) {
            throw ArchiveError.inconsistentMetadata("an annotation references a missing book")
        }
    }

    private func requireUnique(_ ids: [UUID], label: String) throws {
        guard Set(ids).count == ids.count else {
            throw ArchiveError.inconsistentMetadata("duplicate \(label)")
        }
    }

    private func wrapper(for id: UUID, in contents: [String: FileWrapper]) -> FileWrapper? {
        let prefix = id.uuidString + "."
        return contents.first(where: { $0.key.hasPrefix(prefix) })?.value
    }

    private func safeURL(for relativePath: String, under root: URL) throws -> URL {
        let components = relativePath.split(separator: "/", omittingEmptySubsequences: false)
        guard !relativePath.hasPrefix("/"), !components.isEmpty,
              components.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
            throw ArchiveError.unsafePath(relativePath)
        }
        let standardizedRoot = root.standardizedFileURL
        let destination = standardizedRoot.appending(path: relativePath).standardizedFileURL
        guard destination.path.hasPrefix(standardizedRoot.path + "/") else {
            throw ArchiveError.unsafePath(relativePath)
        }
        return destination
    }

    private func hashFile(at url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func decodeSnapshot(from data: Data) throws -> LibrarySnapshot {
        let numericDecoder = JSONDecoder()
        numericDecoder.dateDecodingStrategy = .deferredToDate
        if let snapshot = try? numericDecoder.decode(LibrarySnapshot.self, from: data) {
            return snapshot
        }
        let legacyDecoder = JSONDecoder()
        legacyDecoder.dateDecodingStrategy = .iso8601
        return try legacyDecoder.decode(LibrarySnapshot.self, from: data)
    }

    private func libraryRoot() throws -> URL {
        if let rootOverride { return rootOverride }
        return try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        ).appending(path: "Glassleaf", directoryHint: .isDirectory)
    }
}
