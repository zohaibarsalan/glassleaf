import GlassleafDomain
import SwiftUI
import UniformTypeIdentifiers

struct BookMetadataEditor: View {
    let book: Book
    @Bindable var store: LibraryStore
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var author: String
    @State private var summary: String
    @State private var language: String
    @State private var seriesID: UUID?
    @State private var newSeries = ""
    @State private var seriesIndex: String
    @State private var folderID: UUID?
    @State private var collectionIDs: Set<UUID>
    @State private var tagIDs: Set<UUID>
    @State private var newTag = ""
    @State private var coverStyle: CoverStyle
    @State private var showsCoverImporter = false
    @State private var replacementCover: (data: Data, filename: String)?

    init(book: Book, store: LibraryStore) {
        self.book = book
        self.store = store
        _title = State(initialValue: book.title)
        _author = State(initialValue: book.author)
        _summary = State(initialValue: book.summary)
        _language = State(initialValue: book.language ?? "")
        _seriesID = State(initialValue: book.seriesID)
        _seriesIndex = State(initialValue: book.seriesIndex.map(String.init(describing:)) ?? "")
        _folderID = State(initialValue: book.folderID)
        _collectionIDs = State(initialValue: book.collectionIDs)
        _tagIDs = State(initialValue: book.tagIDs)
        _coverStyle = State(initialValue: book.coverStyle)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    coverEditor
                }

                Section("Book Information") {
                    TextField("Title", text: $title)
                    TextField("Author", text: $author)
                    TextField("Language", text: $language, prompt: Text("Optional language code"))
                    TextField("Description", text: $summary, axis: .vertical)
                        .lineLimit(4...10)
                }

                Section("Organization") {
                    Picker("Folder", selection: $folderID) {
                        Text("No Folder").tag(UUID?.none)
                        ForEach(store.foldersByPath) { folder in
                            Text(store.folderPath(for: folder.id)).tag(Optional(folder.id))
                        }
                    }

                    if store.collections.isEmpty {
                        Text("Create a collection from the sidebar to add this book to it.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        LabeledContent("Collections") {
                            Menu {
                                ForEach(sortedCollections) { collection in
                                    Button {
                                        toggle(collection.id, in: &collectionIDs)
                                    } label: {
                                        Label(
                                            collection.name,
                                            systemImage: collectionIDs.contains(collection.id) ? "checkmark" : "circle"
                                        )
                                    }
                                }
                            } label: {
                                Text(collectionSummary)
                                    .lineLimit(1)
                            }
                        }
                    }
                }

                Section {
                    Picker("Series", selection: $seriesID) {
                        Text("No Series").tag(UUID?.none)
                        ForEach(sortedSeries) { item in
                            Text(item.name).tag(Optional(item.id))
                        }
                    }
                    if seriesID != nil {
                        TextField("Position", text: $seriesIndex, prompt: Text("For example, 1.5"))
                    }
                    OrganizerCreationRow(
                        icon: "square.stack.3d.up",
                        prompt: "Series name",
                        buttonTitle: "Add Series",
                        name: $newSeries,
                        action: addSeries
                    )
                } header: {
                    Text("Series")
                } footer: {
                    Text("Position controls the reading order and can include decimals, such as 1.5.")
                }

                Section("Tags") {
                    if !store.tags.isEmpty {
                        LabeledContent("Applied tags") {
                            Menu {
                                ForEach(sortedTags) { tag in
                                    Button {
                                        toggle(tag.id, in: &tagIDs)
                                    } label: {
                                        Label(
                                            tag.name,
                                            systemImage: tagIDs.contains(tag.id) ? "checkmark" : "circle"
                                        )
                                    }
                                }
                            } label: {
                                Text(tagSummary)
                                    .lineLimit(1)
                            }
                        }
                    }

                    OrganizerCreationRow(
                        icon: "tag",
                        prompt: "Tag name",
                        buttonTitle: "Add Tag",
                        name: $newTag,
                        action: addTag
                    )
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Edit Book")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
#if os(macOS)
        .frame(minWidth: 440, idealWidth: 560, minHeight: 600, idealHeight: 760)
#endif
        .fileImporter(isPresented: $showsCoverImporter, allowedContentTypes: [.image]) { result in
            guard case .success(let url) = result else { return }
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return }
            replacementCover = (data, url.lastPathComponent)
        }
    }

    private var coverEditor: some View {
        HStack(alignment: .center, spacing: 18) {
            BookCoverView(book: previewBook, size: .row)

            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "Untitled Book")
                        .font(.headline)
                        .lineLimit(1)
                    Text(author.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "Unknown Author")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Picker("Cover style", selection: $coverStyle) {
                    ForEach(CoverStyle.allCases, id: \.self) { style in
                        Text(style.title).tag(style)
                    }
                }

                Button("Choose Cover Image…", systemImage: "photo") {
                    showsCoverImporter = true
                }
                .buttonStyle(.bordered)

                if let filename = replacementCover?.filename {
                    Text(filename)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 4)
    }

    private var previewBook: Book {
        var value = book
        value.title = title
        value.author = author
        value.coverStyle = coverStyle
        return value
    }

    private var sortedCollections: [BookCollection] {
        store.collections.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private var sortedTags: [Tag] {
        store.tags.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private var sortedSeries: [Series] {
        store.series.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private var collectionSummary: String {
        selectionSummary(
            selectedIDs: collectionIDs,
            namesByID: Dictionary(uniqueKeysWithValues: store.collections.map { ($0.id, $0.name) }),
            emptyTitle: "None"
        )
    }

    private var tagSummary: String {
        selectionSummary(
            selectedIDs: tagIDs,
            namesByID: Dictionary(uniqueKeysWithValues: store.tags.map { ($0.id, $0.name) }),
            emptyTitle: "None"
        )
    }

    private func selectionSummary(
        selectedIDs: Set<UUID>,
        namesByID: [UUID: String],
        emptyTitle: String
    ) -> String {
        let names = selectedIDs.compactMap { namesByID[$0] }
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        if names.isEmpty { return emptyTitle }
        if names.count <= 2 { return names.joined(separator: ", ") }
        return "\(names.count) selected"
    }

    private func toggle(_ id: UUID, in selection: inout Set<UUID>) {
        if selection.contains(id) {
            selection.remove(id)
        } else {
            selection.insert(id)
        }
    }

    private func addTag() {
        let value = newTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        if let id = store.createTag(name: value) { tagIDs.insert(id) }
        newTag = ""
    }

    private func addSeries() {
        let value = newSeries.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        seriesID = store.createSeries(name: value)
        newSeries = ""
    }

    private func save() {
        store.updateBook(id: book.id) { value in
            value.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
            value.author = author.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "Unknown Author"
            value.summary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
            value.language = language.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            value.seriesID = seriesID
            value.seriesIndex = seriesID == nil
                ? nil
                : Decimal(string: seriesIndex.trimmingCharacters(in: .whitespacesAndNewlines))
            value.folderID = folderID
            value.collectionIDs = collectionIDs
            value.tagIDs = tagIDs
            value.coverStyle = coverStyle
        }
        if let replacementCover {
            Task {
                await store.replaceCover(for: book.id, data: replacementCover.data, filename: replacementCover.filename)
            }
        }
        dismiss()
    }
}

private struct OrganizerCreationRow: View {
    let icon: String
    let prompt: String
    let buttonTitle: String
    @Binding var name: String
    let action: () -> Void

    private var isEmpty: Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .frame(width: 18)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)

            TextField(prompt, text: $name)
                .textFieldStyle(.roundedBorder)
                .onSubmit {
                    guard !isEmpty else { return }
                    action()
                }

            Button(buttonTitle, systemImage: "plus", action: action)
                .buttonStyle(.bordered)
                .disabled(isEmpty)
        }
        .padding(.vertical, 4)
    }
}

private extension CoverStyle {
    var title: String { rawValue.capitalized }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
