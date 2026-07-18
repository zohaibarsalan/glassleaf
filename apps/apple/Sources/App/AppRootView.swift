import SwiftUI
import UniformTypeIdentifiers

struct AppRootView: View {
    @State private var store = LibraryStore.initial
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @ViewBuilder
    var body: some View {
        @Bindable var store = store

        ZStack {
            if let readerBook = store.readerBook {
                ReaderView(book: readerBook, store: store)
                    .transition(.opacity)
                    .zIndex(1)
            } else {
                libraryRoot
                    .transition(.opacity)
            }
        }
        .animation(
            reduceMotion ? nil : .smooth(duration: 0.24),
            value: store.readerBook?.id
        )
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
        .fileExporter(
            isPresented: $store.showsExporter,
            document: store.exportDocument,
            contentType: .glassleafLibrary,
            defaultFilename: "Glassleaf Library"
        ) { result in
            if case .failure(let error) = result {
                store.importAlert = .init(title: "Export Failed", message: error.localizedDescription)
            }
            store.exportDocument = nil
        }
        .alert(item: $store.importAlert) { issue in
            Alert(
                title: Text(issue.title),
                message: Text(issue.message),
                dismissButton: .default(Text("OK"))
            )
        }
        .overlay(alignment: .bottom) {
            if store.isImporting || store.isExporting {
                ProgressView(store.isImporting ? "Importing…" : "Preparing Export…")
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
                default:
                    LibraryView(store: store, destination: store.selection)
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .sheet(item: $store.presentedBook) { book in
            BookDetailView(book: book, store: store)
        }
    }
}
