import AIDRKit
import UserNotifications

/// Shows the banner while the app is open, and hands a tapped notification's
/// story to `NotifyInbox`.
final class NotifyDelegate: NSObject, UNUserNotificationCenterDelegate {
  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping @Sendable () -> Void
  ) {
    if let id = NotifyContent.storyID(from: response.notification.request.content.userInfo) {
      Task { @MainActor in NotifyInbox.shared.open(id) }
    }
    completionHandler()
  }
}
