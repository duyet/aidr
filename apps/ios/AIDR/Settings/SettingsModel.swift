import AIDRKit
import Foundation
import Observation

/// What the notification rows show and do. The choices themselves live in UserDefaults.
@MainActor
@Observable
final class SettingsModel {
  enum TestState { case idle, sending, sent, failed }

  private(set) var authorization: NotifyAuthorization = .notDetermined
  private(set) var test: TestState = .idle

  private let scheduler = NotifyScheduler.shared
  private let snapshots = SnapshotStore()

  func refreshAuthorization() async {
    authorization = await scheduler.authorization()
  }

  /// Asks for permission the first time. False leaves the switch off.
  func requestPermission() async -> Bool {
    let granted = await scheduler.enable()
    authorization = granted ? .authorized : .denied
    return granted
  }

  func cancel() {
    scheduler.cancelDaily()
    test = .idle
  }

  func reschedule(lang: Lang) async {
    await RefreshJob.reschedule(snapshots: snapshots, notifier: scheduler, lang: lang)
  }

  func sendTest(lang: Lang) async {
    test = .sending
    let sent = await scheduler.sendTest(feed: snapshots.load(), lang: lang)
    test = sent ? .sent : .failed
  }
}
