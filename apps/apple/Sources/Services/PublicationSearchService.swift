import Foundation
import GlassleafDomain

struct PublicationSearchResult: Identifiable, Sendable {
    let chapterIndex: Int
    let title: String
    let snippet: String
    var id: Int { chapterIndex }
}

actor PublicationSearchService {
    static let shared = PublicationSearchService()

    private var cachedPublicationKey: String?
    private var chapterTextByHref: [String: String] = [:]
    private let scriptAndStyleExpression = try? NSRegularExpression(
        pattern: "<(script|style)[^>]*>[\\s\\S]*?</\\1>",
        options: [.caseInsensitive]
    )
    private let tagExpression = try? NSRegularExpression(pattern: "<[^>]+>")
    private let whitespaceExpression = try? NSRegularExpression(pattern: "\\s+")

    func search(_ query: String, rootURL: URL, links: [PublicationLink]) throws -> [PublicationSearchResult] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard needle.count >= 2 else { return [] }
        prepareCache(for: rootURL, links: links)
        var results: [PublicationSearchResult] = []

        for (index, link) in links.enumerated() {
            try Task.checkCancellation()
            guard let text = chapterText(for: link, rootURL: rootURL) else { continue }
            guard let range = text.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) else { continue }
            let lower = text.index(range.lowerBound, offsetBy: -70, limitedBy: text.startIndex) ?? text.startIndex
            let upper = text.index(range.upperBound, offsetBy: 120, limitedBy: text.endIndex) ?? text.endIndex
            let snippet = String(text[lower..<upper]).trimmingCharacters(in: .whitespacesAndNewlines)
            results.append(PublicationSearchResult(chapterIndex: index, title: link.title ?? "Chapter \(index + 1)", snippet: snippet))
            if results.count == 100 { break }
        }
        return results
    }

    private func prepareCache(for rootURL: URL, links: [PublicationLink]) {
        let key = rootURL.standardizedFileURL.path + "\u{0}" + links.map(\.href).joined(separator: "\u{0}")
        guard key != cachedPublicationKey else { return }
        cachedPublicationKey = key
        chapterTextByHref.removeAll(keepingCapacity: true)
        chapterTextByHref.reserveCapacity(links.count)
    }

    private func chapterText(for link: PublicationLink, rootURL: URL) -> String? {
        if let cached = chapterTextByHref[link.href] { return cached }
        let resource = rootURL.appending(path: link.href)
        guard let data = try? Data(contentsOf: resource, options: .mappedIfSafe),
              let markup = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else { return nil }
        let text = plainText(markup)
        chapterTextByHref[link.href] = text
        return text
    }

    private func plainText(_ markup: String) -> String {
        var text = replacingMatches(in: markup, using: scriptAndStyleExpression)
        text = replacingMatches(in: text, using: tagExpression)
        text = text
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"")
        return replacingMatches(in: text, using: whitespaceExpression)
    }

    private func replacingMatches(in text: String, using expression: NSRegularExpression?) -> String {
        guard let expression else { return text }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.stringByReplacingMatches(in: text, range: range, withTemplate: " ")
    }
}
