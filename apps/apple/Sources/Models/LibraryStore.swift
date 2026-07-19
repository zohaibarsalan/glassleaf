import Foundation
import GlassleafDomain
import Observation

enum OrganizerKind: String, CaseIterable, Hashable, Sendable {
    case folders
    case collections
    case tags
    case series

    var title: String {
        switch self {
        case .folders: "Folders"
        case .collections: "Collections"
        case .tags: "Tags"
        case .series: "Series"
        }
    }

    var singularTitle: String {
        switch self {
        case .folders: "Folder"
        case .collections: "Collection"
        case .tags: "Tag"
        case .series: "Series"
        }
    }

    var systemImage: String {
        switch self {
        case .folders: "folder"
        case .collections: "rectangle.stack"
        case .tags: "tag"
        case .series: "square.stack.3d.up"
        }
    }

    var creationSystemImage: String {
        switch self {
        case .folders: "folder.badge.plus"
        case .collections: "rectangle.stack.badge.plus"
        case .tags: "tag"
        case .series: "square.stack.3d.up"
        }
    }
}

enum SidebarDestination: Hashable, Sendable {
    case home
    case library(LibraryFilter)
    case inbox
    case organizer(OrganizerKind)
    case folder(UUID)
    case tag(UUID)
    case collection(UUID)
    case series(UUID)
    case smartCollection(UUID)
    case trash
}

enum LibraryLayout: String, CaseIterable, Identifiable, Sendable {
    case grid
    case list
    var id: Self { self }
}

enum CloudSyncState: Equatable, Sendable {
    case localOnly
    case preparing
    case syncing
    case synced(Date)
    case failed(String)

    var title: String {
        switch self {
        case .localOnly: "On This Device"
        case .preparing: "Connecting to iCloud…"
        case .syncing: "Syncing…"
        case .synced: "Synced with iCloud"
        case .failed: "iCloud Needs Attention"
        }
    }

    var detail: String {
        switch self {
        case .localOnly: "Local library"
        case .preparing: "Checking your account"
        case .syncing: "Saving library changes"
        case .synced(let date): "Updated \(date.formatted(date: .omitted, time: .shortened))"
        case .failed(let message): message
        }
    }
}

@MainActor
@Observable
final class LibraryStore {
    struct ImportAlert: Identifiable {
        let id = UUID()
        let title: String
        let message: String
    }

    var books: [Book]
    var folders: [Folder]
    var tags: [Tag]
    var collections: [BookCollection]
    var series: [Series]
    var smartCollections: [SmartCollection]
    var bookmarks: [Bookmark]
    var annotations: [Annotation]
    var readerPreferences: ReaderPreferences

    var selection: SidebarDestination = .home
    var presentedBook: Book?
    var readerBook: Book?
    var searchText = "" {
        didSet { scheduleSearch() }
    }
    var sort: LibrarySort = .recentlyAdded
    var layout: LibraryLayout = .grid
    var selectedBookIDs: Set<UUID> = []
    var isSelecting = false
    var showsImporter = false
    var isImporting = false
    var importAlert: ImportAlert?
    var exportDocument: PortableLibraryDocument?
    var showsExporter = false
    var isExporting = false
    var showsRestoreImporter = false
    var pendingRestoreURL: URL?
    var isRestoring = false
    private(set) var isSearching = false
    private(set) var failedImportCount = 0
    private(set) var isICloudSyncEnabled: Bool
    private(set) var cloudSyncState: CloudSyncState

    private let isPreview: Bool
    private let repository: LocalLibraryRepository
    private let importer: LocalBookImporter
    private let importQueue: ImportQueueService
    private let exporter = LibraryExportService()
    private let archives = PortableLibraryArchiveService()
    @ObservationIgnored private var cloudSync: LibraryCloudSyncService?
    private var searchResultIDs: [UUID]?
    private var searchResultQuery = ""
    private var searchTask: Task<Void, Never>?
    private var cloudSyncTask: Task<Void, Never>?
    @ObservationIgnored private var foldersByID: [UUID: Folder] = [:]
    @ObservationIgnored private var tagNamesByID: [UUID: String] = [:]
    @ObservationIgnored private var collectionNamesByID: [UUID: String] = [:]
    @ObservationIgnored private var seriesNamesByID: [UUID: String] = [:]

    init(
        books: [Book] = [],
        folders: [Folder] = [],
        tags: [Tag] = [],
        collections: [BookCollection] = [],
        series: [Series] = [],
        smartCollections: [SmartCollection] = [],
        bookmarks: [Bookmark] = [],
        annotations: [Annotation] = [],
        readerPreferences: ReaderPreferences = ReaderPreferenceStore.load(),
        isPreview: Bool = false,
        repository: LocalLibraryRepository = LocalLibraryRepository(),
        importer: LocalBookImporter = LocalBookImporter(),
        importQueue: ImportQueueService = ImportQueueService()
    ) {
        let migrated = LibrarySnapshot(
            books: books,
            folders: folders,
            tags: tags,
            collections: collections,
            series: series,
            smartCollections: smartCollections,
            bookmarks: bookmarks,
            annotations: annotations
        ).migratingOrganizationIdentity()
        self.books = migrated.books
        self.folders = migrated.folders
        self.tags = migrated.tags
        self.collections = migrated.collections
        self.series = migrated.series
        self.smartCollections = migrated.smartCollections
        self.bookmarks = migrated.bookmarks
        self.annotations = migrated.annotations
        self.readerPreferences = readerPreferences
        self.isPreview = isPreview
        self.repository = repository
        self.importer = importer
        self.importQueue = importQueue
        let syncEnabled = !isPreview && CloudSyncIdentityStore.isEnabled
        isICloudSyncEnabled = syncEnabled
        cloudSyncState = syncEnabled ? .preparing : .localOnly
        cloudSync = nil
        rebuildLookupCaches()
    }

    func books(matching destination: SidebarDestination) -> [Book] {
        var candidates = books.filter { destination.includes($0, store: self) }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !query.isEmpty {
            if isPreview {
                candidates = candidates.filter { Self.matchesSearch($0, query: query, store: self) }
            } else if searchResultQuery == query, let searchResultIDs {
                let rank = Dictionary(uniqueKeysWithValues: searchResultIDs.enumerated().map { ($0.element, $0.offset) })
                candidates = candidates.filter { rank[$0.id] != nil }
                if sort == .recentlyAdded {
                    return candidates.sorted { rank[$0.id, default: .max] < rank[$1.id, default: .max] }
                }
            } else {
                candidates = candidates.filter { Self.matchesSearch($0, query: query, store: self) }
            }
        }
        if sort == .series {
            let seriesNamesByID = seriesNamesByID
            return candidates.sorted { lhs, rhs in
                let left = lhs.seriesID.flatMap { seriesNamesByID[$0] } ?? ""
                let right = rhs.seriesID.flatMap { seriesNamesByID[$0] } ?? ""
                if left.localizedStandardCompare(right) == .orderedSame {
                    return (lhs.seriesIndex ?? 0) < (rhs.seriesIndex ?? 0)
                }
                return left.localizedStandardCompare(right) == .orderedAscending
            }
        }
        return candidates.sorted(by: sort.areInIncreasingOrder)
    }

    func count(for destination: SidebarDestination) -> Int {
        books.lazy.filter { destination.includes($0, store: self) }.count
    }

    func sidebarCounts() -> [SidebarDestination: Int] {
        var counts: [SidebarDestination: Int] = [:]
        for book in books {
            guard book.deletedAt == nil else {
                counts[.trash, default: 0] += 1
                continue
            }
            counts[.library(.all), default: 0] += 1
            if book.isInInbox { counts[.inbox, default: 0] += 1 }
            counts[.library(book.readingState.libraryFilter), default: 0] += 1
            if book.isFavorite { counts[.library(.favorites), default: 0] += 1 }
            if let id = book.folderID {
                counts[.organizer(.folders), default: 0] += 1
                counts[.folder(id), default: 0] += 1
            }
            if let id = book.seriesID {
                counts[.organizer(.series), default: 0] += 1
                counts[.series(id), default: 0] += 1
            }
            if !book.tagIDs.isEmpty { counts[.organizer(.tags), default: 0] += 1 }
            if !book.collectionIDs.isEmpty { counts[.organizer(.collections), default: 0] += 1 }
            for id in book.tagIDs { counts[.tag(id), default: 0] += 1 }
            for id in book.collectionIDs { counts[.collection(id), default: 0] += 1 }
            for collection in smartCollections where collection.rule.includes(book, tags: tags, series: series) {
                counts[.smartCollection(collection.id), default: 0] += 1
            }
        }
        return counts
    }

    func tagName(for id: UUID) -> String? {
        tagNamesByID[id]
    }

    func tagNames(for book: Book) -> [String] {
        book.tagIDs.compactMap(tagName(for:)).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    func seriesName(for book: Book) -> String? {
        book.seriesID.flatMap { seriesNamesByID[$0] }
    }

    func folderPath(for id: UUID) -> String {
        var components: [String] = []
        var currentID: UUID? = id
        var visited: Set<UUID> = []
        while let value = currentID,
              visited.insert(value).inserted,
              let folder = foldersByID[value] {
            components.append(folder.name)
            currentID = folder.parentID
        }
        return components.reversed().joined(separator: " / ")
    }

    var foldersByPath: [Folder] {
        folders.sorted { folderPath(for: $0.id).localizedStandardCompare(folderPath(for: $1.id)) == .orderedAscending }
    }

    func folderDepth(for id: UUID) -> Int {
        var depth = 0
        var currentID = foldersByID[id]?.parentID
        var visited: Set<UUID> = []
        while let value = currentID, visited.insert(value).inserted, let folder = foldersByID[value] {
            depth += 1
            currentID = folder.parentID
        }
        return depth
    }

    func toggleFavorite(for id: Book.ID) {
        updateBook(id: id) { $0.isFavorite.toggle() }
    }

    func showDetails(for book: Book) {
        presentedBook = book
    }

    func startReading(_ book: Book) {
        presentedBook = nil
        readerBook = book
    }

    func closeReader(at fraction: Double, locator: String? = nil) {
        guard let id = readerBook?.id else { return }
        updateBook(id: id) { book in
            book.progress = ReadingProgress(
                locator: locator ?? "prototype:\(fraction)",
                fraction: fraction,
                deviceID: "local",
                isCompleted: fraction >= 0.995
            )
            book.lastOpened = .now
        }
        readerBook = nil
    }

    func updateReaderPreferences(_ preferences: ReaderPreferences) {
        readerPreferences = preferences
        ReaderPreferenceStore.save(preferences)
    }

    func isBookmarked(bookID: UUID, locator: String) -> Bool {
        bookmarks.contains { $0.bookID == bookID && $0.locator == locator }
    }

    func toggleBookmark(bookID: UUID, locator: String, label: String? = nil) {
        if let index = bookmarks.firstIndex(where: { $0.bookID == bookID && $0.locator == locator }) {
            bookmarks.remove(at: index)
        } else {
            bookmarks.append(Bookmark(bookID: bookID, locator: locator, label: label))
        }
        persistReading(bookID: bookID)
    }

    func deleteBookmark(_ id: UUID) {
        guard let bookmark = bookmarks.first(where: { $0.id == id }) else { return }
        bookmarks.removeAll { $0.id == id }
        persistReading(bookID: bookmark.bookID)
    }

    func addAnnotation(bookID: UUID, locator: String, selectedText: String? = nil, note: String, color: AnnotationColor = .yellow) {
        annotations.append(Annotation(bookID: bookID, locator: locator, selectedText: selectedText, note: note, color: color))
        persistReading(bookID: bookID)
    }

    func deleteAnnotation(_ id: UUID) {
        guard let annotation = annotations.first(where: { $0.id == id }) else { return }
        annotations.removeAll { $0.id == id }
        persistReading(bookID: annotation.bookID)
    }

    func loadLibrary() async {
        guard !isPreview else { return }
        do {
            apply(try await repository.load())
            await resumeImportQueue()
            if isICloudSyncEnabled { await synchronizeWithICloud(reportFailure: false) }
        } catch {
            importAlert = ImportAlert(
                title: "Library Couldn’t Be Loaded",
                message: "Your stored books were left unchanged. Try reopening Glassleaf."
            )
        }
    }

    func enableICloudSync() async {
        guard !isPreview, !isICloudSyncEnabled else { return }
        cloudSyncState = .preparing
        do {
            let cloudSync = cloudSyncService()
            guard try await cloudSync.accountIsAvailable() else {
                throw CloudKitSyncError.accountUnavailable
            }
            let result = try await cloudSync.synchronize(
                snapshot: snapshot(),
                readerPreferences: readerPreferences
            )
            CloudSyncIdentityStore.isEnabled = true
            isICloudSyncEnabled = true
            applyCloudSyncResult(result)
        } catch {
            cloudSyncState = .failed(error.localizedDescription)
        }
    }

    func synchronizeWithICloud(reportFailure: Bool = true) async {
        guard !isPreview, isICloudSyncEnabled else { return }
        cloudSyncState = .syncing
        do {
            let cloudSync = cloudSyncService()
            let result = try await cloudSync.synchronize(
                snapshot: snapshot(),
                readerPreferences: readerPreferences
            )
            applyCloudSyncResult(result)
        } catch {
            cloudSyncState = .failed(error.localizedDescription)
            if reportFailure {
                importAlert = ImportAlert(title: "iCloud Sync Failed", message: error.localizedDescription)
            }
        }
    }

    func disableICloudSync() {
        cloudSyncTask?.cancel()
        CloudSyncIdentityStore.isEnabled = false
        isICloudSyncEnabled = false
        cloudSyncState = .localOnly
    }

    func requestImport() {
        showsImporter = true
    }

    func requestRestore() {
        guard !isImporting, !isExporting, !isRestoring else { return }
        showsRestoreImporter = true
    }

    func proposeRestore(from url: URL) {
        pendingRestoreURL = url
    }

    func cancelRestore() {
        pendingRestoreURL = nil
    }

    func restoreLibrary() async {
        guard let source = pendingRestoreURL, !isRestoring else { return }
        pendingRestoreURL = nil
        isRestoring = true
        defer { isRestoring = false }

        var prepared: PortableLibraryArchiveService.PreparedRestore?
        do {
            let root = try await repository.libraryRootURL()
            let restore = try await archives.prepareRestore(
                from: source,
                destinationParent: root.deletingLastPathComponent()
            )
            prepared = restore
            let result = try await repository.installPreparedLibrary(at: restore.stagedRoot)
            apply(result.snapshot)
            selection = .home
            presentedBook = nil
            readerBook = nil
            selectedBookIDs.removeAll()
            isSelecting = false
            await refreshFailedImportCount()
            importAlert = ImportAlert(
                title: "Library Restored",
                message: result.backupURL == nil
                    ? "The portable library was validated and restored."
                    : "The portable library was validated and restored. Your previous local library remains available in Glassleaf Backups."
            )
        } catch {
            if let prepared { await archives.discard(prepared) }
            importAlert = ImportAlert(title: "Restore Failed", message: error.localizedDescription)
        }
    }

    func prepareExport() async {
        guard !isExporting else { return }
        isExporting = true
        defer { isExporting = false }
        do {
            exportDocument = try await exporter.makeDocument(snapshot: snapshot())
            showsExporter = true
        } catch {
            importAlert = ImportAlert(title: "Export Failed", message: error.localizedDescription)
        }
    }

    func importBooks(from urls: [URL]) async {
        guard !urls.isEmpty, !isImporting, !isRestoring else { return }
        isImporting = true
        defer { isImporting = false }

        do {
            let enqueued = try await importQueue.enqueue(urls)
            let processed = await processQueuedImports()
            if processed.importedCount > 0 {
                selection = .inbox
                scheduleSearch()
            }
            let failures = enqueued.failures + processed.failures
            if !failures.isEmpty {
                importAlert = ImportAlert(
                    title: processed.importedCount > 0 ? "Some Books Weren’t Imported" : "Import Failed",
                    message: Self.importFailureMessage(failures)
                )
            }
        } catch {
            importAlert = ImportAlert(title: "Import Queue Failed", message: error.localizedDescription)
        }
        await refreshFailedImportCount()
    }

    func retryFailedImports() async {
        guard !isImporting, !isRestoring else { return }
        isImporting = true
        defer { isImporting = false }
        do {
            try await importQueue.retryFailedJobs()
            let processed = await processQueuedImports()
            if processed.importedCount > 0 {
                selection = .inbox
                scheduleSearch()
            }
            if !processed.failures.isEmpty {
                importAlert = ImportAlert(
                    title: "Some Books Still Couldn’t Be Imported",
                    message: Self.importFailureMessage(processed.failures)
                )
            }
        } catch {
            importAlert = ImportAlert(title: "Import Queue Failed", message: error.localizedDescription)
        }
        await refreshFailedImportCount()
    }

    private func resumeImportQueue() async {
        guard !isImporting, !isRestoring else { return }
        isImporting = true
        let processed = await processQueuedImports()
        isImporting = false
        if processed.importedCount > 0 {
            selection = .inbox
            scheduleSearch()
        }
        if !processed.failures.isEmpty {
            importAlert = ImportAlert(
                title: processed.importedCount > 0 ? "Import Resumed With Errors" : "Queued Import Failed",
                message: Self.importFailureMessage(processed.failures)
            )
        }
        await refreshFailedImportCount()
    }

    private struct ImportProcessingResult {
        var importedCount = 0
        var failures: [ImportQueueFailure] = []
    }

    private func processQueuedImports() async -> ImportProcessingResult {
        let jobs: [ImportQueueJob]
        do {
            jobs = try await importQueue.jobsReadyForProcessing()
        } catch {
            return ImportProcessingResult(failures: [
                ImportQueueFailure(filename: "Import Queue", message: error.localizedDescription)
            ])
        }

        var result = ImportProcessingResult()
        for job in jobs {
            if books.contains(where: { $0.id == job.id }) {
                do {
                    try await importQueue.complete(job.id)
                } catch {
                    result.failures.append(ImportQueueFailure(
                        filename: job.sourceFilename,
                        message: "The book was already imported, but its queue entry could not be cleared: \(error.localizedDescription)"
                    ))
                }
                continue
            }

            var importedBook: Book?
            do {
                try await importQueue.markProcessing(job.id)
                let source = try await importQueue.stagedURL(for: job)
                let existingHashes = Set(books.compactMap(\.asset?.contentHash))
                let existingIdentifiers = Set(books.flatMap(\.identifiers).map {
                    $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                })
                var book = try await importer.importBook(
                    from: source,
                    existingHashes: existingHashes,
                    existingIdentifiers: existingIdentifiers,
                    bookID: job.id
                )
                let migrated = LibrarySnapshot(books: [book], tags: tags, series: series)
                    .migratingOrganizationIdentity()
                book = migrated.books[0]
                importedBook = book

                var candidate = snapshot()
                candidate.books.insert(book, at: 0)
                candidate.tags = migrated.tags
                candidate.series = migrated.series
                try await repository.save(candidate)
                apply(candidate)
                result.importedCount += 1
            } catch {
                if let importedBook { try? await importer.removeAssets(for: [importedBook]) }
                let message = error.localizedDescription
                do {
                    try await importQueue.markFailed(job.id, message: message)
                    result.failures.append(ImportQueueFailure(filename: job.sourceFilename, message: message))
                } catch {
                    result.failures.append(ImportQueueFailure(
                        filename: job.sourceFilename,
                        message: "\(message) Glassleaf also could not save the retry state: \(error.localizedDescription)"
                    ))
                }
                continue
            }

            do {
                try await importQueue.complete(job.id)
            } catch {
                result.failures.append(ImportQueueFailure(
                    filename: job.sourceFilename,
                    message: "The book was imported, but its completed queue entry could not be cleared."
                ))
            }
        }
        return result
    }

    private func refreshFailedImportCount() async {
        failedImportCount = (try? await importQueue.failedJobs().count) ?? failedImportCount
    }

    private static func importFailureMessage(_ failures: [ImportQueueFailure]) -> String {
        Array(Set(failures))
            .sorted { lhs, rhs in lhs.filename.localizedStandardCompare(rhs.filename) == .orderedAscending }
            .map { "\($0.filename): \($0.message)" }
            .joined(separator: "\n")
    }

    func replaceCover(for bookID: UUID, data: Data, filename: String) async {
        do {
            let cover = try await importer.storeCover(data: data, filename: filename, for: bookID)
            updateBook(id: bookID) { $0.cover = cover }
        } catch {
            importAlert = ImportAlert(title: "Cover Couldn’t Be Updated", message: error.localizedDescription)
        }
    }

    func updateBook(id: UUID, mutation: (inout Book) -> Void) {
        guard let index = books.firstIndex(where: { $0.id == id }) else { return }
        mutation(&books[index])
        books[index].updatedAt = .now
        refreshPresentedBook(id: id)
        persistBook(books[index])
    }

    func moveBooks(_ ids: Set<UUID>, to folderID: UUID?) {
        updateBooks(ids: ids) { $0.folderID = folderID }
        selectedBookIDs.removeAll()
    }

    func createOrganizer(_ kind: OrganizerKind, name: String) {
        switch kind {
        case .folders: createFolder(name: name)
        case .collections: createCollection(name: name)
        case .tags: createTag(name: name)
        case .series: createSeries(name: name)
        }
    }

    func assignTag(named name: String, to ids: Set<UUID>) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return }
        guard let tagID = createTag(name: cleanName) else { return }
        assignTag(tagID, to: ids)
    }

    func assignTag(_ tagID: UUID, to ids: Set<UUID>) {
        guard tags.contains(where: { $0.id == tagID }) else { return }
        updateBooks(ids: ids) { $0.tagIDs.insert(tagID) }
    }

    func removeTag(_ tagID: UUID, from ids: Set<UUID>) {
        updateBooks(ids: ids) { $0.tagIDs.remove(tagID) }
    }

    func assignCollection(_ collectionID: UUID, to ids: Set<UUID>) {
        updateBooks(ids: ids) { $0.collectionIDs.insert(collectionID) }
    }

    func removeCollection(_ collectionID: UUID, from ids: Set<UUID>) {
        updateBooks(ids: ids) { $0.collectionIDs.remove(collectionID) }
    }

    func removeAllCollections(from ids: Set<UUID>) {
        updateBooks(ids: ids) { $0.collectionIDs.removeAll() }
    }

    func removeAllTags(from ids: Set<UUID>) {
        updateBooks(ids: ids) { $0.tagIDs.removeAll() }
    }

    func createFolder(name: String, parentID: UUID? = nil) {
        guard let cleanName = validatedName(name) else { return }
        folders.append(Folder(name: cleanName, parentID: parentID, sortOrder: folders.count))
        persistOrganization()
    }

    @discardableResult
    func createTag(name: String) -> UUID? {
        guard let cleanName = validatedName(name) else { return nil }
        if let existing = tags.first(where: { $0.normalizedName == Tag(name: cleanName).normalizedName }) {
            return existing.id
        }
        tags.append(Tag(name: cleanName, sortOrder: tags.count))
        persistOrganization()
        return tags.last?.id
    }

    func createCollection(name: String) {
        guard let cleanName = validatedName(name) else { return }
        collections.append(BookCollection(name: cleanName, sortOrder: collections.count))
        persistOrganization()
    }

    func createSmartCollection(name: String, rule: SmartCollectionRule) {
        guard let cleanName = validatedName(name) else { return }
        smartCollections.append(SmartCollection(name: cleanName, rule: rule, sortOrder: smartCollections.count))
        persistOrganization()
    }

    func updateSmartCollection(id: UUID, name: String, rule: SmartCollectionRule) {
        guard let cleanName = validatedName(name),
              let index = smartCollections.firstIndex(where: { $0.id == id }) else { return }
        smartCollections[index].name = cleanName
        smartCollections[index].rule = rule
        persistOrganization()
    }

    func renameSmartCollection(id: UUID, name: String) {
        guard let cleanName = validatedName(name), let index = smartCollections.firstIndex(where: { $0.id == id }) else { return }
        smartCollections[index].name = cleanName
        persistOrganization()
    }

    func deleteSmartCollection(id: UUID) {
        smartCollections.removeAll { $0.id == id }
        if selection == .smartCollection(id) { selection = .inbox }
        persistOrganization()
    }

    @discardableResult
    func createSeries(name: String) -> UUID? {
        guard let cleanName = validatedName(name) else { return nil }
        let normalized = Series(name: cleanName).normalizedName
        if let existing = series.first(where: { $0.normalizedName == normalized }) { return existing.id }
        series.append(Series(name: cleanName, sortOrder: series.count))
        persistOrganization()
        return series.last?.id
    }

    func assignSeries(_ seriesID: UUID?, to ids: Set<UUID>) {
        updateBooks(ids: ids) { book in
            book.seriesID = seriesID
            if seriesID == nil { book.seriesIndex = nil }
        }
    }

    func renameSeries(id: UUID, name: String) {
        guard let cleanName = validatedName(name),
              let index = series.firstIndex(where: { $0.id == id }) else { return }
        let normalized = Series(name: cleanName).normalizedName
        guard !series.contains(where: { $0.id != id && $0.normalizedName == normalized }) else { return }
        series[index].name = cleanName
        series[index].updatedAt = .now
        persistOrganization()
    }

    func updateSeries(id: UUID, name: String, coverBookID: UUID?, orderedBookIDs: [UUID]) {
        guard let cleanName = validatedName(name),
              let index = series.firstIndex(where: { $0.id == id }) else { return }
        series[index].name = cleanName
        series[index].coverBookID = coverBookID
        series[index].updatedAt = .now
        let memberIDs = Set(orderedBookIDs)
        let removedBookIDs = books.filter { $0.seriesID == id && !memberIDs.contains($0.id) }.map(\.id)
        for bookID in removedBookIDs {
            updateBook(id: bookID) { value in
                value.seriesID = nil
                value.seriesIndex = nil
            }
        }
        for (offset, bookID) in orderedBookIDs.enumerated() {
            updateBook(id: bookID) { book in
                book.seriesID = id
                book.seriesIndex = Decimal(offset + 1)
            }
        }
        persistOrganization()
    }

    func deleteSeries(id: UUID) {
        series.removeAll { $0.id == id }
        for index in books.indices where books[index].seriesID == id {
            books[index].seriesID = nil
            books[index].seriesIndex = nil
            books[index].updatedAt = .now
        }
        if selection == .series(id) { selection = .inbox }
        rebuildLookupCaches()
        Task { await persistSnapshot() }
    }

    func renameFolder(id: UUID, name: String) {
        guard let cleanName = validatedName(name), let index = folders.firstIndex(where: { $0.id == id }) else { return }
        folders[index].name = cleanName
        folders[index].updatedAt = .now
        persistOrganization()
    }

    func deleteFolder(id: UUID) {
        let childIDs = Set(folders.filter { $0.parentID == id }.map(\.id))
        for index in folders.indices where childIDs.contains(folders[index].id) { folders[index].parentID = nil }
        folders.removeAll { $0.id == id }
        for index in books.indices where books[index].folderID == id { books[index].folderID = nil }
        if selection == .folder(id) { selection = .inbox }
        persistOrganization()
        Task { await persistSnapshot() }
    }

    func renameTag(id: UUID, to newName: String) {
        guard let cleanName = validatedName(newName) else { return }
        guard let index = tags.firstIndex(where: { $0.id == id }) else { return }
        let normalized = Tag(name: cleanName).normalizedName
        guard !tags.contains(where: { $0.id != id && $0.normalizedName == normalized }) else { return }
        tags[index].name = cleanName
        persistOrganization()
    }

    func deleteTag(id: UUID) {
        tags.removeAll { $0.id == id }
        for index in books.indices { books[index].tagIDs.remove(id) }
        if selection == .tag(id) { selection = .inbox }
        rebuildLookupCaches()
        Task { await persistSnapshot() }
    }

    func renameCollection(id: UUID, name: String) {
        guard let cleanName = validatedName(name), let index = collections.firstIndex(where: { $0.id == id }) else { return }
        collections[index].name = cleanName
        persistOrganization()
    }

    func deleteCollection(id: UUID) {
        collections.removeAll { $0.id == id }
        for index in books.indices { books[index].collectionIDs.remove(id) }
        if selection == .collection(id) { selection = .inbox }
        rebuildLookupCaches()
        Task { await persistSnapshot() }
    }

    func trashBooks(_ ids: Set<UUID>) {
        updateBooks(ids: ids) { $0.deletedAt = .now }
        selectedBookIDs.removeAll()
    }

    func restoreBooks(_ ids: Set<UUID>) {
        updateBooks(ids: ids) { $0.deletedAt = nil }
        selectedBookIDs.removeAll()
    }

    func emptyTrash() {
        let discarded = books.filter { $0.deletedAt != nil }
        guard !discarded.isEmpty else { return }
        Task {
            do {
                try await importer.removeAssets(for: discarded)
                let discardedIDs = Set(discarded.map(\.id))
                books.removeAll { $0.deletedAt != nil }
                bookmarks.removeAll { discardedIDs.contains($0.bookID) }
                annotations.removeAll { discardedIDs.contains($0.bookID) }
                selectedBookIDs.removeAll()
                await persistSnapshot()
            } catch {
                importAlert = ImportAlert(title: "Trash Couldn’t Be Emptied", message: error.localizedDescription)
            }
        }
    }

    func toggleSelection(_ id: UUID) {
        if !selectedBookIDs.insert(id).inserted { selectedBookIDs.remove(id) }
    }

    func endSelecting() {
        isSelecting = false
        selectedBookIDs.removeAll()
    }

    func snapshot() -> LibrarySnapshot {
        LibrarySnapshot(
            books: books,
            folders: folders,
            tags: tags,
            collections: collections,
            series: series,
            smartCollections: smartCollections,
            bookmarks: bookmarks,
            annotations: annotations
        )
    }

    private func apply(_ snapshot: LibrarySnapshot) {
        let migrated = snapshot.migratingOrganizationIdentity()
        books = migrated.books
        folders = migrated.folders
        tags = migrated.tags
        collections = migrated.collections
        series = migrated.series
        smartCollections = migrated.smartCollections
        bookmarks = migrated.bookmarks
        annotations = migrated.annotations
        rebuildLookupCaches()
        scheduleSearch()
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty, !isPreview else {
            searchResultIDs = nil
            searchResultQuery = ""
            isSearching = false
            return
        }
        searchTask = Task { [weak self, repository] in
            try? await Task.sleep(for: .milliseconds(90))
            guard !Task.isCancelled else { return }
            self?.isSearching = true
            let ids = try? await repository.searchBookIDs(query, limit: 5_000)
            guard !Task.isCancelled, self?.searchText.trimmingCharacters(in: .whitespacesAndNewlines) == query else { return }
            self?.searchResultIDs = ids ?? []
            self?.searchResultQuery = query
            self?.isSearching = false
        }
    }

    private static func matchesSearch(_ book: Book, query: String, store: LibraryStore) -> Bool {
        book.title.localizedStandardContains(query)
            || book.author.localizedStandardContains(query)
            || store.seriesName(for: book)?.localizedStandardContains(query) == true
            || store.tagNames(for: book).contains(where: { $0.localizedStandardContains(query) })
            || book.folderID.flatMap { store.foldersByID[$0]?.name.localizedStandardContains(query) } == true
            || book.collectionIDs.contains { store.collectionNamesByID[$0]?.localizedStandardContains(query) == true }
    }

    private func searchContext(for book: Book) -> LocalLibraryRepository.SearchContext {
        .init(
            seriesName: seriesName(for: book) ?? "",
            tagNames: tagNames(for: book).joined(separator: " "),
            folderName: book.folderID.flatMap { foldersByID[$0]?.name } ?? "",
            collectionNames: book.collectionIDs.compactMap { collectionNamesByID[$0] }.joined(separator: " ")
        )
    }

    private func persistBook(_ book: Book) {
        guard !isPreview else { return }
        let context = searchContext(for: book)
        Task {
            do {
                try await repository.upsert(book, context: context)
                scheduleCloudSync()
            } catch {
                reportPersistenceFailure(error)
            }
        }
    }

    private func updateBooks(ids: Set<UUID>, mutation: (inout Book) -> Void) {
        guard !ids.isEmpty else { return }
        var updatedLibrary = books
        var changedBooks: [Book] = []
        changedBooks.reserveCapacity(ids.count)
        for index in updatedLibrary.indices where ids.contains(updatedLibrary[index].id) {
            mutation(&updatedLibrary[index])
            updatedLibrary[index].updatedAt = .now
            changedBooks.append(updatedLibrary[index])
        }
        guard !changedBooks.isEmpty else { return }
        books = updatedLibrary
        if let presentedID = presentedBook?.id, ids.contains(presentedID) {
            refreshPresentedBook(id: presentedID)
        }
        persistBooks(changedBooks)
    }

    private func persistBooks(_ changedBooks: [Book]) {
        guard !isPreview, !changedBooks.isEmpty else { return }
        let contexts = Dictionary(uniqueKeysWithValues: changedBooks.map { ($0.id, searchContext(for: $0)) })
        Task {
            do {
                try await repository.upsert(changedBooks, contexts: contexts)
                scheduleCloudSync()
            } catch {
                reportPersistenceFailure(error)
            }
        }
    }

    private func persistOrganization() {
        guard !isPreview else { return }
        rebuildLookupCaches()
        let value = snapshot()
        Task {
            do {
                try await repository.saveOrganization(value)
                scheduleCloudSync()
            } catch {
                reportPersistenceFailure(error)
            }
        }
    }

    private func persistReading(bookID: UUID) {
        guard !isPreview, let book = books.first(where: { $0.id == bookID }) else { return }
        let bookBookmarks = bookmarks.filter { $0.bookID == bookID }
        let bookAnnotations = annotations.filter { $0.bookID == bookID }
        let context = searchContext(for: book)
        Task {
            do {
                try await repository.saveReading(
                    book: book,
                    bookmarks: bookBookmarks,
                    annotations: bookAnnotations,
                    context: context
                )
                scheduleCloudSync()
            } catch {
                reportPersistenceFailure(error)
            }
        }
    }

    private func persistSnapshot() async {
        guard !isPreview else { return }
        do {
            try await repository.save(snapshot())
            scheduleCloudSync()
        } catch {
            reportPersistenceFailure(error)
        }
    }

    private func scheduleCloudSync() {
        guard isICloudSyncEnabled else { return }
        cloudSyncTask?.cancel()
        cloudSyncTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            await self?.synchronizeWithICloud(reportFailure: false)
        }
    }

    private func cloudSyncService() -> LibraryCloudSyncService {
        if let cloudSync { return cloudSync }
        let service = LibraryCloudSyncService(
            repository: repository,
            libraryID: CloudSyncIdentityStore.libraryID,
            deviceID: CloudSyncIdentityStore.deviceID
        )
        cloudSync = service
        return service
    }

    private func applyCloudSyncResult(_ result: CloudSyncResult) {
        apply(result.snapshot)
        readerPreferences = result.readerPreferences
        ReaderPreferenceStore.save(result.readerPreferences)
        cloudSyncState = .synced(result.syncedAt)
    }

    private func reportPersistenceFailure(_ error: Error) {
        importAlert = ImportAlert(
            title: "Library Changes Couldn’t Be Saved",
            message: "Your changes are still visible in this session, but they may not survive reopening Glassleaf. \(error.localizedDescription)"
        )
    }

    private func refreshPresentedBook(id: UUID) {
        guard presentedBook?.id == id else { return }
        presentedBook = books.first(where: { $0.id == id })
    }

    private func validatedName(_ value: String) -> String? {
        let cleanName = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleanName.isEmpty ? nil : cleanName
    }

    private func rebuildLookupCaches() {
        foldersByID = Dictionary(uniqueKeysWithValues: folders.map { ($0.id, $0) })
        tagNamesByID = Dictionary(uniqueKeysWithValues: tags.map { ($0.id, $0.name) })
        collectionNamesByID = Dictionary(uniqueKeysWithValues: collections.map { ($0.id, $0.name) })
        seriesNamesByID = Dictionary(uniqueKeysWithValues: series.map { ($0.id, $0.name) })
    }
}

private extension ReadingState {
    var libraryFilter: LibraryFilter {
        switch self {
        case .unread: .unread
        case .reading: .reading
        case .finished: .finished
        }
    }
}

private enum ReaderPreferenceStore {
    private static let key = "reader-preferences-v3"
    private static let previousKey = "reader-preferences-v2"
    private static let legacyKey = "reader-preferences-v1"

    static func load() -> ReaderPreferences {
        if let data = UserDefaults.standard.data(forKey: key),
           let value = try? JSONDecoder().decode(ReaderPreferences.self, from: data) {
            return value
        }

        if let data = UserDefaults.standard.data(forKey: previousKey),
           var previousValue = try? JSONDecoder().decode(ReaderPreferences.self, from: data) {
            // Pagination was the early-development default. Move existing
            // installs to the new continuous-reading default once; choosing
            // pagination again is then persisted under the v3 key.
            if previousValue.mode == .paginated { previousValue.mode = .scrolling }
            save(previousValue)
            return previousValue
        }

        guard let data = UserDefaults.standard.data(forKey: legacyKey),
              var legacyValue = try? JSONDecoder().decode(ReaderPreferences.self, from: data) else {
            return ReaderPreferences()
        }

        // Paper used to be the implicit default, so existing installs should
        // gain system-aware behavior without having to find the new setting.
        if legacyValue.theme == .paper { legacyValue.theme = .automatic }
        save(legacyValue)
        return legacyValue
    }

    static func save(_ preferences: ReaderPreferences) {
        guard let data = try? JSONEncoder().encode(preferences) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}

extension SidebarDestination {
    @MainActor
    func includes(_ book: Book, store: LibraryStore) -> Bool {
        switch self {
        case .home: book.deletedAt == nil
        case .library(let filter): book.deletedAt == nil && filter.includes(book)
        case .inbox: book.deletedAt == nil && book.isInInbox
        case .organizer(.folders): book.deletedAt == nil && book.folderID != nil
        case .organizer(.collections): book.deletedAt == nil && !book.collectionIDs.isEmpty
        case .organizer(.tags): book.deletedAt == nil && !book.tagIDs.isEmpty
        case .organizer(.series): book.deletedAt == nil && book.seriesID != nil
        case .folder(let id): book.deletedAt == nil && book.folderID == id
        case .tag(let id): book.deletedAt == nil && book.tagIDs.contains(id)
        case .collection(let id): book.deletedAt == nil && book.collectionIDs.contains(id)
        case .series(let id): book.deletedAt == nil && book.seriesID == id
        case .smartCollection(let id):
            book.deletedAt == nil && store.smartCollections.first(where: { $0.id == id })?.rule.includes(
                book,
                tags: store.tags,
                series: store.series
            ) == true
        case .trash: book.deletedAt != nil
        }
    }

    @MainActor
    func title(in store: LibraryStore) -> String {
        switch self {
        case .home: "Home"
        case .library(let filter): filter.title
        case .inbox: "Inbox"
        case .organizer(let kind): kind.title
        case .folder(let id): store.folders.first(where: { $0.id == id })?.name ?? "Folder"
        case .tag(let id): store.tags.first(where: { $0.id == id })?.name ?? "Tag"
        case .collection(let id): store.collections.first(where: { $0.id == id })?.name ?? "Collection"
        case .series(let id): store.series.first(where: { $0.id == id })?.name ?? "Series"
        case .smartCollection(let id): store.smartCollections.first(where: { $0.id == id })?.name ?? "Smart Collection"
        case .trash: "Trash"
        }
    }
}

extension LibraryFilter {
    var title: String {
        switch self {
        case .all: "Library"
        case .unread: "Unread"
        case .reading: "Reading"
        case .finished: "Finished"
        case .favorites: "Favorites"
        }
    }
}
