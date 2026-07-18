import GlassleafDomain
import SwiftUI

struct LibraryView: View {
    @Bindable var store: LibraryStore
    let destination: SidebarDestination
    @State private var batchTagName = ""
    @State private var showsBatchTagEditor = false
    @State private var confirmsEmptyTrash = false

    private var visibleBooks: [Book] {
        store.books(matching: destination)
    }

    private let columns = [
        GridItem(.adaptive(minimum: 138, maximum: 196), spacing: 24, alignment: .top),
    ]

    var body: some View {
        Group {
            if store.isSearching {
                ProgressView("Searching…")
                    .controlSize(.small)
            } else if visibleBooks.isEmpty {
                emptyState
            } else {
                switch store.layout {
                case .grid: grid
                case .list: list
                }
            }
        }
        .navigationTitle(destination.title(in: store))
        .searchable(text: $store.searchText, prompt: "Title, author, series, folder, collection, or tag")
        .toolbar { libraryToolbar }
        .safeAreaInset(edge: .bottom) {
            if store.isSelecting { batchBar }
        }
        .alert("Add Tag", isPresented: $showsBatchTagEditor) {
            TextField("Tag name", text: $batchTagName)
            Button("Cancel", role: .cancel) { batchTagName = "" }
            Button("Add") {
                store.assignTag(batchTagName, to: store.selectedBookIDs)
                batchTagName = ""
            }
        }
        .alert("Empty Trash?", isPresented: $confirmsEmptyTrash) {
            Button("Cancel", role: .cancel) {}
            Button("Delete Permanently", role: .destructive) { store.emptyTrash() }
        } message: {
            Text("This permanently removes every book in Trash, including its local EPUB, cover, bookmarks, and notes. This can’t be undone.")
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label(emptyTitle, systemImage: emptyIcon)
        } description: {
            Text(emptyDescription)
        } actions: {
            if store.searchText.isEmpty && destination != .trash {
                Button("Import EPUBs", systemImage: "plus") { store.requestImport() }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 30) {
                ForEach(visibleBooks) { book in
                    ZStack(alignment: .topTrailing) {
                        BookCard(book: book) { activate(book) }
                        if store.isSelecting {
                            Image(systemName: store.selectedBookIDs.contains(book.id) ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(.white, store.selectedBookIDs.contains(book.id) ? Color.accentColor : .secondary)
                                .padding(8)
                                .accessibilityHidden(true)
                        }
                    }
                    .draggable(book.id.uuidString)
                    .contextMenu { bookMenu(book) }
                }
            }
            .padding(.bottom, 36)
        }
        .contentMargins(.horizontal, 28, for: .scrollContent)
        .contentMargins(.top, 22, for: .scrollContent)
    }

    private var list: some View {
        List(visibleBooks) { book in
            BookRow(book: book) { activate(book) }
                .overlay(alignment: .trailing) {
                    if store.isSelecting {
                        Image(systemName: store.selectedBookIDs.contains(book.id) ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(store.selectedBookIDs.contains(book.id) ? Color.accentColor : .secondary)
                            .padding(.trailing, 8)
                    }
                }
                .draggable(book.id.uuidString)
                .contextMenu { bookMenu(book) }
                .swipeActions(edge: .trailing, allowsFullSwipe: destination != .trash) {
                    if destination == .trash {
                        Button("Restore", systemImage: "arrow.uturn.backward") { store.restoreBooks([book.id]) }
                            .tint(.green)
                    } else {
                        Button("Trash", systemImage: "trash", role: .destructive) { store.trashBooks([book.id]) }
                    }
                }
                .listRowInsets(.init(top: 9, leading: 16, bottom: 9, trailing: 16))
        }
        .listStyle(.inset)
    }

    @ToolbarContentBuilder
    private var libraryToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            if destination == .trash && !visibleBooks.isEmpty {
                Button("Empty Trash", systemImage: "trash.slash", role: .destructive) { confirmsEmptyTrash = true }
            }
            Button(store.isSelecting ? "Done" : "Select", systemImage: store.isSelecting ? "checkmark" : "checkmark.circle") {
                store.isSelecting ? store.endSelecting() : (store.isSelecting = true)
            }
            Menu("Sort", systemImage: "arrow.up.arrow.down") {
                Picker("Sort", selection: $store.sort) {
                    ForEach(LibrarySort.allCases) { option in
                        Label(option.title, systemImage: option.systemImage).tag(option)
                    }
                }
            }
            layoutPicker
            Button("Export Library", systemImage: "square.and.arrow.up") {
                Task { await store.prepareExport() }
            }
            .help("Export original EPUBs, metadata, and reading data")
            Button("Import", systemImage: "plus") { store.requestImport() }
                .help("Import an EPUB")
        }
    }

    private var layoutPicker: some View {
        Picker("Layout", selection: $store.layout) {
            Label("Grid", systemImage: "square.grid.2x2").tag(LibraryLayout.grid)
            Label("List", systemImage: "list.bullet").tag(LibraryLayout.list)
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }

    private var batchBar: some View {
        HStack(spacing: 12) {
            Text(store.selectedBookIDs.count, format: .number)
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
                .accessibilityLabel("\(store.selectedBookIDs.count) books selected")
            Menu("Move", systemImage: "folder") {
                Button("No Folder") { store.moveBooks(store.selectedBookIDs, to: nil) }
                ForEach(store.folders) { folder in
                    Button(folder.name) { store.moveBooks(store.selectedBookIDs, to: folder.id) }
                }
            }
            Menu("Collect", systemImage: "rectangle.stack") {
                ForEach(store.collections) { collection in
                    Button(collection.name) { store.assignCollection(collection.id, to: store.selectedBookIDs) }
                }
            }
            Menu("Tag", systemImage: "tag") {
                Button("New Tag…", systemImage: "plus") { showsBatchTagEditor = true }
                ForEach(store.tags) { tag in
                    Button(tag.name) { store.assignTag(tag.name, to: store.selectedBookIDs) }
                }
            }
            Spacer()
            if destination == .trash {
                Button("Restore", systemImage: "arrow.uturn.backward") { store.restoreBooks(store.selectedBookIDs) }
                    .disabled(store.selectedBookIDs.isEmpty)
            } else {
                Button("Trash", systemImage: "trash", role: .destructive) { store.trashBooks(store.selectedBookIDs) }
                    .disabled(store.selectedBookIDs.isEmpty)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .glassEffect(.regular)
        .padding()
    }

    @ViewBuilder
    private func bookMenu(_ book: Book) -> some View {
        Button(book.isFavorite ? "Remove from Favorites" : "Add to Favorites", systemImage: book.isFavorite ? "star.slash" : "star") {
            store.toggleFavorite(for: book.id)
        }
        Menu("Move to Folder", systemImage: "folder") {
            Button("No Folder") { store.moveBooks([book.id], to: nil) }
            ForEach(store.folders) { folder in
                Button(folder.name) { store.moveBooks([book.id], to: folder.id) }
            }
        }
        Menu("Add Tag", systemImage: "tag") {
            ForEach(store.tags) { tag in
                Button(tag.name) { store.assignTag(tag.name, to: [book.id]) }
            }
        }
        Divider()
        if destination == .trash {
            Button("Restore", systemImage: "arrow.uturn.backward") { store.restoreBooks([book.id]) }
        } else {
            Button("Move to Trash", systemImage: "trash", role: .destructive) { store.trashBooks([book.id]) }
        }
    }

    private func activate(_ book: Book) {
        if store.isSelecting { store.toggleSelection(book.id) } else { store.showDetails(for: book) }
    }

    private var emptyTitle: String {
        if !store.searchText.isEmpty { return "No Results" }
        if destination == .trash { return "Trash is Empty" }
        if destination == .inbox { return "Inbox Zero" }
        return "Nothing Here Yet"
    }

    private var emptyIcon: String {
        if !store.searchText.isEmpty { return "magnifyingglass" }
        if destination == .trash { return "trash" }
        if destination == .inbox { return "tray" }
        return "books.vertical"
    }

    private var emptyDescription: String {
        if !store.searchText.isEmpty { return "Try another title, author, series, folder, collection, or tag." }
        if destination == .trash { return "Books moved to Trash can be restored here." }
        if destination == .inbox { return "Every imported book has been organized." }
        return "Import a DRM-free EPUB or move books into this organizer."
    }
}

private extension LibrarySort {
    var title: String {
        switch self {
        case .recentlyAdded: "Recently Added"
        case .lastOpened: "Last Opened"
        case .title: "Title"
        case .author: "Author"
        case .series: "Series"
        case .progress: "Progress"
        }
    }

    var systemImage: String {
        switch self {
        case .recentlyAdded: "calendar.badge.plus"
        case .lastOpened: "clock"
        case .title: "textformat"
        case .author: "person"
        case .series: "square.stack.3d.up"
        case .progress: "chart.bar.fill"
        }
    }
}
