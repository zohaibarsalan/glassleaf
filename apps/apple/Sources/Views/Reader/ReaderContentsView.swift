import SwiftUI

struct ReaderContentsView: View {
    let selectedChapter: Int
    let onSelect: (Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var chapters: [ReaderChapter] {
        guard !searchText.isEmpty else { return ReaderSample.chapters }
        return ReaderSample.chapters.filter { chapter in
            chapter.title.localizedStandardContains(searchText)
                || chapter.pages.contains(where: { $0.localizedStandardContains(searchText) })
        }
    }

    var body: some View {
        NavigationStack {
            List(chapters) { chapter in
                Button {
                    onSelect(chapter.id)
                } label: {
                    HStack(spacing: 14) {
                        Text(chapter.id + 1, format: .number)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .frame(width: 24)
                        Text(chapter.title)
                        Spacer()
                        if chapter.id == selectedChapter {
                            Image(systemName: "location.fill")
                                .foregroundStyle(.secondary)
                                .accessibilityLabel("Current chapter")
                        }
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Contents")
            .searchable(text: $searchText, prompt: "Search this book")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .frame(minWidth: 360, idealWidth: 480, minHeight: 420, idealHeight: 620)
        .presentationDetents([.medium, .large])
    }
}
