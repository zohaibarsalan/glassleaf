import CloudKit
import Foundation

extension Notification.Name {
    static let glassleafCloudKitDidChange = Notification.Name("GlassleafCloudKitDidChange")
}

#if os(iOS)
import UIKit

final class CloudKitNotificationBridge: NSObject, UIApplicationDelegate {
    @MainActor
    static func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        guard CKNotification(fromRemoteNotificationDictionary: userInfo)?.subscriptionID
                == CloudKitRecordCodec.subscriptionID else {
            completionHandler(.noData)
            return
        }
        NotificationCenter.default.post(name: .glassleafCloudKitDidChange, object: nil)
        completionHandler(.newData)
    }
}
#elseif os(macOS)
import AppKit

final class CloudKitNotificationBridge: NSObject, NSApplicationDelegate {
    @MainActor
    static func registerForRemoteNotifications() {
        NSApplication.shared.registerForRemoteNotifications()
    }

    func application(_ application: NSApplication, didReceiveRemoteNotification userInfo: [String: Any]) {
        guard CKNotification(fromRemoteNotificationDictionary: userInfo)?.subscriptionID
                == CloudKitRecordCodec.subscriptionID else { return }
        NotificationCenter.default.post(name: .glassleafCloudKitDidChange, object: nil)
    }
}
#endif
