import GlassleafDomain
import SwiftUI

struct SidebarView: View {
    @Bindable var store: LibraryStore
    @State private var creationKind: CreationKind?
    @State private var draftName = ""
    @State private var renameTarget: RenameTarget?
    @State private var pendingDeletion: DeletionTarget?
    @State private var showsSmartCollectionEditor = false

    var body: some View {
        List(selection: selectionBinding) {
            Section {
                sidebarSearch
                row(.home, icon: "house", title: "Home")
            }

            Section("Library") {
                row(.library(.all), icon: "books.vertical", title: "All Books", count: store.count(for: .library(.all)))
                row(.inbox, icon: "tray", count: store.count(for: .inbox))
                row(.library(.favorites), icon: "star", count: store.count(for: .library(.favorites)))
            }

            Section("Reading") {
                row(.library(.reading), icon: "book.closed", title: "In Progress", count: store.count(for: .library(.reading)))
                row(.library(.unread), icon: "circle", count: store.count(for: .library(.unread)))
                row(.library(.finished), icon: "checkmark.circle", count: store.count(for: .library(.finished)))
            }

            organizationSection

            Section {
                row(.trash, icon: "trash", count: store.count(for: .trash))
            }
        }
        .listStyle(.sidebar)
        .environment(\.defaultMinListRowHeight, 38)
        .navigationTitle("Glassleaf")
        .safeAreaInset(edge: .bottom) { storageStatus }
        .alert(creationKind?.title ?? "New Item", isPresented: creationBinding) {
            TextField("Name", text: $draftName)
            Button("Cancel", role: .cancel) { resetEditor() }
            Button("Create") { createItem() }
                .disabled(draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .alert("Rename", isPresented: renameBinding) {
            TextField("Name", text: $draftName)
            Button("Cancel", role: .cancel) { resetEditor() }
            Button("Save") { commitRename() }
                .disabled(draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .alert("Delete this organizer?", isPresented: deletionBinding) {
            Button("Cancel", role: .cancel) { pendingDeletion = nil }
            Button("Delete", role: .destructive) { commitDeletion() }
        } message: {
            Text("Books will stay in your library. This can’t be undone.")
        }
        .sheet(isPresented: $showsSmartCollectionEditor) {
            SmartCollectionEditor(store: store)
        }
    }

    private var selectionBinding: Binding<SidebarDestination?> {
        Binding(
            get: { store.selection },
            set: { if let destination = $0 { store.selection = destination } }
        )
    }

    private var organizationSection: some View {
        Section {
            if !store.folders.isEmpty {
                organizerLabel("Folders")
            }
            ForEach(store.folders.sorted(by: folderOrder)) { folder in
                row(.folder(folder.id), icon: "folder", count: store.count(for: .folder(folder.id)), indentation: folderDepth(folder))
                    .dropDestination(for: String.self) { values, _ in
                        store.moveBooks(Set(values.compactMap(UUID.init(uuidString:))), to: folder.id)
                        return !values.isEmpty
                    }
                    .contextMenu {
                        Button("Rename", systemImage: "pencil") { beginRename(.folder(folder)) }
                        Button("New Subfolder", systemImage: "folder.badge.plus") { beginCreation(.subfolder(folder.id)) }
                        Divider()
                        Button("Delete Folder", systemImage: "trash", role: .destructive) { pendingDeletion = .folder(folder.id) }
                    }
            }

            if !store.collections.isEmpty {
                organizerLabel("Collections")
            }
            ForEach(store.collections.sorted(by: { $0.sortOrder < $1.sortOrder })) { collection in
                row(.collection(collection.id), icon: "rectangle.stack", count: store.count(for: .collection(collection.id)))
                    .contextMenu {
                        Button("Rename", systemImage: "pencil") { beginRename(.collection(collection)) }
                        Button("Delete Collection", systemImage: "trash", role: .destructive) { pendingDeletion = .collection(collection.id) }
                    }
            }

            if !store.tags.isEmpty {
                organizerLabel("Tags")
            }
            ForEach(store.tags.sorted(by: { $0.name.localizedStandardCompare($1.name) == .orderedAscending })) { tag in
                row(.tag(tag.name), icon: "tag", count: store.count(for: .tag(tag.name)))
                    .contextMenu {
                        Button("Rename", systemImage: "pencil") { beginRename(.tag(tag.name)) }
                        Button("Delete Tag", systemImage: "trash", role: .destructive) { pendingDeletion = .tag(tag.name) }
                    }
            }

            if !seriesNames.isEmpty {
                organizerLabel("Series")
            }
            ForEach(seriesNames, id: \.self) { name in
                row(.series(name), icon: "square.stack.3d.up", count: store.count(for: .series(name)))
            }

            if !store.smartCollections.isEmpty {
                organizerLabel("Smart Collections")
            }
            ForEach(store.smartCollections.sorted(by: { $0.sortOrder < $1.sortOrder })) { collection in
                row(.smartCollection(collection.id), icon: "gearshape.2", count: store.count(for: .smartCollection(collection.id)))
                    .contextMenu {
                        Button("Rename", systemImage: "pencil") { beginRename(.smartCollection(collection)) }
                        Button("Delete Smart Collection", systemImage: "trash", role: .destructive) { pendingDeletion = .smartCollection(collection.id) }
                    }
            }

            Menu {
                Section("New Organizer") {
                    Button("Folder", systemImage: "folder.badge.plus") { beginCreation(.folder) }
                    Button("Collection", systemImage: "rectangle.stack.badge.plus") { beginCreation(.collection) }
                    Button("Tag", systemImage: "tag") { beginCreation(.tag) }
                    Button("Smart Collection…", systemImage: "gearshape.2") { showsSmartCollectionEditor = true }
                }
            } label: {
                Label("New Organizer…", systemImage: "plus")
                    .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .listRowInsets(.init(top: 2, leading: 12, bottom: 2, trailing: 12))
        } header: {
            Text("Organize")
        }
    }

    private var sidebarSearch: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search", text: $store.searchText)
                .textFieldStyle(.plain)
            if !store.searchText.isEmpty {
                Button("Clear Search", systemImage: "xmark.circle.fill") {
                    store.searchText = ""
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 34)
        .background(.quaternary.opacity(0.7), in: .rect(cornerRadius: 9))
        .listRowInsets(.init(top: 5, leading: 8, bottom: 8, trailing: 8))
        .accessibilityElement(children: .contain)
    }

    private func row(
        _ destination: SidebarDestination,
        icon: String,
        title: String? = nil,
        count: Int? = nil,
        indentation: Int = 0
    ) -> some View {
        HStack(spacing: 9) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(.secondary)
                .frame(width: 20)
            Text(title ?? destination.title(in: store))
                .lineLimit(1)
            Spacer()
            if let count {
                Text(count, format: .number)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.leading, CGFloat(indentation * 14))
        .frame(minHeight: 34)
        .contentShape(.rect)
        .listRowInsets(.init(top: 2, leading: 12, bottom: 2, trailing: 12))
        .tag(destination)
    }

    private func organizerLabel(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.caption2.weight(.semibold))
            .tracking(0.55)
            .foregroundStyle(.tertiary)
            .padding(.top, 7)
            .listRowInsets(.init(top: 2, leading: 13, bottom: 0, trailing: 12))
            .accessibilityAddTraits(.isHeader)
    }

    private var storageStatus: some View {
        HStack(spacing: 10) {
            Image(systemName: "internaldrive")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text("On This Device").font(.caption.weight(.medium))
                Text("Indexed and available offline").font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    private var seriesNames: [String] {
        Array(Set(store.books.compactMap(\.series))).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    private func folderDepth(_ folder: Folder) -> Int {
        var depth = 0
        var parentID = folder.parentID
        var visited: Set<UUID> = []
        while let id = parentID, visited.insert(id).inserted, let parent = store.folders.first(where: { $0.id == id }) {
            depth += 1
            parentID = parent.parentID
        }
        return min(depth, 4)
    }

    private func folderOrder(_ lhs: Folder, _ rhs: Folder) -> Bool {
        let lhsPath = folderPath(lhs)
        let rhsPath = folderPath(rhs)
        return lhsPath.localizedStandardCompare(rhsPath) == .orderedAscending
    }

    private func folderPath(_ folder: Folder) -> String {
        var names = [folder.name]
        var parentID = folder.parentID
        var visited: Set<UUID> = []
        while let id = parentID, visited.insert(id).inserted, let parent = store.folders.first(where: { $0.id == id }) {
            names.insert(parent.name, at: 0)
            parentID = parent.parentID
        }
        return names.joined(separator: "/")
    }

    private var creationBinding: Binding<Bool> {
        Binding(get: { creationKind != nil }, set: { if !$0 { resetEditor() } })
    }

    private var renameBinding: Binding<Bool> {
        Binding(get: { renameTarget != nil }, set: { if !$0 { resetEditor() } })
    }

    private var deletionBinding: Binding<Bool> {
        Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } })
    }

    private func beginCreation(_ kind: CreationKind) {
        draftName = kind.suggestedName
        creationKind = kind
    }

    private func beginRename(_ target: RenameTarget) {
        draftName = target.name
        renameTarget = target
    }

    private func createItem() {
        switch creationKind {
        case .folder: store.createFolder(name: draftName)
        case .subfolder(let parentID): store.createFolder(name: draftName, parentID: parentID)
        case .tag: store.createTag(name: draftName)
        case .collection: store.createCollection(name: draftName)
        case nil: break
        }
        resetEditor()
    }

    private func commitRename() {
        switch renameTarget {
        case .folder(let folder): store.renameFolder(id: folder.id, name: draftName)
        case .tag(let name): store.renameTag(name, to: draftName)
        case .collection(let collection): store.renameCollection(id: collection.id, name: draftName)
        case .smartCollection(let collection): store.renameSmartCollection(id: collection.id, name: draftName)
        case nil: break
        }
        resetEditor()
    }

    private func commitDeletion() {
        switch pendingDeletion {
        case .folder(let id): store.deleteFolder(id: id)
        case .tag(let name): store.deleteTag(name)
        case .collection(let id): store.deleteCollection(id: id)
        case .smartCollection(let id): store.deleteSmartCollection(id: id)
        case nil: break
        }
        pendingDeletion = nil
    }

    private func resetEditor() {
        creationKind = nil
        renameTarget = nil
        draftName = ""
    }
}

private enum CreationKind {
    case folder
    case subfolder(UUID)
    case tag
    case collection

    var title: String {
        switch self {
        case .folder: "New Folder"
        case .subfolder: "New Subfolder"
        case .tag: "New Tag"
        case .collection: "New Collection"
        }
    }

    var suggestedName: String {
        return ""
    }
}

private enum RenameTarget {
    case folder(Folder)
    case tag(String)
    case collection(BookCollection)
    case smartCollection(SmartCollection)

    var name: String {
        switch self {
        case .folder(let folder): folder.name
        case .tag(let name): name
        case .collection(let collection): collection.name
        case .smartCollection(let collection): collection.name
        }
    }
}

private enum DeletionTarget {
    case folder(UUID)
    case tag(String)
    case collection(UUID)
    case smartCollection(UUID)
}
