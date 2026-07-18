import GlassleafDomain
import SwiftUI

struct HomeView: View {
    @Bindable var store: LibraryStore

    private var activeBooks: [Book] {
        store.books.filter { $0.deletedAt == nil }
    }

    private var currentlyReading: [Book] {
        Array(store.books(matching: .library(.reading)).prefix(4))
    }

    private var recentlyAdded: [Book] {
        Array(activeBooks.sorted { $0.dateAdded > $1.dateAdded }.prefix(6))
    }

    var body: some View {
        Group {
            if activeBooks.isEmpty {
                emptyLibrary
            } else {
                populatedHome
            }
        }
        .navigationTitle("Home")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Import", systemImage: "plus") {
                    store.requestImport()
                }
                .controlSize(.large)
                .help("Import an EPUB")
            }
        }
    }

    private var populatedHome: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 34) {
                welcome

                if let leadBook = currentlyReading.first {
                    ContinueReadingCard(book: leadBook) {
                        store.showDetails(for: leadBook)
                    }
                }

                BookShelf(
                    title: "Recently Added",
                    subtitle: "Your newest books, ready when you are",
                    books: recentlyAdded,
                    onSelect: store.showDetails
                )

                BookShelf(
                    title: "Favorites",
                    subtitle: "The books you want close by",
                    books: Array(activeBooks.filter(\.isFavorite).prefix(6)),
                    onSelect: store.showDetails
                )
            }
            .padding(.bottom, 40)
        }
        .contentMargins(.horizontal, 28, for: .scrollContent)
        .contentMargins(.top, 20, for: .scrollContent)
    }

    private var emptyLibrary: some View {
        ContentUnavailableView {
            Label("Your library starts here", systemImage: "books.vertical")
        } description: {
            Text("Import DRM-free EPUBs. Glassleaf keeps the originals on this device.")
        } actions: {
            Button("Import EPUBs", systemImage: "plus") {
                store.requestImport()
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Good evening")
                .font(.largeTitle.weight(.bold))
            Text("Pick up where you left off.")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ContinueReadingCard: View {
    let book: Book
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 22) {
                BookCoverView(book: book, size: .hero)

                VStack(alignment: .leading, spacing: 10) {
                    Text("CONTINUE READING")
                        .font(.caption.weight(.semibold))
                        .tracking(0.7)
                        .foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(book.title)
                            .font(.title2.weight(.semibold))
                            .lineLimit(2)
                        Text(book.author)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: 2)

                    ProgressView(value: book.progress.fraction)
                        .tint(.primary)
                    Text(book.progress.fraction, format: .percent.precision(.fractionLength(0)))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)

                Spacer(minLength: 0)
            }
            .padding(18)
            .frame(maxWidth: 720, minHeight: 230, alignment: .leading)
            .background(.quaternary.opacity(0.55), in: .rect(cornerRadius: 24))
            .contentShape(.rect(cornerRadius: 24))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Shows book details")
    }
}

private struct BookShelf: View {
    let title: String
    let subtitle: String
    let books: [Book]
    let onSelect: (Book) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.title2.weight(.bold))
                Text(subtitle)
                    .foregroundStyle(.secondary)
            }

            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 20) {
                    ForEach(books) { book in
                        BookCard(book: book) {
                            onSelect(book)
                        }
                        .frame(width: 150)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }
}
