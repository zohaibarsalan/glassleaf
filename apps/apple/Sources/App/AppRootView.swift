import SwiftUI
import UniformTypeIdentifiers

struct AppRootView: View {
    @State private var store = LibraryStore.initial

    @ViewBuilder
    var body: some View {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--reader-preview"),
           let readerBook = store.readerBook {
            ReaderView(book: readerBook, store: store)
        } else {
            libraryRoot
        }
#else
        libraryRoot
#endif
    }

    private var libraryRoot: some View {
        @Bindable var store = store

        return NavigationSplitView {
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
        .modifier(ReaderPresentationModifier(store: store))
        .fileImporter(
            isPresented: $store.showsImporter,
            allowedContentTypes: [.epub],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case .success(let urls):
                Task { await store.importBooks(from: urls) }
            case .failure:
                store.importAlert = .init(
                    title: "Import Failed",
                    message: "Glassleaf couldn’t access the selected files."
                )
            }
        }
        .alert(item: $store.importAlert) { issue in
            Alert(
                title: Text(issue.title),
                message: Text(issue.message),
                dismissButton: .default(Text("OK"))
            )
        }
        .overlay(alignment: .bottom) {
            if store.isImporting {
                ProgressView("Importing…")
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .capsule)
                    .padding()
            }
        }
        .task {
            await store.loadLibrary()
        }
    }
}

private struct ReaderPresentationModifier: ViewModifier {
    @Bindable var store: LibraryStore

    func body(content: Content) -> some View {
#if os(iOS)
        content.fullScreenCover(item: $store.readerBook) { book in
            ReaderView(book: book, store: store)
        }
#else
        content.sheet(item: $store.readerBook) { book in
            ReaderView(book: book, store: store)
                .frame(minWidth: 720, idealWidth: 1_000, minHeight: 620, idealHeight: 760)
        }
#endif
    }
}
