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
                Section("Book") {
                    TextField("Title", text: $title)
                    TextField("Author", text: $author)
                    TextField("Language", text: $language, prompt: Text("Optional language code"))
                    Picker("Cover style", selection: $coverStyle) {
                        ForEach(CoverStyle.allCases, id: \.self) { style in
                            Text(style.title).tag(style)
                        }
                    }
                    LabeledContent("Cover image") {
                        Button(replacementCover?.filename ?? "Choose Image…") {
                            showsCoverImporter = true
                        }
                    }
                    TextField("Description", text: $summary, axis: .vertical)
                        .lineLimit(4...10)
                }

                Section("Location") {
                    Picker("Folder", selection: $folderID) {
                        Text("No Folder").tag(UUID?.none)
                        ForEach(store.foldersByPath) { folder in
                            Text(store.folderPath(for: folder.id)).tag(Optional(folder.id))
                        }
                    }
                    if store.collections.isEmpty {
                        Text("Create a collection from the sidebar to add this book to it.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(store.collections) { collection in
                            Toggle(collection.name, isOn: membershipBinding(collection.id, in: $collectionIDs))
                        }
                    }
                }

                Section("Series") {
                    Picker("Series", selection: $seriesID) {
                        Text("No Series").tag(UUID?.none)
                        ForEach(store.series) { item in
                            Text(item.name).tag(Optional(item.id))
                        }
                    }
                    HStack {
                        TextField("New series", text: $newSeries)
                            .onSubmit(addSeries)
                        Button("Add", systemImage: "plus", action: addSeries)
                            .labelStyle(.iconOnly)
                            .accessibilityLabel("Add series")
                            .disabled(newSeries.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    TextField("Position", text: $seriesIndex, prompt: Text("For example, 1.5"))
                        .disabled(seriesID == nil)
                }

                Section("Tags") {
                    ForEach(store.tags.sorted(by: { $0.name.localizedStandardCompare($1.name) == .orderedAscending })) { tag in
                        Toggle(tag.name, isOn: membershipBinding(tag.id, in: $tagIDs))
                    }
                    HStack {
                        TextField("New tag", text: $newTag)
                            .onSubmit(addTag)
                        Button("Add", systemImage: "plus", action: addTag)
                            .labelStyle(.iconOnly)
                            .accessibilityLabel("Add tag")
                            .disabled(newTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
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
        .frame(minWidth: 420, idealWidth: 520, minHeight: 560, idealHeight: 720)
        .fileImporter(isPresented: $showsCoverImporter, allowedContentTypes: [.image]) { result in
            guard case .success(let url) = result else { return }
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return }
            replacementCover = (data, url.lastPathComponent)
        }
    }

    private func membershipBinding(_ id: UUID, in selection: Binding<Set<UUID>>) -> Binding<Bool> {
        Binding(
            get: { selection.wrappedValue.contains(id) },
            set: { enabled in
                if enabled { selection.wrappedValue.insert(id) } else { selection.wrappedValue.remove(id) }
            }
        )
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
            value.seriesIndex = Decimal(string: seriesIndex.trimmingCharacters(in: .whitespacesAndNewlines))
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

private extension CoverStyle {
    var title: String { rawValue.capitalized }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
