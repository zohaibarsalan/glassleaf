import SwiftUI

struct AppRootView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Your library, beautifully organized",
                systemImage: "books.vertical",
                description: Text("Import a DRM-free EPUB to begin reading.")
            )
            .navigationTitle("Glassleaf")
        }
    }
}
