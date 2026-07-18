import GlassleafDomain
import SwiftUI

struct SmartCollectionEditor: View {
    @Bindable var store: LibraryStore
    let collection: SmartCollection?
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var matchMode: MatchMode
    @State private var excludesMatches: Bool
    @State private var favoriteRule: FavoriteRule
    @State private var readingStates: Set<ReadingState>
    @State private var tagIDs: Set<UUID>
    @State private var folderID: UUID?
    @State private var collectionIDs: Set<UUID>
    @State private var seriesID: UUID?
    @State private var author: String
    @State private var seriesQuery: String

    init(store: LibraryStore, collection: SmartCollection? = nil) {
        self.store = store
        self.collection = collection
        let state = SmartRuleEditorState(rule: collection?.rule)
        _name = State(initialValue: collection?.name ?? "")
        _matchMode = State(initialValue: state.matchMode)
        _excludesMatches = State(initialValue: state.excludesMatches)
        _favoriteRule = State(initialValue: state.favoriteRule)
        _readingStates = State(initialValue: state.readingStates)
        _tagIDs = State(initialValue: state.tagIDs)
        _folderID = State(initialValue: state.folderID)
        _collectionIDs = State(initialValue: state.collectionIDs)
        _seriesID = State(initialValue: state.seriesID)
        _author = State(initialValue: state.author)
        _seriesQuery = State(initialValue: state.seriesQuery)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Collection name", text: $name)
                    Picker("Match", selection: $matchMode) {
                        Text("All selected rules").tag(MatchMode.all)
                        Text("Any selected rule").tag(MatchMode.any)
                    }
                    Toggle("Exclude matching books", isOn: $excludesMatches)
                }

                Section("Reading") {
                    Picker("Favorite", selection: $favoriteRule) {
                        ForEach(FavoriteRule.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    ForEach(ReadingState.allCases, id: \.self) { state in
                        Toggle(state.title, isOn: setBinding(state, in: $readingStates))
                    }
                    if readingStates.count > 1 {
                        Text("Reading states always match any selected state because a book cannot be unread, reading, and finished simultaneously.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Organization") {
                    Picker("Folder", selection: $folderID) {
                        Text("Any Folder").tag(UUID?.none)
                        ForEach(store.foldersByPath) { folder in
                            Text(store.folderPath(for: folder.id)).tag(Optional(folder.id))
                        }
                    }
                    ForEach(store.collections) { item in
                        Toggle("In \(item.name)", isOn: setBinding(item.id, in: $collectionIDs))
                    }
                    ForEach(store.tags) { tag in
                        Toggle(tag.name, isOn: setBinding(tag.id, in: $tagIDs))
                    }
                }

                Section("Series") {
                    Picker("Exact series", selection: $seriesID) {
                        Text("Any Series").tag(UUID?.none)
                        ForEach(store.series) { item in
                            Text(item.name).tag(Optional(item.id))
                        }
                    }
                    TextField("Series name contains", text: $seriesQuery)
                }

                Section("Metadata") {
                    TextField("Author contains", text: $author)
                }
            }
            .formStyle(.grouped)
            .navigationTitle(collection == nil ? "New Smart Collection" : "Edit Smart Collection")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(collection == nil ? "Create" : "Save", action: save)
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || rules.isEmpty)
                }
            }
        }
        .frame(minWidth: 440, idealWidth: 540, minHeight: 600, idealHeight: 760)
    }

    private var rules: [SmartCollectionRule] {
        var values: [SmartCollectionRule] = []
        switch favoriteRule {
        case .any: break
        case .favorites: values.append(.favorite(true))
        case .notFavorites: values.append(.favorite(false))
        }
        if readingStates.count == 1, let state = readingStates.first {
            values.append(.readingState(state))
        } else if readingStates.count > 1 {
            values.append(.any(readingStates.map(SmartCollectionRule.readingState)))
        }
        values.append(contentsOf: tagIDs.map(SmartCollectionRule.tagID))
        values.append(contentsOf: collectionIDs.map(SmartCollectionRule.collection))
        if let folderID { values.append(.folder(folderID)) }
        if let seriesID { values.append(.series(seriesID)) }
        let authorValue = author.trimmingCharacters(in: .whitespacesAndNewlines)
        if !authorValue.isEmpty { values.append(.authorContains(authorValue)) }
        let seriesValue = seriesQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        if !seriesValue.isEmpty { values.append(.seriesContains(seriesValue)) }
        return values
    }

    private func save() {
        let baseRule: SmartCollectionRule = matchMode == .all ? .all(rules) : .any(rules)
        let rule = excludesMatches ? SmartCollectionRule.not(baseRule) : baseRule
        if let collection {
            store.updateSmartCollection(id: collection.id, name: name, rule: rule)
        } else {
            store.createSmartCollection(name: name, rule: rule)
        }
        dismiss()
    }

    private func setBinding<Value: Hashable>(_ value: Value, in set: Binding<Set<Value>>) -> Binding<Bool> {
        Binding(
            get: { set.wrappedValue.contains(value) },
            set: { enabled in
                if enabled { set.wrappedValue.insert(value) } else { set.wrappedValue.remove(value) }
            }
        )
    }
}

private struct SmartRuleEditorState {
    var matchMode = MatchMode.all
    var excludesMatches = false
    var favoriteRule = FavoriteRule.any
    var readingStates: Set<ReadingState> = []
    var tagIDs: Set<UUID> = []
    var folderID: UUID?
    var collectionIDs: Set<UUID> = []
    var seriesID: UUID?
    var author = ""
    var seriesQuery = ""

    init(rule: SmartCollectionRule?) {
        guard var rule else { return }
        if case .not(let nested) = rule {
            excludesMatches = true
            rule = nested
        }
        let children: [SmartCollectionRule]
        switch rule {
        case .all(let rules):
            matchMode = .all
            children = rules
        case .any(let rules):
            matchMode = .any
            children = rules
        default:
            children = [rule]
        }
        for child in children { absorb(child) }
    }

    private mutating func absorb(_ rule: SmartCollectionRule) {
        switch rule {
        case .all(let rules), .any(let rules): rules.forEach { absorb($0) }
        case .not: break
        case .tag: break
        case .tagID(let id): tagIDs.insert(id)
        case .folder(let id): folderID = id
        case .collection(let id): collectionIDs.insert(id)
        case .series(let id): seriesID = id
        case .readingState(let state): readingStates.insert(state)
        case .favorite(let expected): favoriteRule = expected ? .favorites : .notFavorites
        case .authorContains(let query): author = query
        case .seriesContains(let query): seriesQuery = query
        }
    }
}

private enum MatchMode: Hashable { case all, any }

private enum FavoriteRule: String, CaseIterable, Identifiable {
    case any
    case favorites
    case notFavorites

    var id: Self { self }
    var title: String {
        switch self {
        case .any: "Any"
        case .favorites: "Favorites only"
        case .notFavorites: "Exclude favorites"
        }
    }
}

private extension ReadingState {
    var title: String {
        switch self { case .unread: "Unread"; case .reading: "Currently Reading"; case .finished: "Finished" }
    }
}
