import Foundation

struct ImportQueueJob: Identifiable, Codable, Hashable, Sendable {
    enum State: String, Codable, Sendable {
        case queued
        case processing
        case failed
    }

    let id: UUID
    let sourceFilename: String
    let stagedRelativePath: String
    var state: State
    var failureMessage: String?
    let createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        sourceFilename: String,
        stagedRelativePath: String,
        state: State = .queued,
        failureMessage: String? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.sourceFilename = sourceFilename
        self.stagedRelativePath = stagedRelativePath
        self.state = state
        self.failureMessage = failureMessage
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

struct ImportQueueFailure: Hashable, Sendable {
    let filename: String
    let message: String
}

struct ImportQueueEnqueueResult: Sendable {
    let jobs: [ImportQueueJob]
    let failures: [ImportQueueFailure]
}

actor ImportQueueService {
    enum QueueError: LocalizedError {
        case unsupportedFormat(String)
        case inaccessibleFile(String)
        case unsafePath

        var errorDescription: String? {
            switch self {
            case .unsupportedFormat(let filename):
                "\(filename) is not an EPUB file."
            case .inaccessibleFile(let filename):
                "Glassleaf couldn’t copy \(filename) into the import queue."
            case .unsafePath:
                "The import queue contains an unsafe file path."
            }
        }
    }

    private let fileManager: FileManager
    private let rootOverride: URL?
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(fileManager: FileManager = .default, rootURL: URL? = nil) {
        self.fileManager = fileManager
        self.rootOverride = rootURL
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func enqueue(_ urls: [URL]) throws -> ImportQueueEnqueueResult {
        var jobs = try loadJobs()
        var enqueued: [ImportQueueJob] = []
        var failures: [ImportQueueFailure] = []

        for source in urls {
            do {
                let job = try stage(source)
                jobs.append(job)
                do {
                    try saveJobs(jobs)
                    enqueued.append(job)
                } catch {
                    try? fileManager.removeItem(at: try stagedDirectory(for: job.id))
                    jobs.removeAll { $0.id == job.id }
                    throw error
                }
            } catch {
                failures.append(ImportQueueFailure(
                    filename: source.lastPathComponent,
                    message: error.localizedDescription
                ))
            }
        }
        return ImportQueueEnqueueResult(jobs: enqueued, failures: failures)
    }

    func jobsReadyForProcessing() throws -> [ImportQueueJob] {
        var jobs = try loadJobs()
        var changed = false
        for index in jobs.indices where jobs[index].state == .processing {
            jobs[index].state = .queued
            jobs[index].updatedAt = .now
            changed = true
        }
        if changed { try saveJobs(jobs) }
        return jobs.filter { $0.state == .queued }.sorted { $0.createdAt < $1.createdAt }
    }

    func failedJobs() throws -> [ImportQueueJob] {
        try loadJobs().filter { $0.state == .failed }.sorted { $0.createdAt < $1.createdAt }
    }

    func retryFailedJobs() throws {
        var jobs = try loadJobs()
        var changed = false
        for index in jobs.indices where jobs[index].state == .failed {
            jobs[index].state = .queued
            jobs[index].failureMessage = nil
            jobs[index].updatedAt = .now
            changed = true
        }
        if changed { try saveJobs(jobs) }
    }

    func markProcessing(_ id: UUID) throws {
        try update(id) { job in
            job.state = .processing
            job.failureMessage = nil
        }
    }

    func markFailed(_ id: UUID, message: String) throws {
        try update(id) { job in
            job.state = .failed
            job.failureMessage = message
        }
    }

    func complete(_ id: UUID) throws {
        var jobs = try loadJobs()
        jobs.removeAll { $0.id == id }
        try saveJobs(jobs)
        try? fileManager.removeItem(at: stagedDirectory(for: id))
    }

    func stagedURL(for job: ImportQueueJob) throws -> URL {
        try safeURL(for: job.stagedRelativePath)
    }

    private func stage(_ source: URL) throws -> ImportQueueJob {
        guard source.pathExtension.lowercased() == "epub" else {
            throw QueueError.unsupportedFormat(source.lastPathComponent)
        }
        let accessedSecurityScope = source.startAccessingSecurityScopedResource()
        defer {
            if accessedSecurityScope { source.stopAccessingSecurityScopedResource() }
        }
        let values = try source.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true, (values.fileSize ?? 0) > 0 else {
            throw QueueError.inaccessibleFile(source.lastPathComponent)
        }

        let id = UUID()
        let safeFilename = source.lastPathComponent.replacingOccurrences(of: "/", with: "-")
        let relativePath = "ImportQueue/Files/\(id.uuidString)/\(safeFilename)"
        let destination = try safeURL(for: relativePath)
        try fileManager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        do {
            try fileManager.copyItem(at: source, to: destination)
        } catch {
            try? fileManager.removeItem(at: destination.deletingLastPathComponent())
            throw QueueError.inaccessibleFile(source.lastPathComponent)
        }
        return ImportQueueJob(id: id, sourceFilename: source.lastPathComponent, stagedRelativePath: relativePath)
    }

    private func update(_ id: UUID, mutation: (inout ImportQueueJob) -> Void) throws {
        var jobs = try loadJobs()
        guard let index = jobs.firstIndex(where: { $0.id == id }) else { return }
        mutation(&jobs[index])
        jobs[index].updatedAt = .now
        try saveJobs(jobs)
    }

    private func loadJobs() throws -> [ImportQueueJob] {
        let url = try jobsURL()
        guard fileManager.fileExists(atPath: url.path) else { return [] }
        return try decoder.decode([ImportQueueJob].self, from: Data(contentsOf: url))
    }

    private func saveJobs(_ jobs: [ImportQueueJob]) throws {
        let url = try jobsURL()
        try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoder.encode(jobs).write(to: url, options: .atomic)
    }

    private func jobsURL() throws -> URL {
        try libraryRoot().appending(path: "ImportQueue/jobs.json")
    }

    private func stagedDirectory(for id: UUID) throws -> URL {
        try safeURL(for: "ImportQueue/Files/\(id.uuidString)")
    }

    private func safeURL(for relativePath: String) throws -> URL {
        let components = relativePath.split(separator: "/", omittingEmptySubsequences: false)
        guard !relativePath.hasPrefix("/"), !components.isEmpty,
              components.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
            throw QueueError.unsafePath
        }
        let root = try libraryRoot().standardizedFileURL
        let destination = root.appending(path: relativePath).standardizedFileURL
        guard destination.path.hasPrefix(root.path + "/") else { throw QueueError.unsafePath }
        return destination
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
