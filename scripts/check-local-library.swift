import Foundation
import GlassleafDomain

@main
struct LocalLibraryCheck {
    static func main() async throws {
        guard CommandLine.arguments.count == 3 else {
            fatalError("Expected EPUB fixture and temporary library paths")
        }
        let source = URL(filePath: CommandLine.arguments[1])
        let library = URL(filePath: CommandLine.arguments[2], directoryHint: .isDirectory)
        let importer = LocalBookImporter(rootURL: library)

        let book = try await importer.importBook(from: source, existingHashes: [])
        guard let asset = book.asset else { fatalError("Missing imported asset") }
        precondition(asset.contentHash.count == 64)
        precondition(book.title == "Generated Fixture")
        precondition(book.author == "Glassleaf Checks")
        precondition(book.language == "en")
        precondition(book.identifiers.contains("glassleaf-generated-fixture"))
        precondition(asset.readingOrder == [PublicationLink(href: "OEBPS/chapter.xhtml", mediaType: "application/xhtml+xml")])

        let original = library.appending(path: asset.localRelativePath)
        let publication = library
            .appending(path: asset.extractedRelativePath!, directoryHint: .isDirectory)
            .appending(path: "OEBPS/chapter.xhtml")
        precondition(FileManager.default.fileExists(atPath: original.path))
        precondition(FileManager.default.fileExists(atPath: publication.path))

        let repository = LocalLibraryRepository(rootURL: library)
        let folder = Folder(name: "Research")
        let collection = BookCollection(name: "Reference Shelf")
        var organized = book
        organized.folderID = folder.id
        organized.collectionIDs = [collection.id]
        organized.tags = ["Generated"]
        try await repository.save(LibrarySnapshot(books: [organized], folders: [folder], collections: [collection]))
        let restored = try await repository.load()
        let metadataMatches = try await repository.searchBookIDs("generated")
        let folderMatches = try await repository.searchBookIDs("rese")
        let collectionMatches = try await repository.searchBookIDs("reference")
        precondition(restored.books == [organized])
        precondition(metadataMatches == [organized.id])
        precondition(folderMatches == [organized.id])
        precondition(collectionMatches == [organized.id])

        do {
            _ = try await importer.importBook(from: source, existingHashes: [asset.contentHash])
            fatalError("Duplicate EPUB was accepted")
        } catch LocalBookImporter.ImportError.duplicate {}

        var identifierVariant = try Data(contentsOf: source)
        identifierVariant.append(0)
        let identifierVariantURL = library.appending(path: "Identifier_Variant.epub")
        try identifierVariant.write(to: identifierVariantURL)
        do {
            _ = try await importer.importBook(
                from: identifierVariantURL,
                existingHashes: [asset.contentHash],
                existingIdentifiers: Set(book.identifiers.map { $0.lowercased() })
            )
            fatalError("Matching publication identifier was accepted")
        } catch LocalBookImporter.ImportError.duplicate {}

        let onePixelPNG = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")!
        let cover = try await importer.storeCover(data: onePixelPNG, filename: "cover.png", for: organized.id)
        precondition(FileManager.default.fileExists(atPath: library.appending(path: cover.localRelativePath).path))

        print("PASS: safe EPUB import, metadata, assets, cover replacement, SQLite round-trip, FTS, and hash/identifier deduplication")
    }
}
