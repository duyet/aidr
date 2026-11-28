import Foundation
import UIKit
import UserNotifications
import os

public enum NotifyAuthorization: Sendable, Equatable {
  case notDetermined, denied, authorized
}

/// The slice of UNUserNotificationCenter the scheduler uses, so a unit test can
/// record what would be pending.
@MainActor
public protocol NotificationCentering: AnyObject {
  func authorization() async -> NotifyAuthorization
  func requestAuthorization() async -> Bool
  func add(_ request: UNNotificationRequest) async throws
  func removePending(_ identifiers: [String])
}

@MainActor
public final class SystemNotificationCenter: NotificationCentering {
  private let center = UNUserNotificationCenter.current()

  public init() {}

  public func authorization() async -> NotifyAuthorization {
    await withCheckedContinuation { continuation in
      center.getNotificationSettings { settings in
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: continuation.resume(returning: .authorized)
        case .denied: continuation.resume(returning: .denied)
        default: continuation.resume(returning: .notDetermined)
        }
      }
    }
  }

  public func requestAuthorization() async -> Bool {
    await withCheckedContinuation { continuation in
      center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
        continuation.resume(returning: granted)
      }
    }
  }

  public func add(_ request: UNNotificationRequest) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      center.add(request) { error in
        if let error { continuation.resume(throwing: error) } else { continuation.resume() }
      }
    }
  }

  public func removePending(_ identifiers: [String]) {
    center.removePendingNotificationRequests(withIdentifiers: identifiers)
  }
}

public enum NotifyError: Error, Equatable {
  case undecodableImage
}

/// Schedules the daily edition notification.
///
/// One request carries the latest edition (headline, "+ N tin nữa", thumbnail)
/// for the next time the reader chose. Three more, one per following day, say
/// only that the edition is ready, so a reader who stops opening the app and
/// whose background refresh never runs still gets a daily nudge without a stale
/// headline. Every refresh replaces all four under fixed identifiers.
@MainActor
public final class NotifyScheduler {
  public static let shared = NotifyScheduler()

  public static let dailyIDs = ["aidr.daily", "aidr.daily.1", "aidr.daily.2", "aidr.daily.3"]
  public static let testID = "aidr.test"

  public typealias ImageFetch = @Sendable (URL) async throws -> Data

  private static let log = Logger(subsystem: "oneni.aidr.app", category: "notify")

  private let center: NotificationCentering
  private let fetchImage: ImageFetch
  private let now: () -> Date
  private let calendar: Calendar
  private let defaults: UserDefaults

  public init(
    center: NotificationCentering = SystemNotificationCenter(),
    fetchImage: @escaping ImageFetch = NotifyScheduler.downloadImage,
    now: @escaping () -> Date = { Date() },
    calendar: Calendar = .current,
    defaults: UserDefaults = .standard
  ) {
    self.center = center
    self.fetchImage = fetchImage
    self.now = now
    self.calendar = calendar
    self.defaults = defaults
  }

  // MARK: Permission

  public func authorization() async -> NotifyAuthorization { await center.authorization() }

  /// Asks the system only when it has not been asked. True when notifications may be delivered.
  public func enable() async -> Bool {
    switch await center.authorization() {
    case .authorized: true
    case .denied: false
    case .notDetermined: await center.requestAuthorization()
    }
  }

  public func cancelDaily() { center.removePending(Self.dailyIDs) }

  // MARK: Scheduling

  /// Replaces the pending daily requests. Returns what was added.
  @discardableResult
  public func scheduleDaily(feed: Feed?, lang: Lang, minutes: Int) async -> [UNNotificationRequest] {
    let fires = fireDates(minutes: minutes, count: Self.dailyIDs.count)
    var requests: [UNNotificationRequest] = []
    for (index, fire) in fires.enumerated() {
      let content: NotifyContent
      if index == 0, let edition = feed.flatMap({ NotifyContent.edition($0, lang: lang) }) {
        content = edition
      } else {
        content = .generic(for: fire, lang: lang, timeZone: calendar.timeZone)
      }
      var parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
      parts.calendar = calendar
      parts.timeZone = calendar.timeZone
      let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
      requests.append(
        UNNotificationRequest(
          identifier: Self.dailyIDs[index], content: await makeContent(content), trigger: trigger))
    }
    center.removePending(Self.dailyIDs)
    var added: [UNNotificationRequest] = []
    for request in requests {
      do {
        try await center.add(request)
        added.append(request)
      } catch {
        Self.log.error("could not schedule \(request.identifier, privacy: .public): \(error.localizedDescription, privacy: .public)")
      }
    }
    return added
  }

  /// Reschedules when the reader turned the daily notification on and the system allows it.
  public func rescheduleIfEnabled(feed: Feed?, lang: Lang) async {
    guard NotifyPrefs.enabled(defaults), await center.authorization() == .authorized else { return }
    await scheduleDaily(feed: feed, lang: lang, minutes: NotifyPrefs.minutes(defaults))
  }

  /// "Send a test now": the same content, in two seconds. False when nothing was scheduled.
  public func sendTest(feed: Feed?, lang: Lang) async -> Bool {
    guard await center.authorization() == .authorized else { return false }
    let content =
      feed.flatMap { NotifyContent.edition($0, lang: lang) }
      ?? .generic(for: now(), lang: lang, timeZone: calendar.timeZone)
    let request = UNNotificationRequest(
      identifier: Self.testID, content: await makeContent(content),
      trigger: UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false))
    do {
      try await center.add(request)
      return true
    } catch {
      Self.log.error("test notification failed: \(error.localizedDescription, privacy: .public)")
      return false
    }
  }

  /// The next `count` occurrences of the chosen time, one per day.
  func fireDates(minutes: Int, count: Int) -> [Date] {
    let minutes = NotifyPrefs.clamp(minutes)
    let time = DateComponents(hour: minutes / 60, minute: minutes % 60, second: 0)
    guard let first = calendar.nextDate(after: now(), matching: time, matchingPolicy: .nextTime) else { return [] }
    return (0..<count).compactMap { calendar.date(byAdding: .day, value: $0, to: first) }
  }

  // MARK: Content

  private func makeContent(_ content: NotifyContent) async -> UNMutableNotificationContent {
    let out = UNMutableNotificationContent()
    out.title = content.title
    if let subtitle = content.subtitle { out.subtitle = subtitle }
    out.body = content.body
    out.threadIdentifier = content.threadID
    out.sound = .default
    if let id = content.storyID { out.userInfo = [NotifyContent.userInfoStoryKey: id] }
    out.attachments = await attachment(from: content.imageURLs)
    return out
  }

  /// The first image that downloads and decodes. A notification without a
  /// picture is better than none, so a failure here is logged, not thrown.
  private func attachment(from urls: [URL]) async -> [UNNotificationAttachment] {
    for url in urls {
      do {
        let data = try await fetchImage(url)
        return [try Self.makeAttachment(from: data)]
      } catch {
        Self.log.error("no banner image from \(url.host() ?? "?", privacy: .public): \(error.localizedDescription, privacy: .public)")
      }
    }
    return []
  }

  /// JPEG bytes no wider than `maxSide`. Publisher images are often WebP, which a
  /// notification attachment rejects, and can be several MB.
  public static func jpegData(from data: Data, maxSide: CGFloat = 1024) throws -> Data {
    guard let image = UIImage(data: data), image.size.width > 0, image.size.height > 0 else {
      throw NotifyError.undecodableImage
    }
    let scale = min(1, maxSide / max(image.size.width, image.size.height))
    let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).jpegData(withCompressionQuality: 0.8) { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      image.draw(in: CGRect(origin: .zero, size: size))
    }
  }

  /// A uniquely named temp file: the system moves it when the request is added.
  static func makeAttachment(from data: Data) throws -> UNNotificationAttachment {
    let jpeg = try jpegData(from: data)
    let directory = FileManager.default.temporaryDirectory.appending(path: "aidr-notify", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let file = directory.appending(path: "\(UUID().uuidString).jpg")
    try jpeg.write(to: file)
    return try UNNotificationAttachment(identifier: "image", url: file)
  }

  nonisolated public static func downloadImage(_ url: URL) async throws -> Data {
    var request = URLRequest(url: url)
    request.timeoutInterval = 10
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw URLError(.badServerResponse)
    }
    return data
  }
}
