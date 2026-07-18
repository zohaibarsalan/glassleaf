import Foundation
import GlassleafDomain
import Observation

enum SidebarDestination: Hashable, Sendable {
    case home
    case library(LibraryFilter)
    case inbox
    case folder(UUID)
    case tag(String)
    case collection(UUID)
    case series(String)
    case smartCollection(UUID)
    case trash
}

enum LibraryLayout: String, CaseIterable, Identifiable, Sendable {
    case grid
    case list
    var id: Self { self }
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
    private(set) var isSearching = false

    private let isPreview: Bool
    private let repository: LocalLibraryRepository
    private let importer: LocalBookImporter
    private var searchResultIDs: [UUID]?
    private var searchTask: Task<Void, Never>?

    init(
        books: [Book] = [],
        folders: [Folder] = [],
        tags: [Tag] = [],
        collections: [BookCollection] = [],
        series: [Series] = [],
        smartCollections: [SmartCollection] = [],
        bookmarks: [Bookmark] = [],
        annotations: [Annotation] = [],
        isPreview: Bool = false,
        repository: LocalLibraryRepository = LocalLibraryRepository(),
        importer: LocalBookImporter = LocalBookImporter()
    ) {
        self.books = books
        self.folders = folders
        self.tags = tags
        self.collections = collections
        self.series = series
        self.smartCollections = smartCollections
        self.bookmarks = bookmarks
        self.annotations = annotations
        self.isPreview = isPreview
        self.repository = repository
        self.importer = importer
    }

    func books(matching destination: SidebarDestination) -> [Book] {
        var candidates = books.filter { destination.includes($0, store: self) }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !query.isEmpty {
            if isPreview {
                candidates = candidates.filter { Self.matchesSearch($0, query: query, store: self) }
            } else if let searchResultIDs {
                let rank = Dictionary(uniqueKeysWithValues: searchResultIDs.enumerated().map { ($0.element, $0.offset) })
                candidates = candidates.filter { rank[$0.id] != nil }
                if sort == .recentlyAdded {
                    return candidates.sorted { rank[$0.id, default: .max] < rank[$1.id, default: .max] }
                }
            } else {
                return []
            }
        }
        return candidates.sorted(by: sort.areInIncreasingOrder)
    }

    func count(for destination: SidebarDestination) -> Int {
        books.lazy.filter { destination.includes($0, store: self) }.count
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

    func closeReader(at fraction: Double) {
        guard let id = readerBook?.id else { return }
        updateBook(id: id) { book in
            book.progress = ReadingProgress(
                locator: "prototype:\(fraction)",
                fraction: fraction,
                deviceID: "local",
                isCompleted: fraction >= 0.995
            )
            book.lastOpened = .now
        }
        readerBook = nil
    }

    func loadLibrary() async {
        guard !isPreview else { return }
        do {
            apply(try await repository.load())
        } catch {
            importAlert = ImportAlert(
                title: "Library Couldn’t Be Loaded",
                message: "Your stored books were left unchanged. Try reopening Glassleaf."
            )
        }
    }

    func requestImport() {
        showsImporter = true
    }

    func importBooks(from urls: [URL]) async {
        guard !urls.isEmpty else { return }
        isImporting = true
        defer { isImporting = false }

        var existingHashes = Set(books.compactMap(\.asset?.contentHash))
        var importedCount = 0
        var failures: [String] = []
        for url in urls {
            do {
                let book = try await importer.importBook(from: url, existingHashes: existingHashes)
                books.insert(book, at: 0)
                if let hash = book.asset?.contentHash { existingHashes.insert(hash) }
                importedCount += 1
            } catch {
                failures.append(error.localizedDescription)
            }
        }
        if importedCount > 0 {
            selection = .inbox
            await persistSnapshot()
            scheduleSearch()
        }
        if !failures.isEmpty {
            importAlert = ImportAlert(
                title: importedCount > 0 ? "Some Books Weren’t Imported" : "Import Failed",
                message: Array(Set(failures)).sorted().joined(separator: "\n")
            )
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
        for id in ids { updateBook(id: id) { $0.folderID = folderID } }
        selectedBookIDs.removeAll()
    }

    func assignTag(_ name: String, to ids: Set<UUID>) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return }
        if !tags.contains(where: { $0.normalizedName == Tag(name: cleanName).normalizedName }) {
            tags.append(Tag(name: cleanName))
            persistOrganization()
        }
        for id in ids { updateBook(id: id) { $0.tags.insert(cleanName) } }
    }

    func removeTag(_ name: String, from ids: Set<UUID>) {
        for id in ids {
            updateBook(id: id) { book in
                book.tags = Set(book.tags.filter { $0.localizedCaseInsensitiveCompare(name) != .orderedSame })
            }
        }
    }

    func assignCollection(_ collectionID: UUID, to ids: Set<UUID>) {
        for id in ids { updateBook(id: id) { $0.collectionIDs.insert(collectionID) } }
    }

    func createFolder(name: String, parentID: UUID? = nil) {
        guard let cleanName = validatedName(name) else { return }
        folders.append(Folder(name: cleanName, parentID: parentID, sortOrder: folders.count))
        persistOrganization()
    }

    func createTag(name: String) {
        guard let cleanName = validatedName(name) else { return }
        guard !tags.contains(where: { $0.normalizedName == Tag(name: cleanName).normalizedName }) else { return }
        tags.append(Tag(name: cleanName, sortOrder: tags.count))
        persistOrganization()
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

    func renameTag(_ oldName: String, to newName: String) {
        guard let cleanName = validatedName(newName) else { return }
        if let index = tags.firstIndex(where: { $0.name.localizedCaseInsensitiveCompare(oldName) == .orderedSame }) {
            tags[index].name = cleanName
        }
        for index in books.indices where books[index].tags.contains(where: { $0.localizedCaseInsensitiveCompare(oldName) == .orderedSame }) {
            books[index].tags = Set(books[index].tags.filter { $0.localizedCaseInsensitiveCompare(oldName) != .orderedSame })
            books[index].tags.insert(cleanName)
        }
        if selection == .tag(oldName) { selection = .tag(cleanName) }
        Task { await persistSnapshot() }
    }

    func deleteTag(_ name: String) {
        tags.removeAll { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }
        for index in books.indices {
            books[index].tags = Set(books[index].tags.filter { $0.localizedCaseInsensitiveCompare(name) != .orderedSame })
        }
        if selection == .tag(name) { selection = .inbox }
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
        Task { await persistSnapshot() }
    }

    func trashBooks(_ ids: Set<UUID>) {
        for id in ids { updateBook(id: id) { $0.deletedAt = .now } }
        selectedBookIDs.removeAll()
    }

    func restoreBooks(_ ids: Set<UUID>) {
        for id in ids { updateBook(id: id) { $0.deletedAt = nil } }
        selectedBookIDs.removeAll()
    }

    func emptyTrash() {
        books.removeAll { $0.deletedAt != nil }
        selectedBookIDs.removeAll()
        Task { await persistSnapshot() }
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
        books = snapshot.books
        folders = snapshot.folders
        tags = snapshot.tags
        collections = snapshot.collections
        series = snapshot.series
        smartCollections = snapshot.smartCollections
        bookmarks = snapshot.bookmarks
        annotations = snapshot.annotations
        scheduleSearch()
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty, !isPreview else {
            searchResultIDs = nil
            isSearching = false
            return
        }
        searchResultIDs = nil
        isSearching = true
        searchTask = Task { [weak self, repository] in
            await Task.yield()
            guard !Task.isCancelled else { return }
            let ids = try? await repository.searchBookIDs(query, limit: 5_000)
            guard !Task.isCancelled, self?.searchText.trimmingCharacters(in: .whitespacesAndNewlines) == query else { return }
            self?.searchResultIDs = ids ?? []
            self?.isSearching = false
        }
    }

    private static func matchesSearch(_ book: Book, query: String, store: LibraryStore) -> Bool {
        book.title.localizedStandardContains(query)
            || book.author.localizedStandardContains(query)
            || book.series?.localizedStandardContains(query) == true
            || book.tags.contains(where: { $0.localizedStandardContains(query) })
            || book.folderID.flatMap { id in store.folders.first(where: { $0.id == id })?.name.localizedStandardContains(query) } == true
            || book.collectionIDs.contains { id in store.collections.first(where: { $0.id == id })?.name.localizedStandardContains(query) == true }
    }

    private func searchContext(for book: Book) -> LocalLibraryRepository.SearchContext {
        .init(
            folderName: book.folderID.flatMap { id in folders.first(where: { $0.id == id })?.name } ?? "",
            collectionNames: book.collectionIDs.compactMap { id in collections.first(where: { $0.id == id })?.name }.joined(separator: " ")
        )
    }

    private func persistBook(_ book: Book) {
        guard !isPreview else { return }
        let context = searchContext(for: book)
        Task { try? await repository.upsert(book, context: context) }
    }

    private func persistOrganization() {
        guard !isPreview else { return }
        let value = snapshot()
        Task { try? await repository.saveOrganization(value) }
    }

    private func persistSnapshot() async {
        guard !isPreview else { return }
        try? await repository.save(snapshot())
    }

    private func refreshPresentedBook(id: UUID) {
        guard presentedBook?.id == id else { return }
        presentedBook = books.first(where: { $0.id == id })
    }

    private func validatedName(_ value: String) -> String? {
        let cleanName = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleanName.isEmpty ? nil : cleanName
    }
}

extension SidebarDestination {
    @MainActor
    func includes(_ book: Book, store: LibraryStore) -> Bool {
        switch self {
        case .home: book.deletedAt == nil
        case .library(let filter): book.deletedAt == nil && filter.includes(book)
        case .inbox: book.deletedAt == nil && book.isInInbox
        case .folder(let id): book.deletedAt == nil && book.folderID == id
        case .tag(let name): book.deletedAt == nil && book.tags.contains { $0.localizedCaseInsensitiveCompare(name) == .orderedSame }
        case .collection(let id): book.deletedAt == nil && book.collectionIDs.contains(id)
        case .series(let name): book.deletedAt == nil && book.series?.localizedCaseInsensitiveCompare(name) == .orderedSame
        case .smartCollection(let id):
            book.deletedAt == nil && store.smartCollections.first(where: { $0.id == id })?.rule.includes(book) == true
        case .trash: book.deletedAt != nil
        }
    }

    @MainActor
    func title(in store: LibraryStore) -> String {
        switch self {
        case .home: "Home"
        case .library(let filter): filter.title
        case .inbox: "Inbox"
        case .folder(let id): store.folders.first(where: { $0.id == id })?.name ?? "Folder"
        case .tag(let name): name
        case .collection(let id): store.collections.first(where: { $0.id == id })?.name ?? "Collection"
        case .series(let name): name
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
