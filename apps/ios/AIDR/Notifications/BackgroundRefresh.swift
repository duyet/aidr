import AIDRKit
import BackgroundTasks
import Foundation
import os

/// App refresh: fetch the edition, reschedule the notification, warm the images,
/// and ask iOS for the next run. iOS decides when (or whether) it runs.
enum BackgroundRefresh {
  private static let log = Logger(subsystem: "oneni.aidr.app", category: "refresh")

  /// Foreground refreshes closer together than this are skipped.
  static let foregroundInterval: TimeInterval = 120

  @MainActor
  static func handle() async {
    schedule()
    await RefreshJob.run()
  }

  /// Opening the app, and coming back to it.
  @MainActor
  static func foreground() async {
    let defaults = UserDefaults.standard
    let now = Date().timeIntervalSince1970
    guard now - defaults.double(forKey: SettingsKey.lastRefresh) > foregroundInterval else { return }
    defaults.set(now, forKey: SettingsKey.lastRefresh)
    await RefreshJob.run()
  }

  static func schedule() {
    let request = BGAppRefreshTaskRequest(identifier: RefreshJob.taskID)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      // The simulator and a phone with Background App Refresh off refuse; the foreground path still works.
      log.notice("background refresh not scheduled: \(error.localizedDescription, privacy: .public)")
    }
  }
}
