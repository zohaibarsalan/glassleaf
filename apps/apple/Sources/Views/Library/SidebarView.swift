import GlassleafDomain
import SwiftUI

struct SidebarView: View {
    @Bindable var store: LibraryStore

    var body: some View {
        List(selection: $store.selection) {
            Section {
                sidebarRow(.home)
                sidebarRow(.library(.all))
            }

            Section("Reading") {
                sidebarRow(.library(.reading), count: count(for: .reading))
                sidebarRow(.library(.unread), count: count(for: .unread))
                sidebarRow(.library(.finished), count: count(for: .finished))
                sidebarRow(.library(.favorites), count: count(for: .favorites))
            }

            Section("Organize") {
                Label("Collections", systemImage: "rectangle.stack")
                Label("Folders", systemImage: "folder")
                Label("Tags", systemImage: "tag")
                Label("Series", systemImage: "square.stack.3d.up")
            }
            .foregroundStyle(.secondary)
        }
        .navigationTitle("Glassleaf")
        .safeAreaInset(edge: .bottom) {
            syncStatus
        }
    }

    private func sidebarRow(_ destination: SidebarDestination, count: Int? = nil) -> some View {
        HStack {
            Label(destination.title, systemImage: destination.systemImage)
            Spacer()
            if let count {
                Text(count, format: .number)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .tag(destination)
    }

    private func count(for filter: LibraryFilter) -> Int {
        store.books.filter(filter.includes).count
    }

    private var syncStatus: some View {
        HStack(spacing: 10) {
            Image(systemName: "internaldrive")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text("On This Device")
                    .font(.caption.weight(.medium))
                Text("Local library")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
