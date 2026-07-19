import SwiftUI

struct CloudSyncSettingsView: View {
    @Bindable var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var confirmsDisable = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: statusIcon)
                            .font(.title2)
                            .foregroundStyle(statusColor)
                            .frame(width: 34, height: 34)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(store.cloudSyncState.title)
                                .font(.headline)
                            Text(store.cloudSyncState.detail)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("What Syncs") {
                    Label("Books and EPUB files", systemImage: "books.vertical")
                    Label("Folders, collections, tags, and series", systemImage: "square.stack.3d.up")
                    Label("Reading position, bookmarks, and notes", systemImage: "bookmark")
                    Label("Reader appearance", systemImage: "textformat.size")
                }

                Section {
                    if store.isICloudSyncEnabled {
                        Button {
                            Task { await store.synchronizeWithICloud() }
                        } label: {
                            Label("Sync Now", systemImage: "arrow.trianglehead.2.clockwise.rotate.90.icloud")
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                        .disabled(isBusy)

                        Button("Turn Off iCloud Sync", role: .destructive) {
                            confirmsDisable = true
                        }
                    } else {
                        Button {
                            Task { await store.enableICloudSync() }
                        } label: {
                            Label("Enable iCloud Sync", systemImage: "icloud")
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isBusy)
                    }
                } footer: {
                    Text("Your local library remains available offline. Turning sync off keeps the downloaded books on this device and doesn’t delete anything from iCloud.")
                }
            }
            .formStyle(.grouped)
            .navigationTitle("iCloud Sync")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .frame(minWidth: 420, idealWidth: 480, minHeight: 480, idealHeight: 560)
        .confirmationDialog("Turn Off iCloud Sync?", isPresented: $confirmsDisable) {
            Button("Turn Off Sync", role: .destructive) { store.disableICloudSync() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Books already downloaded to this device will stay here.")
        }
    }

    private var isBusy: Bool {
        switch store.cloudSyncState {
        case .preparing, .syncing: true
        default: false
        }
    }

    private var statusIcon: String {
        switch store.cloudSyncState {
        case .localOnly: "internaldrive"
        case .preparing, .syncing: "icloud.and.arrow.up"
        case .synced: "checkmark.icloud.fill"
        case .failed: "exclamationmark.icloud"
        }
    }

    private var statusColor: Color {
        switch store.cloudSyncState {
        case .synced: .green
        case .failed: .orange
        default: .secondary
        }
    }
}
