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
        let archive: ZIPArchive
        let package: EPUBPackage
        do {
            archive = try ZIPArchive(url: sourceURL)
            package = try EPUBParser().parse(archive)
        } catch {
            throw ImportError.invalidEPUB
        }

        let contentHash = try hashFile(at: sourceURL)
        guard !existingHashes.contains(contentHash) else {
            throw ImportError.duplicate
        }

        let id = UUID()
        let relativePath = "Books/\(id.uuidString)/\(sourceURL.lastPathComponent)"
        let destinationURL = try libraryRoot()
            .appending(path: relativePath, directoryHint: .notDirectory)
        let bookDirectory = destinationURL.deletingLastPathComponent()
        let publicationRelativePath = "Books/\(id.uuidString)/Publication"
        let publicationURL = try libraryRoot().appending(path: publicationRelativePath, directoryHint: .isDirectory)

        try fileManager.createDirectory(at: bookDirectory, withIntermediateDirectories: true)
        do {
            try fileManager.copyItem(at: sourceURL, to: destinationURL)
            try archive.extract(to: publicationURL, fileManager: fileManager)
        } catch {
            try? fileManager.removeItem(at: bookDirectory)
            throw error
        }

        let rawTitle = sourceURL.deletingPathExtension().lastPathComponent.replacingOccurrences(of: "_", with: " ")
        let title = package.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cover = package.coverPath.map {
            CoverAsset(
                localRelativePath: "\(publicationRelativePath)/\($0)",
                mediaType: package.coverMediaType ?? "application/octet-stream"
            )
        }
        let coverIndex = id.uuidString.utf8.reduce(0) {
            ($0 + Int($1)) % CoverStyle.allCases.count
        }

        return Book(
            id: id,
            title: title?.isEmpty == false ? title! : (rawTitle.isEmpty ? "Untitled" : rawTitle),
            author: package.authors.isEmpty ? "Unknown Author" : package.authors.joined(separator: ", "),
            summary: package.summary ?? "",
            series: package.series,
            seriesIndex: package.seriesIndex,
            language: package.language,
            identifiers: package.identifiers,
            coverStyle: CoverStyle.allCases[coverIndex],
            cover: cover,
            asset: BookAsset(
                contentHash: contentHash,
                byteCount: byteCount,
                originalFilename: sourceURL.lastPathComponent,
                localRelativePath: relativePath,
                extractedRelativePath: publicationRelativePath,
                readingOrder: package.readingOrder,
                tableOfContents: package.tableOfContents
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
