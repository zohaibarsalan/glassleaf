import Foundation
import GlassleafDomain

struct PublicationSearchResult: Identifiable, Sendable {
    let chapterIndex: Int
    let title: String
    let snippet: String
    var id: Int { chapterIndex }
}

actor PublicationSearchService {
    func search(_ query: String, rootURL: URL, links: [PublicationLink]) throws -> [PublicationSearchResult] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard needle.count >= 2 else { return [] }
        var results: [PublicationSearchResult] = []

        for (index, link) in links.enumerated() {
            try Task.checkCancellation()
            let resource = rootURL.appending(path: link.href)
            guard let data = try? Data(contentsOf: resource, options: .mappedIfSafe),
                  let markup = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else { continue }
            let text = Self.plainText(markup)
            guard let range = text.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) else { continue }
            let lower = text.index(range.lowerBound, offsetBy: -70, limitedBy: text.startIndex) ?? text.startIndex
            let upper = text.index(range.upperBound, offsetBy: 120, limitedBy: text.endIndex) ?? text.endIndex
            let snippet = String(text[lower..<upper]).trimmingCharacters(in: .whitespacesAndNewlines)
            results.append(PublicationSearchResult(chapterIndex: index, title: link.title ?? "Chapter \(index + 1)", snippet: snippet))
            if results.count == 100 { break }
        }
        return results
    }

    private static func plainText(_ markup: String) -> String {
        markup
            .replacingOccurrences(of: "<(script|style)[^>]*>[\\s\\S]*?</\\1>", with: " ", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }
}
