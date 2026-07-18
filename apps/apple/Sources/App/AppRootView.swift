import SwiftUI
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
        .onOpenURL { url in
            guard url.pathExtension.lowercased() == "epub" else { return }
            Task { await store.importBooks(from: [url]) }
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
#if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--open-first-book"), let book = store.books.first {
                store.startReading(book)
            }
#endif
        }
    }

    private var libraryRoot: some View {
        @Bindable var store = store

        return NavigationSplitView {
            SidebarView(store: store)
                .navigationSplitViewColumnWidth(min: 236, ideal: 264, max: 320)
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
        .modifier(LibraryInitialFocusModifier())
        .dropDestination(for: URL.self) { urls, _ in
            let books = urls.filter { $0.pathExtension.lowercased() == "epub" }
            guard !books.isEmpty else { return false }
            Task { await store.importBooks(from: books) }
            return true
        }
        .sheet(item: $store.presentedBook) { book in
            BookDetailView(book: book, store: store)
        }
    }
}

private struct LibraryInitialFocusModifier: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
#if os(macOS)
        content.background(InitialFocusClearer().frame(width: 0, height: 0))
#else
        content
#endif
    }
}

#if os(macOS)
private struct InitialFocusClearer: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { FocusClearingView() }
    func updateNSView(_ nsView: NSView, context: Context) {}

    private final class FocusClearingView: NSView {
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            DispatchQueue.main.async { [weak self] in
                self?.window?.makeFirstResponder(nil)
            }
        }
    }
}
#endif
