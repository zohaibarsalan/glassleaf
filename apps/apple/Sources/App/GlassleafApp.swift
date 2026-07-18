import SwiftUI

@main
struct GlassleafApp: App {
    var body: some Scene {
#if os(macOS)
        WindowGroup {
            AppRootView()
                .frame(minWidth: 860, minHeight: 640)
        }
        .defaultSize(width: 1180, height: 820)
        .windowResizability(.contentMinSize)
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unifiedCompact(showsTitle: false))
#else
        WindowGroup {
            AppRootView()
        }
#endif
    }
}
