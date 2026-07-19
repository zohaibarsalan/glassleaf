import Foundation
import GlassleafDomain
import SQLite3

actor LocalLibraryRepository: SyncJournalStore {
    enum RepositoryError: LocalizedError {
        case open(String)
        case sqlite(String)

        var errorDescription: String? {
            switch self {
            case .open(let message): "The local library database couldn’t be opened: \(message)"
            case .sqlite(let message): "The local library database reported an error: \(message)"
            }
        }
    }

    private struct LegacyCatalog: Codable {
        let schemaVersion: Int
        let books: [Book]
    }

    private let fileManager: FileManager
    private let rootOverride: URL?
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var connection: SQLiteConnection?

    init(fileManager: FileManager = .default, rootURL: URL? = nil) {
        self.fileManager = fileManager
        self.rootOverride = rootURL
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .deferredToDate
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .deferredToDate
    }

    func load() throws -> LibrarySnapshot {
        try withDatabase { database in
            try migrateLegacyCatalogIfNeeded(database)
            let stored = LibrarySnapshot(
                books: try decodeRows(Book.self, table: "books", database: database),
                folders: try decodeRows(Folder.self, table: "folders", database: database),
                tags: try decodeRows(Tag.self, table: "tags", database: database),
                collections: try decodeRows(BookCollection.self, table: "collections", database: database),
                series: try decodeRows(Series.self, table: "series", database: database),
                smartCollections: try decodeRows(SmartCollection.self, table: "smart_collections", database: database),
                bookmarks: try decodeRows(Bookmark.self, table: "bookmarks", database: database),
                annotations: try decodeRows(Annotation.self, table: "annotations", database: database)
            )
            let migrated = stored.migratingOrganizationIdentity()
            if migrated != stored {
                try transaction(database) {
                    try replace(migrated.books, table: "books", database: database)
                    try replace(migrated.tags, table: "tags", database: database)
                    try replace(migrated.series, table: "series", database: database)
                    try replace(migrated.smartCollections, table: "smart_collections", database: database)
                    try rebuildSearchIndex(snapshot: migrated, database: database)
                }
            }
            return migrated
        }
    }

    func save(_ snapshot: LibrarySnapshot) throws {
        try withDatabase { database in
            try transaction(database) {
                try replace(snapshot.books, table: "books", database: database)
                try replace(snapshot.folders, table: "folders", database: database)
                try replace(snapshot.tags, table: "tags", database: database)
                try replace(snapshot.collections, table: "collections", database: database)
                try replace(snapshot.series, table: "series", database: database)
                try replace(snapshot.smartCollections, table: "smart_collections", database: database)
                try replace(snapshot.bookmarks, table: "bookmarks", database: database)
                try replace(snapshot.annotations, table: "annotations", database: database)
                try rebuildSearchIndex(snapshot: snapshot, database: database)
            }
        }
    }

    func upsert(_ book: Book, context: SearchContext) throws {
        try withDatabase { database in
            try transaction(database) {
                try upsertRecord(book, table: "books", database: database)
                try execute(database, sql: "DELETE FROM book_search WHERE book_id = ?", values: [.text(book.id.uuidString)])
                guard book.deletedAt == nil else { return }
                try insertSearchRecord(book, context: context, database: database)
            }
        }
    }

    func upsert(_ books: [Book], contexts: [UUID: SearchContext]) throws {
        guard !books.isEmpty else { return }
        try withDatabase { database in
            try transaction(database) {
                for book in books {
                    try upsertRecord(book, table: "books", database: database)
                    try execute(database, sql: "DELETE FROM book_search WHERE book_id = ?", values: [.text(book.id.uuidString)])
                    guard book.deletedAt == nil else { continue }
                    try insertSearchRecord(book, context: contexts[book.id] ?? SearchContext(), database: database)
                }
            }
        }
    }

    func saveOrganization(_ snapshot: LibrarySnapshot) throws {
        try withDatabase { database in
            try transaction(database) {
                try replace(snapshot.folders, table: "folders", database: database)
                try replace(snapshot.tags, table: "tags", database: database)
                try replace(snapshot.collections, table: "collections", database: database)
                try replace(snapshot.series, table: "series", database: database)
                try replace(snapshot.smartCollections, table: "smart_collections", database: database)
                try rebuildSearchIndex(snapshot: snapshot, database: database)
            }
        }
    }

    func saveReading(book: Book, bookmarks: [Bookmark], annotations: [Annotation], context: SearchContext) throws {
        try withDatabase { database in
            try transaction(database) {
                try upsertRecord(book, table: "books", database: database)
                try replace(bookmarks, table: "bookmarks", whereColumn: "book_id", value: book.id.uuidString, database: database)
                try replace(annotations, table: "annotations", whereColumn: "book_id", value: book.id.uuidString, database: database)
                try execute(database, sql: "DELETE FROM book_search WHERE book_id = ?", values: [.text(book.id.uuidString)])
                try insertSearchRecord(book, context: context, database: database)
            }
        }
    }

    func searchBookIDs(_ query: String, limit: Int = 1_000) throws -> [UUID] {
        let match = Self.ftsQuery(from: query)
        guard !match.isEmpty else { return [] }

        return try withDatabase { database in
            var statement: OpaquePointer?
            defer { sqlite3_finalize(statement) }
            try prepare(database, sql: "SELECT book_id FROM book_search WHERE book_search MATCH ? ORDER BY rank LIMIT ?", statement: &statement)
            bind(.text(match), at: 1, to: statement)
            bind(.integer(Int64(limit)), at: 2, to: statement)

            var ids: [UUID] = []
            while sqlite3_step(statement) == SQLITE_ROW {
                guard let value = sqlite3_column_text(statement, 0),
                      let id = UUID(uuidString: String(cString: value)) else { continue }
                ids.append(id)
            }
            try checkStatement(database, statement: statement)
            return ids
        }
    }

    func loadSyncJournal() async throws -> SyncJournal {
        try withDatabase { database in
            var statement: OpaquePointer?
            defer { sqlite3_finalize(statement) }
            try prepare(database, sql: "SELECT data FROM sync_journal WHERE id = 1", statement: &statement)
            let step = sqlite3_step(statement)
            if step == SQLITE_DONE { return SyncJournal() }
            guard step == SQLITE_ROW, let bytes = sqlite3_column_blob(statement, 0) else {
                try checkStatement(database, statement: statement)
                return SyncJournal()
            }
            let data = Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, 0)))
            return try decoder.decode(SyncJournal.self, from: data)
        }
    }

    func saveSyncJournal(_ journal: SyncJournal) async throws {
        try withDatabase { database in
            let data = try encoder.encode(journal)
            try execute(
                database,
                sql: "INSERT OR REPLACE INTO sync_journal(id, data) VALUES (1, ?)",
                values: [.blob(data)]
            )
        }
    }

    func exportSnapshot(to destination: URL) throws {
        let snapshot = try load()
        let data = try encoder.encode(snapshot)
        try data.write(to: destination, options: [.atomic, .completeFileProtection])
    }

    struct RestoreResult: Sendable {
        let snapshot: LibrarySnapshot
        let backupURL: URL?
    }

    func libraryRootURL() throws -> URL {
        try libraryRoot()
    }

    func close() throws {
        connection = nil
    }

    func installPreparedLibrary(at stagedRoot: URL) throws -> RestoreResult {
        let root = try libraryRoot().standardizedFileURL
        let staged = stagedRoot.standardizedFileURL
        let parent = root.deletingLastPathComponent()
        guard staged.deletingLastPathComponent() == parent, staged != root else {
            throw RepositoryError.open("The prepared restore is not on the local library volume.")
        }

        connection = nil
        let backups = parent.appending(path: "Glassleaf Backups", directoryHint: .isDirectory)
        try fileManager.createDirectory(at: backups, withIntermediateDirectories: true)
        let backup = backups.appending(
            path: "Library-\(Self.backupTimestamp())-\(UUID().uuidString)",
            directoryHint: .isDirectory
        )
        var movedExistingLibrary = false

        do {
            if fileManager.fileExists(atPath: root.path) {
                try fileManager.moveItem(at: root, to: backup)
                movedExistingLibrary = true
            }
            try fileManager.moveItem(at: staged, to: root)
            let restored = try load()
            return RestoreResult(snapshot: restored, backupURL: movedExistingLibrary ? backup : nil)
        } catch {
            connection = nil
            if fileManager.fileExists(atPath: root.path) {
                try? fileManager.removeItem(at: root)
            }
            if movedExistingLibrary, fileManager.fileExists(atPath: backup.path) {
                try? fileManager.moveItem(at: backup, to: root)
            }
            throw error
        }
    }

    struct SearchContext: Sendable {
        var seriesName: String = ""
        var tagNames: String = ""
        var folderName: String = ""
        var collectionNames: String = ""
    }

    private enum SQLiteValue {
        case text(String)
        case blob(Data)
        case integer(Int64)
    }

    private func withDatabase<T>(_ operation: (OpaquePointer) throws -> T) throws -> T {
        let database = try databaseConnection()
        return try operation(database)
    }

    private func databaseConnection() throws -> OpaquePointer {
        if let database = connection?.pointer { return database }

        let url = try databaseURL()
        var openedDatabase: OpaquePointer?
        let flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(url.path, &openedDatabase, flags, nil) == SQLITE_OK, let openedDatabase else {
            let message = openedDatabase.map { String(cString: sqlite3_errmsg($0)) } ?? "Unknown error"
            if let openedDatabase { sqlite3_close(openedDatabase) }
            throw RepositoryError.open(message)
        }

        do {
            sqlite3_busy_timeout(openedDatabase, 5_000)
            try execute(openedDatabase, sql: "PRAGMA foreign_keys = ON")
            try execute(openedDatabase, sql: "PRAGMA journal_mode = WAL")
            try createSchema(openedDatabase)
            connection = SQLiteConnection(openedDatabase)
            return openedDatabase
        } catch {
            sqlite3_close(openedDatabase)
            throw error
        }
    }

    private func createSchema(_ database: OpaquePointer) throws {
        try transaction(database) {
            try execute(database, sql: """
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, data BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, data BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, data BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, data BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS series (id TEXT PRIMARY KEY, data BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS smart_collections (id TEXT PRIMARY KEY, data BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, data BLOB NOT NULL);
                CREATE INDEX IF NOT EXISTS bookmarks_book_id ON bookmarks(book_id);
                CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, data BLOB NOT NULL);
                CREATE INDEX IF NOT EXISTS annotations_book_id ON annotations(book_id);
                CREATE TABLE IF NOT EXISTS sync_journal (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    data BLOB NOT NULL
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS book_search USING fts5(
                    book_id UNINDEXED,
                    title,
                    author,
                    series,
                    tags,
                    folder,
                    collections,
                    tokenize = 'unicode61 remove_diacritics 2',
                    prefix = '2 3 4'
                );
                INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', '3');
                """)
        }
    }

    private func migrateLegacyCatalogIfNeeded(_ database: OpaquePointer) throws {
        guard try rowCount(table: "books", database: database) == 0 else { return }
        let legacyURL = try libraryRoot().appending(path: "catalog.json")
        guard fileManager.fileExists(atPath: legacyURL.path) else { return }

        let catalog = try decoder.decode(LegacyCatalog.self, from: Data(contentsOf: legacyURL))
        let snapshot = LibrarySnapshot(books: catalog.books)
        try transaction(database) {
            try replace(snapshot.books, table: "books", database: database)
            try rebuildSearchIndex(snapshot: snapshot, database: database)
        }
        let archiveURL = try libraryRoot().appending(path: "catalog-v1.migrated.json")
        if !fileManager.fileExists(atPath: archiveURL.path) {
            try fileManager.moveItem(at: legacyURL, to: archiveURL)
        }
    }

    private func rebuildSearchIndex(snapshot: LibrarySnapshot, database: OpaquePointer) throws {
        try execute(database, sql: "DELETE FROM book_search")
        let folders = Dictionary(uniqueKeysWithValues: snapshot.folders.map { ($0.id, $0.name) })
        let collections = Dictionary(uniqueKeysWithValues: snapshot.collections.map { ($0.id, $0.name) })
        let tags = Dictionary(uniqueKeysWithValues: snapshot.tags.map { ($0.id, $0.name) })
        let series = Dictionary(uniqueKeysWithValues: snapshot.series.map { ($0.id, $0.name) })
        for book in snapshot.books where book.deletedAt == nil {
            let context = SearchContext(
                seriesName: book.seriesID.flatMap { series[$0] } ?? "",
                tagNames: book.tagIDs.compactMap { tags[$0] }.joined(separator: " "),
                folderName: book.folderID.flatMap { folders[$0] } ?? "",
                collectionNames: book.collectionIDs.compactMap { collections[$0] }.joined(separator: " ")
            )
            try insertSearchRecord(book, context: context, database: database)
        }
    }

    private func insertSearchRecord(_ book: Book, context: SearchContext, database: OpaquePointer) throws {
        try execute(
            database,
            sql: "INSERT INTO book_search(book_id, title, author, series, tags, folder, collections) VALUES (?, ?, ?, ?, ?, ?, ?)",
            values: [
                .text(book.id.uuidString), .text(book.title), .text(book.author), .text(context.seriesName),
                .text(context.tagNames), .text(context.folderName), .text(context.collectionNames),
            ]
        )
    }

    private func decodeRows<T: Decodable>(_ type: T.Type, table: String, database: OpaquePointer) throws -> [T] {
        var statement: OpaquePointer?
        defer { sqlite3_finalize(statement) }
        try prepare(database, sql: "SELECT data FROM \(table)", statement: &statement)
        var values: [T] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let bytes = sqlite3_column_blob(statement, 0) else { continue }
            let data = Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, 0)))
            values.append(try decoder.decode(T.self, from: data))
        }
        try checkStatement(database, statement: statement)
        return values
    }

    private func replace<T: Identifiable & Encodable>(
        _ records: [T],
        table: String,
        whereColumn: String? = nil,
        value: String? = nil,
        database: OpaquePointer
    ) throws where T.ID == UUID {
        if let whereColumn, let value {
            try execute(database, sql: "DELETE FROM \(table) WHERE \(whereColumn) = ?", values: [.text(value)])
        } else {
            try execute(database, sql: "DELETE FROM \(table)")
        }
        for record in records {
            try upsertRecord(record, table: table, database: database)
        }
    }

    private func upsertRecord<T: Identifiable & Encodable>(_ record: T, table: String, database: OpaquePointer) throws where T.ID == UUID {
        let data = try encoder.encode(record)
        if let bookScoped = record as? Bookmark {
            try execute(database, sql: "INSERT OR REPLACE INTO \(table)(id, book_id, data) VALUES (?, ?, ?)", values: [.text(record.id.uuidString), .text(bookScoped.bookID.uuidString), .blob(data)])
        } else if let bookScoped = record as? Annotation {
            try execute(database, sql: "INSERT OR REPLACE INTO \(table)(id, book_id, data) VALUES (?, ?, ?)", values: [.text(record.id.uuidString), .text(bookScoped.bookID.uuidString), .blob(data)])
        } else {
            try execute(database, sql: "INSERT OR REPLACE INTO \(table)(id, data) VALUES (?, ?)", values: [.text(record.id.uuidString), .blob(data)])
        }
    }

    private func rowCount(table: String, database: OpaquePointer) throws -> Int {
        var statement: OpaquePointer?
        defer { sqlite3_finalize(statement) }
        try prepare(database, sql: "SELECT COUNT(*) FROM \(table)", statement: &statement)
        guard sqlite3_step(statement) == SQLITE_ROW else {
            try checkStatement(database, statement: statement)
            return 0
        }
        return Int(sqlite3_column_int64(statement, 0))
    }

    private func transaction(_ database: OpaquePointer, operation: () throws -> Void) throws {
        try execute(database, sql: "BEGIN IMMEDIATE")
        do {
            try operation()
            try execute(database, sql: "COMMIT")
        } catch {
            try? execute(database, sql: "ROLLBACK")
            throw error
        }
    }

    private func execute(_ database: OpaquePointer, sql: String, values: [SQLiteValue] = []) throws {
        if values.isEmpty {
            var errorMessage: UnsafeMutablePointer<CChar>?
            guard sqlite3_exec(database, sql, nil, nil, &errorMessage) == SQLITE_OK else {
                let message = errorMessage.map { String(cString: $0) } ?? String(cString: sqlite3_errmsg(database))
                sqlite3_free(errorMessage)
                throw RepositoryError.sqlite(message)
            }
            return
        }
        var statement: OpaquePointer?
        defer { sqlite3_finalize(statement) }
        try prepare(database, sql: sql, statement: &statement)
        for (offset, value) in values.enumerated() {
            bind(value, at: Int32(offset + 1), to: statement)
        }
        while sqlite3_step(statement) == SQLITE_ROW {}
        try checkStatement(database, statement: statement)
    }

    private func prepare(_ database: OpaquePointer, sql: String, statement: inout OpaquePointer?) throws {
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
            throw RepositoryError.sqlite(String(cString: sqlite3_errmsg(database)))
        }
    }

    private func bind(_ value: SQLiteValue, at index: Int32, to statement: OpaquePointer?) {
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        switch value {
        case .text(let string): sqlite3_bind_text(statement, index, string, -1, transient)
        case .blob(let data):
            _ = data.withUnsafeBytes { bytes in
                sqlite3_bind_blob(statement, index, bytes.baseAddress, Int32(bytes.count), transient)
            }
        case .integer(let integer): sqlite3_bind_int64(statement, index, integer)
        }
    }

    private func checkStatement(_ database: OpaquePointer, statement: OpaquePointer?) throws {
        let code = sqlite3_errcode(database)
        guard code == SQLITE_OK || code == SQLITE_DONE || code == SQLITE_ROW else {
            throw RepositoryError.sqlite(String(cString: sqlite3_errmsg(database)))
        }
    }

    private static func ftsQuery(from query: String) -> String {
        query.split(whereSeparator: \Character.isWhitespace)
            .map { token in
                let escaped = token.replacingOccurrences(of: "\"", with: "\"\"")
                return "\"\(escaped)\"*"
            }
            .joined(separator: " AND ")
    }

    private static func backupTimestamp() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter.string(from: .now)
    }

    private func databaseURL() throws -> URL {
        try libraryRoot().appending(path: "library.sqlite3", directoryHint: .notDirectory)
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
        ).appending(path: "Glassleaf", directoryHint: .isDirectory)
        try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
}

private final class SQLiteConnection: @unchecked Sendable {
    let pointer: OpaquePointer

    init(_ pointer: OpaquePointer) {
        self.pointer = pointer
    }

    deinit {
        sqlite3_close(pointer)
    }
}
