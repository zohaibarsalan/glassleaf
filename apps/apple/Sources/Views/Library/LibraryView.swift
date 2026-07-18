import GlassleafDomain
import SwiftUI

struct LibraryView: View {
    @Bindable var store: LibraryStore
    let filter: LibraryFilter

    private var visibleBooks: [Book] {
        store.books(matching: filter)
    }

    private let columns = [
        GridItem(.adaptive(minimum: 138, maximum: 196), spacing: 24, alignment: .top),
    ]

    var body: some View {
        Group {
            if visibleBooks.isEmpty {
                if store.books.isEmpty {
                    ContentUnavailableView {
                        Label("No books yet", systemImage: "books.vertical")
                    } description: {
                        Text("Import a DRM-free EPUB to build your library.")
                    } actions: {
                        Button("Import EPUBs", systemImage: "plus") {
                            store.requestImport()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    ContentUnavailableView.search(text: store.searchText)
                }
            } else {
                switch store.layout {
                case .grid:
                    grid
                case .list:
                    list
                }
            }
        }
        .navigationTitle(filter.title)
        .searchable(text: $store.searchText, prompt: "Title, author, series, or tag")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                layoutPicker
                Button("Import", systemImage: "plus") {
                    store.requestImport()
                }
                    .help("Import an EPUB")
            }
        }
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 30) {
                ForEach(visibleBooks) { book in
                    BookCard(book: book) {
                        store.showDetails(for: book)
                    }
                    .contextMenu {
                        favoriteButton(for: book)
                    }
                }
            }
            .padding(.bottom, 36)
        }
        .contentMargins(.horizontal, 28, for: .scrollContent)
        .contentMargins(.top, 22, for: .scrollContent)
    }

    private var list: some View {
        List(visibleBooks) { book in
            BookRow(book: book) {
                store.showDetails(for: book)
            }
            .contextMenu {
                favoriteButton(for: book)
            }
            .listRowInsets(.init(top: 9, leading: 16, bottom: 9, trailing: 16))
        }
        .listStyle(.inset)
    }

    private var layoutPicker: some View {
        Picker("Layout", selection: $store.layout) {
            Label("Grid", systemImage: "square.grid.2x2")
                .tag(LibraryLayout.grid)
            Label("List", systemImage: "list.bullet")
                .tag(LibraryLayout.list)
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }

    private func favoriteButton(for book: Book) -> some View {
        Button {
            store.toggleFavorite(for: book.id)
        } label: {
            Label(
                book.isFavorite ? "Remove from Favorites" : "Add to Favorites",
                systemImage: book.isFavorite ? "star.slash" : "star"
            )
        }
    }
}
