import CloudKit
import CryptoKit
import Foundation
import GlassleafDomain

struct CloudBookAssetDescriptor: Codable, Hashable, Sendable {
    let bookID: UUID
    let asset: BookAsset
}

actor CloudBookAssetStore {
    enum AssetError: LocalizedError {
        case missingLocalFile(String)
        case missingDownloadedFile
        case checksumMismatch

        var errorDescription: String? {
            switch self {
            case .missingLocalFile(let name): "Glassleaf couldn’t find the local EPUB for \(name)."
            case .missingDownloadedFile: "iCloud returned an EPUB record without its file."
            case .checksumMismatch: "The EPUB downloaded from iCloud didn’t match its saved checksum."
            }
        }
    }

    private let repository: LocalLibraryRepository
    private let fileManager: FileManager
    private let decoder = JSONDecoder()

    init(repository: LocalLibraryRepository, fileManager: FileManager = .default) {
        self.repository = repository
        self.fileManager = fileManager
    }

    func attachLocalAsset(to record: CKRecord, syncRecord: SyncRecord) async throws {
        guard syncRecord.id.kind == .bookAsset else { return }
        let descriptor = try decoder.decode(CloudBookAssetDescriptor.self, from: syncRecord.payload)
        let root = try await repository.libraryRootURL().standardizedFileURL
        let source = root.appending(path: descriptor.asset.localRelativePath, directoryHint: .notDirectory).standardizedFileURL
        guard source.path.hasPrefix(root.path + "/"), fileManager.fileExists(atPath: source.path) else {
            throw AssetError.missingLocalFile(descriptor.asset.originalFilename)
        }
        record["bookFile"] = CKAsset(fileURL: source)
    }

    func installDownloadedAsset(from record: CKRecord, syncRecord: SyncRecord) async throws {
        guard syncRecord.id.kind == .bookAsset else { return }
        let descriptor = try decoder.decode(CloudBookAssetDescriptor.self, from: syncRecord.payload)
        guard let source = (record["bookFile"] as? CKAsset)?.fileURL else {
            throw AssetError.missingDownloadedFile
        }

        let root = try await repository.libraryRootURL().standardizedFileURL
        let destination = root.appending(path: descriptor.asset.localRelativePath, directoryHint: .notDirectory).standardizedFileURL
        guard destination.path.hasPrefix(root.path + "/") else { throw AssetError.missingDownloadedFile }
        if fileManager.fileExists(atPath: destination.path),
           try hashFile(at: destination) == descriptor.asset.contentHash {
            return
        }

        let directory = destination.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let staged = directory.appending(path: ".icloud-\(UUID().uuidString).epub")
        defer { try? fileManager.removeItem(at: staged) }
        try fileManager.copyItem(at: source, to: staged)
        guard try hashFile(at: staged) == descriptor.asset.contentHash else {
            throw AssetError.checksumMismatch
        }

        let publication = root.appending(
            path: descriptor.asset.extractedRelativePath ?? "Books/\(descriptor.bookID.uuidString)/Publication",
            directoryHint: .isDirectory
        )
        if fileManager.fileExists(atPath: publication.path) { try fileManager.removeItem(at: publication) }
        try ZIPArchive(url: staged).extract(to: publication, fileManager: fileManager)
        if fileManager.fileExists(atPath: destination.path) { try fileManager.removeItem(at: destination) }
        try fileManager.moveItem(at: staged, to: destination)
    }

    private func hashFile(at url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hash = SHA256()
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
            hash.update(data: chunk)
        }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
