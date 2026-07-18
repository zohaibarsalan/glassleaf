import CryptoKit
import Foundation
import GlassleafDomain

actor LocalBookImporter {
    enum ImportError: LocalizedError {
        case unsupportedFormat
        case emptyFile
        case invalidEPUB
        case duplicate

        var errorDescription: String? {
            switch self {
            case .unsupportedFormat:
                "Glassleaf currently imports EPUB files only."
            case .emptyFile:
                "The selected EPUB is empty."
            case .invalidEPUB:
                "The selected file doesn’t appear to be a valid EPUB."
            case .duplicate:
                "This EPUB is already in the library."
            }
        }
    }

    private let fileManager: FileManager
    private let rootOverride: URL?

    init(fileManager: FileManager = .default, rootURL: URL? = nil) {
        self.fileManager = fileManager
        self.rootOverride = rootURL
    }

    func importBook(from sourceURL: URL, existingHashes: Set<String>) throws -> Book {
        guard sourceURL.pathExtension.lowercased() == "epub" else {
            throw ImportError.unsupportedFormat
        }

        let accessedSecurityScope = sourceURL.startAccessingSecurityScopedResource()
        defer {
            if accessedSecurityScope {
                sourceURL.stopAccessingSecurityScopedResource()
            }
        }

        let resourceValues = try sourceURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        let byteCount = Int64(resourceValues.fileSize ?? 0)
        guard resourceValues.isRegularFile == true, byteCount > 0 else {
            throw ImportError.emptyFile
        }
        try validateEPUB(at: sourceURL)

        let contentHash = try hashFile(at: sourceURL)
        guard !existingHashes.contains(contentHash) else {
            throw ImportError.duplicate
        }

        let id = UUID()
        let relativePath = "Books/\(id.uuidString)/\(sourceURL.lastPathComponent)"
        let destinationURL = try libraryRoot()
            .appending(path: relativePath, directoryHint: .notDirectory)
        let bookDirectory = destinationURL.deletingLastPathComponent()

        try fileManager.createDirectory(at: bookDirectory, withIntermediateDirectories: true)
        do {
            try fileManager.copyItem(at: sourceURL, to: destinationURL)
        } catch {
            try? fileManager.removeItem(at: bookDirectory)
            throw error
        }

        let rawTitle = sourceURL.deletingPathExtension().lastPathComponent
        let title = rawTitle.replacingOccurrences(of: "_", with: " ")
        let coverIndex = id.uuidString.utf8.reduce(0) {
            ($0 + Int($1)) % CoverStyle.allCases.count
        }

        return Book(
            id: id,
            title: title.isEmpty ? "Untitled" : title,
            author: "Unknown Author",
            summary: "Metadata will be extracted when EPUB rendering is integrated.",
            tags: ["Inbox"],
            coverStyle: CoverStyle.allCases[coverIndex],
            asset: BookAsset(
                contentHash: contentHash,
                byteCount: byteCount,
                originalFilename: sourceURL.lastPathComponent,
                localRelativePath: relativePath
            )
        )
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

    private func validateEPUB(at url: URL) throws {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }

        let prefix = try handle.read(upToCount: 4_096) ?? Data()
        let zipSignature = Data([0x50, 0x4B, 0x03, 0x04])
        let epubMediaType = Data("application/epub+zip".utf8)

        guard prefix.starts(with: zipSignature), prefix.range(of: epubMediaType) != nil else {
            throw ImportError.invalidEPUB
        }
    }

    private func libraryRoot() throws -> URL {
        if let rootOverride {
            try fileManager.createDirectory(at: rootOverride, withIntermediateDirectories: true)
            return rootOverride
        }

        let root = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        .appending(path: "Glassleaf", directoryHint: .isDirectory)

        try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
}
