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

        let invalidEPUB = library.deletingLastPathComponent().appending(path: "Invalid.epub")
        try Data("not an epub".utf8).write(to: invalidEPUB)
        do {
            _ = try await importer.importBook(from: invalidEPUB, existingHashes: [])
            fatalError("Malformed EPUB was accepted")
        } catch LocalBookImporter.ImportError.invalidEPUB {}

        let queueRoot = library.deletingLastPathComponent().appending(path: "queue", directoryHint: .isDirectory)
        let queue = ImportQueueService(rootURL: queueRoot)
        let enqueueResult = try await queue.enqueue([source])
        precondition(enqueueResult.jobs.count == 1)
        precondition(enqueueResult.failures.isEmpty)
        let queuedJob = enqueueResult.jobs[0]
        try await queue.markProcessing(queuedJob.id)
        let relaunchedQueue = ImportQueueService(rootURL: queueRoot)
        let resumedJobs = try await relaunchedQueue.jobsReadyForProcessing()
        precondition(resumedJobs.map(\.id) == [queuedJob.id])
        try await relaunchedQueue.markFailed(queuedJob.id, message: "Test failure")
        let failedJobs = try await relaunchedQueue.failedJobs()
        precondition(failedJobs.map(\.id) == [queuedJob.id])
        try await relaunchedQueue.retryFailedJobs()
        let retriedJobs = try await relaunchedQueue.jobsReadyForProcessing()
        precondition(retriedJobs.map(\.id) == [queuedJob.id])
        let stagedJobURL = try await relaunchedQueue.stagedURL(for: queuedJob)
        precondition(FileManager.default.fileExists(atPath: stagedJobURL.path))
        try await relaunchedQueue.complete(queuedJob.id)
        let completedJobs = try await relaunchedQueue.jobsReadyForProcessing()
        precondition(completedJobs.isEmpty)

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
        let tag = Tag(name: "Generated")
        var organized = book
        organized.folderID = folder.id
        organized.collectionIDs = [collection.id]
        organized.tagIDs = [tag.id]
        try await repository.save(LibrarySnapshot(books: [organized], folders: [folder], tags: [tag], collections: [collection]))
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

        organized.cover = cover
        let bookmark = Bookmark(bookID: organized.id, locator: "OEBPS/chapter.xhtml#progress=0.4", label: "Return here")
        let annotation = Annotation(bookID: organized.id, locator: bookmark.locator, note: "Portable note")
        let portableSnapshot = LibrarySnapshot(
            books: [organized],
            folders: [folder],
            tags: [tag],
            collections: [collection],
            bookmarks: [bookmark],
            annotations: [annotation]
        )
        try await repository.save(portableSnapshot)

        let archiveService = PortableLibraryArchiveService(rootURL: library)
        let archiveWrapper = try await archiveService.makeArchive(snapshot: portableSnapshot).wrapper
        let package = library.deletingLastPathComponent().appending(
            path: "Export.glassleaflibrary",
            directoryHint: .isDirectory
        )
        try archiveWrapper.write(to: package, options: .atomic, originalContentsURL: nil)

        let restoredRoot = library.deletingLastPathComponent().appending(path: "restored", directoryHint: .isDirectory)
        let restoredRepository = LocalLibraryRepository(rootURL: restoredRoot)
        let replacedBook = Book(title: "Replace Me", author: "Glassleaf Checks")
        try await restoredRepository.save(LibrarySnapshot(books: [replacedBook]))
        let prepared = try await archiveService.prepareRestore(
            from: package,
            destinationParent: restoredRoot.deletingLastPathComponent()
        )
        let result = try await restoredRepository.installPreparedLibrary(at: prepared.stagedRoot)
        precondition(result.snapshot.books == [organized])
        precondition(result.snapshot.bookmarks == [bookmark])
        precondition(result.snapshot.annotations == [annotation])
        precondition(result.backupURL.map { FileManager.default.fileExists(atPath: $0.path) } == true)
        precondition(FileManager.default.fileExists(atPath: restoredRoot.appending(path: asset.localRelativePath).path))
        precondition(FileManager.default.fileExists(atPath: restoredRoot.appending(path: asset.extractedRelativePath!).appending(path: "OEBPS/chapter.xhtml").path))
        precondition(FileManager.default.fileExists(atPath: restoredRoot.appending(path: cover.localRelativePath).path))

        print("PASS: safe EPUB import, metadata, assets, portable backup/restore, rollback backup, SQLite round-trip, FTS, and deduplication")
    }
}
