import SwiftUI

@main
struct GlassleafApp: App {
    var body: some Scene {
#if os(macOS)
        WindowGroup {
            AppRootView()
        }
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unifiedCompact(showsTitle: false))
#else
        WindowGroup {
            AppRootView()
        }
#endif
    }
}
