import GlassleafDomain
import SwiftUI

struct BookMetadataEditor: View {
    let book: Book
    @Bindable var store: LibraryStore
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var author: String
    @State private var summary: String
    @State private var language: String
    @State private var series: String
    @State private var seriesIndex: String
    @State private var folderID: UUID?
    @State private var collectionIDs: Set<UUID>
    @State private var tagNames: Set<String>
    @State private var newTag = ""
    @State private var coverStyle: CoverStyle

    init(book: Book, store: LibraryStore) {
        self.book = book
        self.store = store
        _title = State(initialValue: book.title)
        _author = State(initialValue: book.author)
        _summary = State(initialValue: book.summary)
        _language = State(initialValue: book.language ?? "")
        _series = State(initialValue: book.series ?? "")
        _seriesIndex = State(initialValue: book.seriesIndex.map(String.init(describing:)) ?? "")
        _folderID = State(initialValue: book.folderID)
        _collectionIDs = State(initialValue: book.collectionIDs)
        _tagNames = State(initialValue: book.tags)
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
                    TextField("Description", text: $summary, axis: .vertical)
                        .lineLimit(4...10)
                }

                Section("Location") {
                    Picker("Folder", selection: $folderID) {
                        Text("No Folder").tag(UUID?.none)
                        ForEach(store.folders.sorted(by: { $0.name < $1.name })) { folder in
                            Text(folder.name).tag(Optional(folder.id))
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
                    TextField("Series", text: $series)
                    TextField("Position", text: $seriesIndex, prompt: Text("For example, 1.5"))
                }

                Section("Tags") {
                    ForEach(allTagNames, id: \.self) { tag in
                        Toggle(tag, isOn: tagBinding(tag))
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
    }

    private var allTagNames: [String] {
        Array(Set(store.tags.map(\.name)).union(tagNames)).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    private func membershipBinding(_ id: UUID, in selection: Binding<Set<UUID>>) -> Binding<Bool> {
        Binding(
            get: { selection.wrappedValue.contains(id) },
            set: { enabled in
                if enabled { selection.wrappedValue.insert(id) } else { selection.wrappedValue.remove(id) }
            }
        )
    }

    private func tagBinding(_ name: String) -> Binding<Bool> {
        Binding(
            get: { tagNames.contains(name) },
            set: { enabled in
                if enabled { tagNames.insert(name) } else { tagNames.remove(name) }
            }
        )
    }

    private func addTag() {
        let value = newTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        tagNames.insert(value)
        newTag = ""
    }

    private func save() {
        for tag in tagNames { store.createTag(name: tag) }
        store.updateBook(id: book.id) { value in
            value.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
            value.author = author.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "Unknown Author"
            value.summary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
            value.language = language.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            value.series = series.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            value.seriesIndex = Decimal(string: seriesIndex.trimmingCharacters(in: .whitespacesAndNewlines))
            value.folderID = folderID
            value.collectionIDs = collectionIDs
            value.tags = tagNames
            value.coverStyle = coverStyle
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
