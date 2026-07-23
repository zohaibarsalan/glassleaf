import Foundation
import GlassleafDomain

@main
struct SampleLibraryLoader {
    static func main() async throws {
        guard CommandLine.arguments.count == 2 else {
            fatalError("Expected the sample EPUB directory")
        }

        let samplesURL = URL(filePath: CommandLine.arguments[1], directoryHint: .isDirectory)
        let sampleURLs = try FileManager.default.contentsOfDirectory(
            at: samplesURL,
            includingPropertiesForKeys: nil
        )
        .filter { $0.pathExtension.lowercased() == "epub" }
        .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }

        let repository = LocalLibraryRepository()
        let importer = LocalBookImporter()
        var snapshot = try await repository.load()
        var hashes = Set(snapshot.books.compactMap(\.asset?.contentHash))
        var identifiers = Set(snapshot.books.flatMap(\.identifiers).map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        })
        var importedCount = 0

        for (index, sampleURL) in sampleURLs.enumerated() {
            do {
                var book = try await importer.importBook(
                    from: sampleURL,
                    existingHashes: hashes,
                    existingIdentifiers: identifiers
                )
                if index == 0 {
                    book.progress = ReadingProgress(
                        locator: book.asset?.readingOrder.first?.href,
                        fraction: 0.22
                    )
                }
                book.isFavorite = [0, 2, 5].contains(index)
                snapshot.books.insert(book, at: 0)
                hashes.insert(book.asset?.contentHash ?? "")
                identifiers.formUnion(book.identifiers.map {
                    $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                })
                importedCount += 1
            } catch LocalBookImporter.ImportError.duplicate {
                continue
            }
        }

        if importedCount > 0 {
            try await repository.save(snapshot)
        }
        print("Loaded \(importedCount) sample EPUBs; library now contains \(snapshot.books.count) books.")
    }
}
