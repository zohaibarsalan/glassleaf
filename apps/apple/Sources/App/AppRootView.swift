import SwiftUI
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

struct AppRootView: View {
    @State private var store = LibraryStore.initial
    @State private var readerControlsVisible = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    @ViewBuilder
    var body: some View {
        @Bindable var store = store

        ZStack {
#if os(macOS)
            if let readerBook = store.readerBook {
                ReaderView(book: readerBook, store: store)
                    .transition(.opacity)
            } else {
                libraryRoot
                    .transition(.opacity)
            }
#else
            libraryRoot
                .allowsHitTesting(store.readerBook == nil)
                .accessibilityHidden(store.readerBook != nil)

            if let readerBook = store.readerBook {
                ReaderView(book: readerBook, store: store)
                    .transition(.opacity)
                    .zIndex(1)
            }
#endif
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onPreferenceChange(ReaderChromeVisibilityPreferenceKey.self) { value in
            readerControlsVisible = value
        }
        .modifier(
            AppReaderSystemChromeModifier(
                readerPresented: store.readerBook != nil,
                controlsVisible: readerControlsVisible
            )
        )
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
        .fileImporter(
            isPresented: $store.showsRestoreImporter,
            allowedContentTypes: [.glassleafLibrary],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first { store.proposeRestore(from: url) }
            case .failure(let error):
                store.importAlert = .init(title: "Restore Failed", message: error.localizedDescription)
            }
        }
        .onOpenURL { url in
            switch url.pathExtension.lowercased() {
            case "epub": Task { await store.importBooks(from: [url]) }
            case "glassleaflibrary": store.proposeRestore(from: url)
            default: break
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
        .confirmationDialog(
            "Replace Local Library?",
            isPresented: Binding(
                get: { store.pendingRestoreURL != nil },
                set: { if !$0 { store.cancelRestore() } }
            ),
            titleVisibility: .visible
        ) {
            Button("Restore Library", role: .destructive) {
                Task { await store.restoreLibrary() }
            }
            Button("Cancel", role: .cancel) { store.cancelRestore() }
        } message: {
            Text("Glassleaf will validate the package first, preserve the current library as a local backup, and then replace it with the restored library.")
        }
        .alert(
            store.importAlert?.title ?? "Glassleaf",
            isPresented: Binding(
                get: { store.importAlert != nil },
                set: { if !$0 { store.importAlert = nil } }
            )
        ) {
            Button("OK") { store.importAlert = nil }
        } message: {
            Text(store.importAlert?.message ?? "")
        }
        .overlay(alignment: .bottom) {
            if store.isImporting || store.isExporting || store.isRestoring {
                ProgressView(operationTitle)
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
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, store.isICloudSyncEnabled else { return }
            Task { await store.synchronizeWithICloud(reportFailure: false) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .glassleafCloudKitDidChange)) { _ in
            guard store.isICloudSyncEnabled else { return }
            Task { await store.synchronizeWithICloud(reportFailure: false) }
        }
    }

    private var operationTitle: String {
        if store.isRestoring { return "Validating and Restoring…" }
        if store.isImporting { return "Importing…" }
        return "Preparing Export…"
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
