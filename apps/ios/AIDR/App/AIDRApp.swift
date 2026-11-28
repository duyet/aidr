import AIDRKit
import SwiftUI
import UserNotifications

@main
struct AIDRApp: App {
  /// UNUserNotificationCenter keeps its delegate weakly, so the app holds it.
  private let notifyDelegate = NotifyDelegate()

  init() {
    // Thumbnails go through URLCache, so a relaunch paints them offline.
    URLCache.shared = URLCache(memoryCapacity: 50 * 1024 * 1024, diskCapacity: 200 * 1024 * 1024)
    // Set before launch finishes so a tap that cold-starts the app is delivered.
    UNUserNotificationCenter.current().delegate = notifyDelegate
    SettingsHooks.applyPrefs()
  }

  var body: some Scene {
    WindowGroup {
      RootHost()
    }
    .backgroundTask(.appRefresh(RefreshJob.taskID)) {
      await BackgroundRefresh.handle()
    }
  }
}
