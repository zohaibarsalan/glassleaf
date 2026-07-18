import GlassleafDomain
import SwiftUI

struct SmartCollectionEditor: View {
    @Bindable var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var matchMode = MatchMode.all
    @State private var favoritesOnly = false
    @State private var readingStates: Set<ReadingState> = []
    @State private var tagNames: Set<String> = []
    @State private var folderID: UUID?
    @State private var author = ""
    @State private var series = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Collection name", text: $name)
                    Picker("Match", selection: $matchMode) {
                        Text("All selected rules").tag(MatchMode.all)
                        Text("Any selected rule").tag(MatchMode.any)
                    }
                }

                Section("Reading") {
                    Toggle("Favorites", isOn: $favoritesOnly)
                    ForEach(ReadingState.allCases, id: \.self) { state in
                        Toggle(state.title, isOn: setBinding(state, in: $readingStates))
                    }
                }

                Section("Organization") {
                    Picker("Folder", selection: $folderID) {
                        Text("Any Folder").tag(UUID?.none)
                        ForEach(store.folders) { folder in Text(folder.name).tag(Optional(folder.id)) }
                    }
                    ForEach(store.tags) { tag in
                        Toggle(tag.name, isOn: setBinding(tag.name, in: $tagNames))
                    }
                }

                Section("Metadata") {
                    TextField("Author contains", text: $author)
                    TextField("Series contains", text: $series)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("New Smart Collection")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create", action: create)
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || rules.isEmpty)
                }
            }
        }
        .frame(minWidth: 420, idealWidth: 520, minHeight: 560, idealHeight: 700)
    }

    private var rules: [SmartCollectionRule] {
        var values: [SmartCollectionRule] = []
        if favoritesOnly { values.append(.favorite(true)) }
        values.append(contentsOf: readingStates.map(SmartCollectionRule.readingState))
        values.append(contentsOf: tagNames.map(SmartCollectionRule.tag))
        if let folderID { values.append(.folder(folderID)) }
        let authorValue = author.trimmingCharacters(in: .whitespacesAndNewlines)
        if !authorValue.isEmpty { values.append(.authorContains(authorValue)) }
        let seriesValue = series.trimmingCharacters(in: .whitespacesAndNewlines)
        if !seriesValue.isEmpty { values.append(.seriesContains(seriesValue)) }
        return values
    }

    private func create() {
        let rule: SmartCollectionRule = matchMode == .all ? .all(rules) : .any(rules)
        store.createSmartCollection(name: name, rule: rule)
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

private enum MatchMode: Hashable { case all, any }

private extension ReadingState {
    var title: String {
        switch self { case .unread: "Unread"; case .reading: "Currently Reading"; case .finished: "Finished" }
    }
}
