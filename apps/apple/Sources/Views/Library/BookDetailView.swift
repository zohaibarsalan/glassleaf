import GlassleafDomain
import SwiftUI

struct BookDetailView: View {
    let book: Book
    @Bindable var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var showsEditor = false

    private var currentBook: Book {
        store.books.first(where: { $0.id == book.id }) ?? book
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    BookCoverView(book: currentBook, size: .hero)

                    VStack(spacing: 6) {
                        Text(currentBook.title)
                            .font(.title2.weight(.bold))
                            .multilineTextAlignment(.center)
                        Text(currentBook.author)
                            .font(.title3)
                            .foregroundStyle(.secondary)
                        if let series = currentBook.series {
                            Text(series)
                                .font(.subheadline)
                                .foregroundStyle(.tertiary)
                        }
                    }

                    HStack(spacing: 10) {
                        Button {
                            store.startReading(currentBook)
                        } label: {
                            Label(currentBook.progress.fraction > 0 ? "Continue" : "Read", systemImage: "book.pages")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            store.toggleFavorite(for: currentBook.id)
                        } label: {
                            Image(systemName: currentBook.isFavorite ? "star.fill" : "star")
                        }
                        .buttonStyle(.bordered)
                        .accessibilityLabel(currentBook.isFavorite ? "Remove from Favorites" : "Add to Favorites")
                    }

                    if currentBook.progress.fraction > 0 {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack {
                                Text("Progress")
                                Spacer()
                                Text(currentBook.progress.fraction, format: .percent.precision(.fractionLength(0)))
                                    .monospacedDigit()
                            }
                            .font(.subheadline.weight(.medium))
                            ProgressView(value: currentBook.progress.fraction)
                        }
                    }

                    if !currentBook.summary.isEmpty {
                        Text(currentBook.summary)
                            .font(.body)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if !currentBook.tags.isEmpty {
                        ViewThatFits {
                            HStack {
                                tagViews
                            }
                            VStack(alignment: .leading) {
                                tagViews
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .frame(maxWidth: 520)
                .padding(28)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Book Details")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Edit", systemImage: "pencil") { showsEditor = true }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .frame(minWidth: 360, idealWidth: 520, minHeight: 540, idealHeight: 680)
        .sheet(isPresented: $showsEditor) {
            BookMetadataEditor(book: currentBook, store: store)
        }
    }

    @ViewBuilder
    private var tagViews: some View {
        ForEach(currentBook.tags.sorted(), id: \.self) { tag in
            Text(tag)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.quaternary, in: .capsule)
        }
    }
}
