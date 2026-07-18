import SwiftUI

struct AppRootView: View {
    @State private var store = LibraryStore.preview

    var body: some View {
        @Bindable var store = store

        NavigationSplitView {
            SidebarView(store: store)
                .navigationSplitViewColumnWidth(min: 220, ideal: 248, max: 300)
        } detail: {
            Group {
                switch store.selection {
                case .home:
                    HomeView(store: store)
                case .library(let filter):
                    LibraryView(store: store, filter: filter)
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .sheet(item: $store.presentedBook) { book in
            BookDetailView(book: book, store: store)
        }
    }
}
