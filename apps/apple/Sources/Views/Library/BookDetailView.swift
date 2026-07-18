import GlassleafDomain
import SwiftUI

struct BookDetailView: View {
    let book: Book
    @Bindable var store: LibraryStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    BookCoverView(book: book, size: .hero)

                    VStack(spacing: 6) {
                        Text(book.title)
                            .font(.title2.weight(.bold))
                            .multilineTextAlignment(.center)
                        Text(book.author)
                            .font(.title3)
                            .foregroundStyle(.secondary)
                        if let series = book.series {
                            Text(series)
                                .font(.subheadline)
                                .foregroundStyle(.tertiary)
                        }
                    }

                    HStack(spacing: 10) {
                        Button {
                            // Reader presentation is added in the next vertical slice.
                        } label: {
                            Label(book.progress.fraction > 0 ? "Continue" : "Read", systemImage: "book.pages")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            store.toggleFavorite(for: book.id)
                        } label: {
                            Image(systemName: book.isFavorite ? "star.fill" : "star")
                        }
                        .buttonStyle(.bordered)
                        .accessibilityLabel(book.isFavorite ? "Remove from Favorites" : "Add to Favorites")
                    }

                    if book.progress.fraction > 0 {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack {
                                Text("Progress")
                                Spacer()
                                Text(book.progress.fraction, format: .percent.precision(.fractionLength(0)))
                                    .monospacedDigit()
                            }
                            .font(.subheadline.weight(.medium))
                            ProgressView(value: book.progress.fraction)
                        }
                    }

                    if !book.summary.isEmpty {
                        Text(book.summary)
                            .font(.body)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if !book.tags.isEmpty {
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
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .frame(minWidth: 360, idealWidth: 520, minHeight: 540, idealHeight: 680)
    }

    @ViewBuilder
    private var tagViews: some View {
        ForEach(book.tags.sorted(), id: \.self) { tag in
            Text(tag)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.quaternary, in: .capsule)
        }
    }
}
