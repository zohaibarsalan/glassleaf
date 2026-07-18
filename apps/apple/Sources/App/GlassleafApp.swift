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
#else
        WindowGroup {
            AppRootView()
        }
#endif
    }
}
