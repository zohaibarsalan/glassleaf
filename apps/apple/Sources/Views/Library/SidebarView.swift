import GlassleafDomain
import SwiftUI

struct SidebarView: View {
    @Bindable var store: LibraryStore
    @State private var creationKind: CreationKind?
    @State private var draftName = ""
    @State private var renameTarget: RenameTarget?
    @State private var pendingDeletion: DeletionTarget?
    @State private var organizerSheet: OrganizerSheet?

    var body: some View {
        let counts = store.sidebarCounts()

        List(selection: selectionBinding) {
            Section {
                row(.home, icon: "house", title: "Home")
                row(.library(.all), icon: "books.vertical", title: "Library", count: counts[.library(.all)])
                if counts[.inbox, default: 0] > 0 {
                    row(.inbox, icon: "tray", count: counts[.inbox])
                }
            }

            Section("Reading") {
                row(.library(.reading), icon: "bookmark", title: "Reading", count: counts[.library(.reading)])
                row(.library(.unread), icon: "circle", count: counts[.library(.unread)])
                row(.library(.finished), icon: "checkmark.circle", count: counts[.library(.finished)])
                row(.library(.favorites), icon: "star", count: counts[.library(.favorites)])
            }

            organizationSection(counts: counts)

            Section {
                row(.trash, icon: "trash", count: counts[.trash])
            }
        }
        .listStyle(.sidebar)
        .contentMargins(.top, 8, for: .scrollContent)
        .navigationTitle("Glassleaf")
#if os(macOS)
        .safeAreaInset(edge: .bottom) { storageStatus }
#endif
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
        .sheet(item: $organizerSheet) { sheet in
            switch sheet {
            case .smartCollection(let collection):
                SmartCollectionEditor(store: store, collection: collection)
            case .series(let item):
                SeriesManagerView(store: store, series: item)
            }
        }
    }

    private var selectionBinding: Binding<SidebarDestination?> {
        Binding(
            get: { store.selection },
            set: { if let destination = $0 { store.selection = destination } }
        )
    }

    private func organizationSection(counts: [SidebarDestination: Int]) -> some View {
        Section("Organize") {
            Label("Folders", systemImage: "folder")
                .foregroundStyle(.secondary)
            ForEach(store.foldersByPath) { folder in
                row(.folder(folder.id), icon: "folder", count: counts[.folder(folder.id)], indentation: min(store.folderDepth(for: folder.id), 4))
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

            Label("Collections", systemImage: "rectangle.stack")
                .foregroundStyle(.secondary)
            ForEach(store.collections.sorted(by: { $0.sortOrder < $1.sortOrder })) { collection in
                row(.collection(collection.id), icon: "rectangle.stack", count: counts[.collection(collection.id)])
                    .dropDestination(for: String.self) { values, _ in
                        store.assignCollection(collection.id, to: Set(values.compactMap(UUID.init(uuidString:))))
                        return !values.isEmpty
                    }
                    .contextMenu {
                        Button("Rename", systemImage: "pencil") { beginRename(.collection(collection)) }
                        Button("Delete Collection", systemImage: "trash", role: .destructive) { pendingDeletion = .collection(collection.id) }
                    }
            }

            Label("Tags", systemImage: "tag")
                .foregroundStyle(.secondary)
            ForEach(store.tags.sorted(by: { $0.name.localizedStandardCompare($1.name) == .orderedAscending })) { tag in
                row(.tag(tag.id), icon: "tag", count: counts[.tag(tag.id)])
                    .dropDestination(for: String.self) { values, _ in
                        store.assignTag(tag.id, to: Set(values.compactMap(UUID.init(uuidString:))))
                        return !values.isEmpty
                    }
                    .contextMenu {
                        Button("Rename", systemImage: "pencil") { beginRename(.tag(tag)) }
                        Button("Delete Tag", systemImage: "trash", role: .destructive) { pendingDeletion = .tag(tag.id) }
                    }
            }

            Label("Series", systemImage: "square.stack.3d.up")
                .foregroundStyle(.secondary)
            ForEach(store.series.sorted(by: { $0.sortOrder < $1.sortOrder })) { item in
                row(.series(item.id), icon: "square.stack.3d.up", count: counts[.series(item.id)])
                    .dropDestination(for: String.self) { values, _ in
                        store.assignSeries(item.id, to: Set(values.compactMap(UUID.init(uuidString:))))
                        return !values.isEmpty
                    }
                    .contextMenu {
                        Button("Manage Series…", systemImage: "slider.horizontal.3") { organizerSheet = .series(item) }
                        Button("Rename", systemImage: "pencil") { beginRename(.series(item)) }
                        Divider()
                        Button("Delete Series", systemImage: "trash", role: .destructive) { pendingDeletion = .series(item.id) }
                    }
            }

            if !store.smartCollections.isEmpty {
                Label("Smart Collections", systemImage: "gearshape.2")
                    .foregroundStyle(.secondary)
            }
            ForEach(store.smartCollections.sorted(by: { $0.sortOrder < $1.sortOrder })) { collection in
                row(.smartCollection(collection.id), icon: "gearshape.2", count: counts[.smartCollection(collection.id)])
                    .contextMenu {
                        Button("Edit Rules…", systemImage: "slider.horizontal.3") { organizerSheet = .smartCollection(collection) }
                        Button("Delete Smart Collection", systemImage: "trash", role: .destructive) { pendingDeletion = .smartCollection(collection.id) }
                    }
            }

            Menu {
                Section("New Organizer") {
                    Button("Folder", systemImage: "folder.badge.plus") { beginCreation(.folder) }
                    Button("Collection", systemImage: "rectangle.stack.badge.plus") { beginCreation(.collection) }
                    Button("Tag", systemImage: "tag") { beginCreation(.tag) }
                    Button("Series", systemImage: "square.stack.3d.up") { beginCreation(.series) }
                    Button("Smart Collection…", systemImage: "gearshape.2") { organizerSheet = .smartCollection(nil) }
                }
            } label: {
                Label("New Organizer…", systemImage: "plus")
                    .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
    }

    private func row(
        _ destination: SidebarDestination,
        icon: String,
        title: String? = nil,
        count: Int? = nil,
        indentation: Int = 0
    ) -> some View {
        HStack {
            Label(title ?? destination.title(in: store), systemImage: icon)
            Spacer()
            if let count {
                Text(count, format: .number)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.leading, CGFloat(indentation * 14))
        .contentShape(.rect)
        .tag(destination)
    }

#if os(macOS)
    private var storageStatus: some View {
        HStack(spacing: 10) {
            Image(systemName: "internaldrive")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text("On This Device").font(.caption.weight(.medium))
                Text("Local library").font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
#endif

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
        case .series: store.createSeries(name: draftName)
        case nil: break
        }
        resetEditor()
    }

    private func commitRename() {
        switch renameTarget {
        case .folder(let folder): store.renameFolder(id: folder.id, name: draftName)
        case .tag(let tag): store.renameTag(id: tag.id, to: draftName)
        case .collection(let collection): store.renameCollection(id: collection.id, name: draftName)
        case .series(let item): store.renameSeries(id: item.id, name: draftName)
        case nil: break
        }
        resetEditor()
    }

    private func commitDeletion() {
        switch pendingDeletion {
        case .folder(let id): store.deleteFolder(id: id)
        case .tag(let id): store.deleteTag(id: id)
        case .collection(let id): store.deleteCollection(id: id)
        case .series(let id): store.deleteSeries(id: id)
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

private struct SeriesManagerView: View {
    @Bindable var store: LibraryStore
    let series: Series
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var coverBookID: UUID?
    @State private var orderedBookIDs: [UUID]

    init(store: LibraryStore, series: Series) {
        self.store = store
        self.series = series
        _name = State(initialValue: series.name)
        _coverBookID = State(initialValue: series.coverBookID)
        _orderedBookIDs = State(initialValue: store.books
            .filter { $0.seriesID == series.id }
            .sorted { ($0.seriesIndex ?? 0) < ($1.seriesIndex ?? 0) }
            .map(\.id))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Series") {
                    TextField("Name", text: $name)
                    Picker("Cover", selection: $coverBookID) {
                        Text("Automatic").tag(UUID?.none)
                        ForEach(memberBooks) { book in
                            Text(book.title).tag(Optional(book.id))
                        }
                    }
                }

                Section("Reading Order") {
                    if memberBooks.isEmpty {
                        ContentUnavailableView(
                            "No Books in Series",
                            systemImage: "square.stack.3d.up",
                            description: Text("Add books below, then drag them into reading order.")
                        )
                    } else {
                        ForEach(memberBooks) { book in
                            HStack(spacing: 12) {
                                BookCoverView(book: book, size: .row)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(book.title)
                                    Text(book.author).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button("Remove", systemImage: "minus.circle", role: .destructive) {
                                    orderedBookIDs.removeAll { $0 == book.id }
                                    if coverBookID == book.id { coverBookID = nil }
                                }
                                .labelStyle(.iconOnly)
                                .accessibilityLabel("Remove \(book.title) from series")
                            }
                        }
                        .onMove(perform: moveBooks)
                    }
                }

                if !availableBooks.isEmpty {
                    Section("Add Books") {
                        ForEach(availableBooks) { book in
                            Button {
                                orderedBookIDs.append(book.id)
                            } label: {
                                Label(book.title, systemImage: "plus.circle")
                            }
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Manage Series")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .frame(minWidth: 440, idealWidth: 560, minHeight: 560, idealHeight: 720)
    }

    private var memberBooks: [Book] {
        let rank = Dictionary(uniqueKeysWithValues: orderedBookIDs.enumerated().map { ($0.element, $0.offset) })
        return store.books
            .filter { rank[$0.id] != nil }
            .sorted { rank[$0.id, default: .max] < rank[$1.id, default: .max] }
    }

    private var availableBooks: [Book] {
        let memberIDs = Set(orderedBookIDs)
        return store.books
            .filter { $0.deletedAt == nil && !memberIDs.contains($0.id) && ($0.seriesID == nil || $0.seriesID == series.id) }
            .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }

    private func moveBooks(from source: IndexSet, to destination: Int) {
        orderedBookIDs.move(fromOffsets: source, toOffset: destination)
    }

    private func save() {
        store.updateSeries(
            id: series.id,
            name: name,
            coverBookID: coverBookID,
            orderedBookIDs: orderedBookIDs
        )
        dismiss()
    }
}

private enum CreationKind {
    case folder
    case subfolder(UUID)
    case tag
    case collection
    case series

    var title: String {
        switch self {
        case .folder: "New Folder"
        case .subfolder: "New Subfolder"
        case .tag: "New Tag"
        case .collection: "New Collection"
        case .series: "New Series"
        }
    }

    var suggestedName: String {
        return ""
    }
}

private enum RenameTarget {
    case folder(Folder)
    case tag(Tag)
    case collection(BookCollection)
    case series(Series)

    var name: String {
        switch self {
        case .folder(let folder): folder.name
        case .tag(let tag): tag.name
        case .collection(let collection): collection.name
        case .series(let item): item.name
        }
    }
}

private enum DeletionTarget {
    case folder(UUID)
    case tag(UUID)
    case collection(UUID)
    case series(UUID)
    case smartCollection(UUID)
}

private enum OrganizerSheet: Identifiable {
    case smartCollection(SmartCollection?)
    case series(Series)

    var id: String {
        switch self {
        case .smartCollection(let collection): "smart-\(collection?.id.uuidString ?? "new")"
        case .series(let item): "series-\(item.id.uuidString)"
        }
    }
}
