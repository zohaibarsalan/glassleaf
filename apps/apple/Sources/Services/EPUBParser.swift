import Foundation
import GlassleafDomain

struct EPUBPackage: Sendable {
    var title: String?
    var authors: [String] = []
    var summary: String?
    var language: String?
    var identifiers: Set<String> = []
    var series: String?
    var seriesIndex: Decimal?
    var coverPath: String?
    var coverMediaType: String?
    var packagePath: String
    var readingOrder: [PublicationLink] = []
    var tableOfContents: [PublicationLink] = []
}

struct EPUBParser {
    enum ParserError: LocalizedError {
        case missingContainer
        case missingPackage
        case emptySpine

        var errorDescription: String? {
            switch self {
            case .missingContainer: "The EPUB is missing its container description."
            case .missingPackage: "The EPUB is missing its package metadata."
            case .emptySpine: "The EPUB doesn’t contain a readable spine."
            }
        }
    }

    func parse(_ archive: ZIPArchive) throws -> EPUBPackage {
        let containerData = try archive.data(forPath: "META-INF/container.xml")
        let container = ContainerDelegate()
        guard XMLParser(data: containerData).parse(with: container), let packagePath = container.packagePath else {
            throw ParserError.missingContainer
        }

        let packageData = try archive.data(forPath: packagePath)
        let delegate = PackageDelegate(packagePath: packagePath)
        guard XMLParser(data: packageData).parse(with: delegate) else { throw ParserError.missingPackage }
        var package = delegate.package
        guard !package.readingOrder.isEmpty else { throw ParserError.emptySpine }

        if let navigationPath = delegate.navigationPath,
           let navigationData = try? archive.data(forPath: navigationPath) {
            let navigation = NavigationDelegate(basePath: navigationPath)
            if XMLParser(data: navigationData).parse(with: navigation), !navigation.links.isEmpty {
                package.tableOfContents = navigation.links
            }
        }
        if package.tableOfContents.isEmpty { package.tableOfContents = package.readingOrder }
        return package
    }
}

private final class ContainerDelegate: NSObject, XMLParserDelegate {
    var packagePath: String?

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        if elementName.localName == "rootfile" { packagePath = attributeDict["full-path"] }
    }
}

private final class PackageDelegate: NSObject, XMLParserDelegate {
    struct ManifestItem {
        var id: String
        var path: String
        var mediaType: String?
        var properties: Set<String>
    }

    private let packageDirectory: String
    private var manifest: [String: ManifestItem] = [:]
    private var spineIDs: [String] = []
    private var currentText = ""
    private var coverID: String?
    private var navigationID: String?
    private var pendingSeriesProperty: String?
    var package: EPUBPackage

    init(packagePath: String) {
        packageDirectory = (packagePath as NSString).deletingLastPathComponent
        package = EPUBPackage(packagePath: packagePath)
    }

    var navigationPath: String? {
        navigationID.flatMap { manifest[$0]?.path }
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes: [String: String] = [:]) {
        let name = elementName.localName
        currentText = ""
        if name == "item", let id = attributes["id"], let href = attributes["href"] {
            let properties = Set((attributes["properties"] ?? "").split(separator: " ").map(String.init))
            let item = ManifestItem(id: id, path: resolve(href), mediaType: attributes["media-type"], properties: properties)
            manifest[id] = item
            if properties.contains("cover-image") { coverID = id }
            if properties.contains("nav") { navigationID = id }
        } else if name == "itemref", let id = attributes["idref"] {
            spineIDs.append(id)
        } else if name == "meta" {
            if attributes["name"] == "cover" { coverID = attributes["content"] }
            if attributes["name"] == "calibre:series" { package.series = attributes["content"] }
            if attributes["name"] == "calibre:series_index", let value = attributes["content"] { package.seriesIndex = Decimal(string: value) }
            if attributes["property"] == "belongs-to-collection" { pendingSeriesProperty = "series" }
            if attributes["property"] == "group-position" { pendingSeriesProperty = "index" }
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        currentText += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        let value = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        switch elementName.localName {
        case "title" where package.title == nil: package.title = value.nilIfEmpty
        case "creator" where !value.isEmpty: package.authors.append(value)
        case "description" where package.summary == nil: package.summary = value.strippingMarkup.nilIfEmpty
        case "language" where package.language == nil: package.language = value.nilIfEmpty
        case "identifier" where !value.isEmpty: package.identifiers.insert(value)
        case "meta" where pendingSeriesProperty == "series" && package.series == nil: package.series = value.nilIfEmpty
        case "meta" where pendingSeriesProperty == "index" && package.seriesIndex == nil: package.seriesIndex = Decimal(string: value)
        default: break
        }
        if elementName.localName == "meta" { pendingSeriesProperty = nil }
        currentText = ""
    }

    func parserDidEndDocument(_ parser: XMLParser) {
        package.readingOrder = spineIDs.compactMap { id in
            guard let item = manifest[id] else { return nil }
            return PublicationLink(href: item.path, title: nil, mediaType: item.mediaType)
        }
        if let coverID, let cover = manifest[coverID] {
            package.coverPath = cover.path
            package.coverMediaType = cover.mediaType
        }
    }

    private func resolve(_ href: String) -> String {
        let decoded = href.removingPercentEncoding ?? href
        let combined = packageDirectory.isEmpty ? decoded : "\(packageDirectory)/\(decoded)"
        return (combined as NSString).standardizingPath
    }
}

private final class NavigationDelegate: NSObject, XMLParserDelegate {
    private let baseDirectory: String
    private var isInTOC = false
    private var depth = 0
    private var currentHref: String?
    private var currentText = ""
    var links: [PublicationLink] = []

    init(basePath: String) {
        baseDirectory = (basePath as NSString).deletingLastPathComponent
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes: [String: String] = [:]) {
        let name = elementName.localName
        if name == "nav" {
            let type = attributes.first(where: { $0.key.localName == "type" })?.value
            if type == "toc" { isInTOC = true; depth = 1 }
        } else if isInTOC {
            depth += 1
            if name == "a", let href = attributes["href"] {
                currentHref = resolve(href)
                currentText = ""
            }
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if currentHref != nil { currentText += string }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if elementName.localName == "a", let href = currentHref {
            links.append(PublicationLink(href: href, title: currentText.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty))
            currentHref = nil
        }
        if isInTOC {
            depth -= 1
            if depth == 0 { isInTOC = false }
        }
    }

    private func resolve(_ href: String) -> String {
        let resource = href.split(separator: "#", maxSplits: 1).first.map(String.init) ?? href
        let combined = baseDirectory.isEmpty ? resource : "\(baseDirectory)/\(resource)"
        return (combined as NSString).standardizingPath
    }
}

private extension XMLParser {
    func parse(with delegate: XMLParserDelegate) -> Bool {
        self.delegate = delegate
        shouldProcessNamespaces = true
        return parse()
    }
}

private extension String {
    var localName: String { split(separator: ":").last.map(String.init) ?? self }
    var nilIfEmpty: String? { isEmpty ? nil : self }
    var strippingMarkup: String {
        replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
