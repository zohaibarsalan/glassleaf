import Foundation
import GlassleafDomain

@main
struct SearchIndexBenchmark {
    static func main() async throws {
        let count = 50_000
        let root = FileManager.default.temporaryDirectory
            .appending(path: "GlassleafSearchBenchmark-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: root) }

        let books = (0..<count).map { index in
            Book(
                title: index == count - 1 ? "The Singular Glassleaf Target" : "Library Volume \(index)",
                author: "Author \(index % 2_000)",
                series: "Series \(index % 500)",
                tags: ["Tag \(index % 100)"]
            )
        }
        let repository = LocalLibraryRepository(rootURL: root)
        try await repository.save(LibrarySnapshot(books: books))

        _ = try await repository.searchBookIDs("singular glass")
        var samples: [Double] = []
        for _ in 0..<30 {
            let start = ContinuousClock.now
            let result = try await repository.searchBookIDs("singular glass")
            samples.append(start.duration(to: .now).milliseconds)
            precondition(result == [books.last!.id])
        }
        samples.sort()
        let median = samples[samples.count / 2]
        let p95 = samples[Int(Double(samples.count - 1) * 0.95)]
        print("50,000 books: median \(String(format: "%.2f", median)) ms, p95 \(String(format: "%.2f", p95)) ms")
        precondition(p95 < 50, "Indexed search exceeded the 50 ms p95 gate")
    }
}

private extension Duration {
    var milliseconds: Double {
        let parts = components
        return Double(parts.seconds) * 1_000 + Double(parts.attoseconds) / 1e15
    }
}
