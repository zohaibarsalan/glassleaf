import Foundation
import zlib

struct ZIPArchive: Sendable {
    enum ArchiveError: LocalizedError {
        case invalidArchive
        case unsupportedCompression(String)
        case unsafePath(String)
        case resourceLimit
        case corruptEntry(String)

        var errorDescription: String? {
            switch self {
            case .invalidArchive: "The EPUB archive is incomplete or corrupt."
            case .unsupportedCompression(let name): "The EPUB uses unsupported compression for \(name)."
            case .unsafePath(let name): "The EPUB contains an unsafe file path: \(name)."
            case .resourceLimit: "The EPUB expands beyond Glassleaf’s safe import limit."
            case .corruptEntry(let name): "The EPUB contains a corrupt file: \(name)."
            }
        }
    }

    struct Entry: Sendable {
        let path: String
        let compressionMethod: UInt16
        let compressedSize: Int
        let uncompressedSize: Int
        let crc32: UInt32
        let localHeaderOffset: Int
        var isDirectory: Bool { path.hasSuffix("/") }
    }

    let data: Data
    let entries: [Entry]

    init(url: URL) throws {
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        self.data = data
        entries = try Self.readEntries(from: data)
    }

    func data(forPath path: String) throws -> Data {
        guard let entry = entries.first(where: { $0.path == path }) else { throw ArchiveError.invalidArchive }
        return try data(for: entry)
    }

    func data(for entry: Entry) throws -> Data {
        guard !entry.isDirectory,
              entry.uncompressedSize <= 536_870_912,
              entry.localHeaderOffset >= 0,
              entry.localHeaderOffset + 30 <= data.count,
              data.uint32(at: entry.localHeaderOffset) == 0x04034B50 else {
            throw ArchiveError.resourceLimit
        }

        let nameLength = Int(data.uint16(at: entry.localHeaderOffset + 26))
        let extraLength = Int(data.uint16(at: entry.localHeaderOffset + 28))
        let start = entry.localHeaderOffset + 30 + nameLength + extraLength
        let end = start + entry.compressedSize
        guard start >= 0, end <= data.count else { throw ArchiveError.corruptEntry(entry.path) }
        let compressed = data.subdata(in: start..<end)

        let output: Data
        switch entry.compressionMethod {
        case 0: output = compressed
        case 8: output = try inflate(compressed, expectedSize: entry.uncompressedSize, path: entry.path)
        default: throw ArchiveError.unsupportedCompression(entry.path)
        }

        guard output.count == entry.uncompressedSize else { throw ArchiveError.corruptEntry(entry.path) }
        let checksum = output.withUnsafeBytes { bytes in
            zlib.crc32(0, bytes.bindMemory(to: Bytef.self).baseAddress, uInt(bytes.count))
        }
        guard checksum == entry.crc32 else { throw ArchiveError.corruptEntry(entry.path) }
        return output
    }

    func extract(to destination: URL, fileManager: FileManager = .default) throws {
        let totalSize = entries.reduce(Int64(0)) { $0 + Int64($1.uncompressedSize) }
        guard entries.count <= 50_000, totalSize <= 2_147_483_648 else { throw ArchiveError.resourceLimit }
        try fileManager.createDirectory(at: destination, withIntermediateDirectories: true)

        for entry in entries {
            let relativePath = try Self.safePath(entry.path)
            let outputURL = destination.appending(path: relativePath)
            if entry.isDirectory {
                try fileManager.createDirectory(at: outputURL, withIntermediateDirectories: true)
            } else {
                try fileManager.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data(for: entry).write(to: outputURL, options: [.atomic, .completeFileProtection])
            }
        }
    }

    private static func readEntries(from data: Data) throws -> [Entry] {
        guard data.count >= 22 else { throw ArchiveError.invalidArchive }
        let lowerBound = max(0, data.count - 65_557)
        var endOffset: Int?
        var cursor = data.count - 22
        while cursor >= lowerBound {
            if data.uint32(at: cursor) == 0x06054B50 { endOffset = cursor; break }
            cursor -= 1
        }
        guard let endOffset else { throw ArchiveError.invalidArchive }
        let entryCount = Int(data.uint16(at: endOffset + 10))
        let centralOffset = Int(data.uint32(at: endOffset + 16))
        guard entryCount <= 50_000, centralOffset >= 0, centralOffset < data.count else { throw ArchiveError.resourceLimit }

        var entries: [Entry] = []
        entries.reserveCapacity(entryCount)
        cursor = centralOffset
        for _ in 0..<entryCount {
            guard cursor + 46 <= data.count, data.uint32(at: cursor) == 0x02014B50 else { throw ArchiveError.invalidArchive }
            let method = data.uint16(at: cursor + 10)
            let checksum = data.uint32(at: cursor + 16)
            let compressedSize = Int(data.uint32(at: cursor + 20))
            let uncompressedSize = Int(data.uint32(at: cursor + 24))
            let nameLength = Int(data.uint16(at: cursor + 28))
            let extraLength = Int(data.uint16(at: cursor + 30))
            let commentLength = Int(data.uint16(at: cursor + 32))
            let localOffset = Int(data.uint32(at: cursor + 42))
            let nameStart = cursor + 46
            let nameEnd = nameStart + nameLength
            guard nameEnd <= data.count, let path = String(data: data.subdata(in: nameStart..<nameEnd), encoding: .utf8) else {
                throw ArchiveError.invalidArchive
            }
            _ = try safePath(path)
            entries.append(Entry(path: path, compressionMethod: method, compressedSize: compressedSize, uncompressedSize: uncompressedSize, crc32: checksum, localHeaderOffset: localOffset))
            cursor = nameEnd + extraLength + commentLength
        }
        return entries
    }

    private static func safePath(_ path: String) throws -> String {
        let value = path.replacingOccurrences(of: "\\", with: "/")
        guard !value.hasPrefix("/"), !value.contains("\0") else { throw ArchiveError.unsafePath(path) }
        let components = value.split(separator: "/", omittingEmptySubsequences: true)
        guard !components.isEmpty, !components.contains(".."), !components.contains(".") else { throw ArchiveError.unsafePath(path) }
        return components.joined(separator: "/") + (value.hasSuffix("/") ? "/" : "")
    }

    private func inflate(_ compressed: Data, expectedSize: Int, path: String) throws -> Data {
        guard expectedSize >= 0 else { throw ArchiveError.corruptEntry(path) }
        var output = Data(count: expectedSize)
        var stream = z_stream()
        let status = inflateInit2_(&stream, -MAX_WBITS, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size))
        guard status == Z_OK else { throw ArchiveError.corruptEntry(path) }
        defer { inflateEnd(&stream) }

        let result: Int32 = compressed.withUnsafeBytes { inputBytes in
            output.withUnsafeMutableBytes { outputBytes in
                stream.next_in = UnsafeMutablePointer(mutating: inputBytes.bindMemory(to: Bytef.self).baseAddress)
                stream.avail_in = uInt(inputBytes.count)
                stream.next_out = outputBytes.bindMemory(to: Bytef.self).baseAddress
                stream.avail_out = uInt(outputBytes.count)
                return zlib.inflate(&stream, Z_FINISH)
            }
        }
        guard result == Z_STREAM_END else { throw ArchiveError.corruptEntry(path) }
        return output
    }
}

private extension Data {
    func uint16(at offset: Int) -> UInt16 {
        UInt16(self[offset]) | UInt16(self[offset + 1]) << 8
    }

    func uint32(at offset: Int) -> UInt32 {
        UInt32(self[offset]) | UInt32(self[offset + 1]) << 8 | UInt32(self[offset + 2]) << 16 | UInt32(self[offset + 3]) << 24
    }
}
