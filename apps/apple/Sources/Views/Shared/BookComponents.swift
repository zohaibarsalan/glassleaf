import GlassleafDomain
import SwiftUI

enum BookCoverSize {
    case card
    case row
    case hero

    var dimensions: CGSize {
        switch self {
        case .card: CGSize(width: 150, height: 218)
        case .row: CGSize(width: 50, height: 72)
        case .hero: CGSize(width: 132, height: 192)
        }
    }
}

struct BookCoverView: View {
    let book: Book
    var size: BookCoverSize = .card

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(book.coverStyle.palette.background)

            Image(systemName: "leaf.fill")
                .font(.system(size: size == .row ? 24 : 58, weight: .ultraLight))
                .foregroundStyle(book.coverStyle.palette.ink.opacity(0.14))
                .rotationEffect(.degrees(-18))
                .offset(x: size == .row ? 20 : 76, y: size == .row ? -26 : -106)

            if size != .row {
                VStack(alignment: .leading, spacing: 5) {
                    Text(book.title)
                        .font(size == .hero ? .headline : .subheadline)
                        .fontWeight(.semibold)
                        .lineLimit(3)
                    Text(book.author.uppercased())
                        .font(.system(size: 8, weight: .semibold))
                        .tracking(0.7)
                        .lineLimit(1)
                        .opacity(0.78)
                }
                .foregroundStyle(book.coverStyle.palette.ink)
                .padding(size == .hero ? 16 : 13)
            }
        }
        .frame(width: size.dimensions.width, height: size.dimensions.height)
        .clipShape(.rect(cornerRadius: cornerRadius))
        .shadow(color: .black.opacity(0.14), radius: 9, y: 5)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(.black.opacity(0.07))
                .frame(width: 1)
                .padding(.vertical, 4)
        }
        .accessibilityHidden(true)
    }

    private var cornerRadius: CGFloat {
        size == .row ? 6 : 10
    }
}

struct BookCard: View {
    let book: Book
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 11) {
                BookCoverView(book: book)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text(book.title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(2)
                        if book.isFavorite {
                            Image(systemName: "star.fill")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .accessibilityLabel("Favorite")
                        }
                    }
                    Text(book.author)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if book.progress.fraction > 0 {
                    ProgressView(value: book.progress.fraction)
                        .tint(.primary)
                        .accessibilityLabel("Reading progress")
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows book details")
    }
}

struct BookRow: View {
    let book: Book
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                BookCoverView(book: book, size: .row)
                VStack(alignment: .leading, spacing: 4) {
                    Text(book.title)
                        .font(.headline)
                    Text(book.author)
                        .foregroundStyle(.secondary)
                    if let series = book.series {
                        Text(series)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                Spacer()
                if book.progress.fraction > 0 {
                    Text(book.progress.fraction, format: .percent.precision(.fractionLength(0)))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

private extension CoverStyle {
    var palette: (background: Color, ink: Color) {
        switch self {
        case .sage: (Color(red: 0.58, green: 0.67, blue: 0.56), Color(red: 0.11, green: 0.18, blue: 0.12))
        case .midnight: (Color(red: 0.12, green: 0.17, blue: 0.27), Color(red: 0.88, green: 0.89, blue: 0.84))
        case .clay: (Color(red: 0.71, green: 0.44, blue: 0.32), Color(red: 0.16, green: 0.08, blue: 0.05))
        case .linen: (Color(red: 0.84, green: 0.80, blue: 0.68), Color(red: 0.22, green: 0.18, blue: 0.12))
        case .ocean: (Color(red: 0.25, green: 0.50, blue: 0.58), Color(red: 0.05, green: 0.13, blue: 0.16))
        case .plum: (Color(red: 0.42, green: 0.25, blue: 0.38), Color(red: 0.94, green: 0.86, blue: 0.88))
        }
    }
}
