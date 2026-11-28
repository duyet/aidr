import AIDRKit
import Foundation
import Testing
import UIKit
import UserNotifications

@MainActor
final class FakeCenter: NotificationCentering {
  var status: NotifyAuthorization = .authorized
  var grants = true
  private(set) var asked = 0
  /// What a real center would hold as pending: adding an id replaces it.
  private(set) var pending: [UNNotificationRequest] = []

  func authorization() async -> NotifyAuthorization { status }

  func requestAuthorization() async -> Bool {
    asked += 1
    status = grants ? .authorized : .denied
    return grants
  }

  func add(_ request: UNNotificationRequest) async throws {
    pending.removeAll { $0.identifier == request.identifier }
    pending.append(request)
  }

  func removePending(_ identifiers: [String]) {
    pending.removeAll { identifiers.contains($0.identifier) }
  }
}

actor URLLog {
  private(set) var urls: [URL] = []
  func add(_ url: URL) { urls.append(url) }
}

@MainActor
struct NotifyTests {
  /// Ho Chi Minh City, the reader the VI strings are for.
  static let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    return calendar
  }()

  /// 2026-11-28 at hour:minute, local.
  static func date(_ hour: Int, _ minute: Int = 0) -> Date {
    calendar.date(from: DateComponents(year: 2026, month: 11, day: 28, hour: hour, minute: minute))!
  }

  nonisolated static func png(width: Int = 64, height: Int = 40) -> Data {
    let size = CGSize(width: width, height: height)
    return UIGraphicsImageRenderer(size: size).pngData { context in
      UIColor.systemYellow.setFill()
      context.fill(CGRect(origin: .zero, size: size))
    }
  }

  func scheduler(
    _ center: FakeCenter, now: Date = NotifyTests.date(6), defaults: UserDefaults = UserDefaults(suiteName: UUID().uuidString)!,
    fetch: @escaping NotifyScheduler.ImageFetch = { _ in NotifyTests.png() }
  ) -> NotifyScheduler {
    NotifyScheduler(center: center, fetchImage: fetch, now: { now }, calendar: Self.calendar, defaults: defaults)
  }

  func day(_ request: UNNotificationRequest) throws -> DateComponents {
    let trigger = try #require(request.trigger as? UNCalendarNotificationTrigger)
    #expect(!trigger.repeats, "each request is one occurrence; a repeat would show a stale headline")
    return trigger.dateComponents
  }

  // MARK: The edition request

  @Test func vietnameseEditionRequestCarriesTheTopBullet() async throws {
    let feed = try Fixtures.feed()
    let tldr = try #require(feed.tldr)
    let top = try #require(Digest.bullets(tldr, lang: .vi).first)
    let center = FakeCenter()
    let log = URLLog()
    let image = Self.png()
    let sut = scheduler(center) { url in
      await log.add(url)
      return image
    }

    await sut.scheduleDaily(feed: feed, lang: .vi, minutes: 7 * 60)

    let request = try #require(center.pending.first { $0.identifier == "aidr.daily" }, "the edition request is missing")
    let at = try day(request)
    #expect([at.year, at.month, at.day, at.hour, at.minute] == [2026, 11, 28, 7, 0], "next 07:00 is later today")
    let content = request.content
    #expect(content.title == "AI;DR · Thứ Bảy 28/11")
    #expect(content.body == top.text)
    #expect(content.subtitle == "+ 7 tin nữa")
    #expect(content.threadIdentifier == "aidr.edition.2026-11-28")
    #expect(content.userInfo["storyId"] as? String == top.itemIds.first)
    #expect(content.attachments.count == 1, "the banner thumbnail is missing")
    #expect(content.attachments.first?.type == "public.jpeg")
    let heroURL = try #require(top.imageUrl.flatMap(URL.init(string:)))
    #expect(await log.urls == [heroURL])
  }

  @Test func englishEditionUsesTheEnglishBullet() async throws {
    let feed = try Fixtures.feed()
    let top = try #require(Digest.bullets(feed.tldr, lang: .en).first)
    let center = FakeCenter()
    await scheduler(center).scheduleDaily(feed: feed, lang: .en, minutes: 7 * 60)
    let content = try #require(center.pending.first { $0.identifier == "aidr.daily" }).content
    #expect(content.title == "AI;DR · Saturday, Nov 28")
    #expect(content.body == top.text)
    #expect(content.subtitle == "+ 7 more stories")
  }

  @Test func timeAlreadyPassedTodayMeansTomorrow() async throws {
    let center = FakeCenter()
    await scheduler(center, now: Self.date(8)).scheduleDaily(feed: try Fixtures.feed(), lang: .en, minutes: 7 * 60)
    let first = try #require(center.pending.first { $0.identifier == "aidr.daily" })
    let at = try day(first)
    #expect([at.month, at.day, at.hour, at.minute] == [11, 29, 7, 0])
  }

  @Test func chosenTimeIsUsed() async throws {
    let center = FakeCenter()
    await scheduler(center).scheduleDaily(feed: try Fixtures.feed(), lang: .en, minutes: 18 * 60 + 30)
    let first = try #require(center.pending.first { $0.identifier == "aidr.daily" })
    let at = try day(first)
    #expect([at.day, at.hour, at.minute] == [28, 18, 30])
  }

  // MARK: Fallback days

  @Test func followingDaysSayOnlyThatTheEditionIsReady() async throws {
    let center = FakeCenter()
    await scheduler(center).scheduleDaily(feed: try Fixtures.feed(), lang: .vi, minutes: 7 * 60)
    #expect(center.pending.map(\.identifier).sorted() == NotifyScheduler.dailyIDs.sorted())
    let next = try #require(center.pending.first { $0.identifier == "aidr.daily.1" })
    #expect(next.content.title == "AI;DR · Chủ Nhật 29/11")
    #expect(next.content.body == "Bản tin AI;DR hôm nay đã sẵn sàng.")
    #expect(next.content.attachments.isEmpty)
    #expect(next.content.userInfo["storyId"] == nil)
    let at = try day(next)
    #expect(at.day == 29)
  }

  @Test func vietnameseNeverFallsBackToEnglishText() async throws {
    let english = #"{"text":"OpenAI ships a model","item_ids":["a"]}"#
    let feed = try APIClient.decode(
      Feed.self,
      from: Data(#"{"tldr":{"date":"2026-11-28","bullets_en":[\#(english),\#(english)],"bullets_vi":[\#(english),\#(english)]},"days":[]}"#.utf8))
    let center = FakeCenter()
    await scheduler(center).scheduleDaily(feed: feed, lang: .vi, minutes: 7 * 60)
    #expect(center.pending.count == 4)
    for request in center.pending {
      #expect(request.content.body == "Bản tin AI;DR hôm nay đã sẵn sàng.", "\(request.identifier) leaked English")
    }
  }

  // MARK: Failures and idempotence

  @Test func failedImageDownloadStillSchedulesWithoutPicture() async throws {
    struct Offline: Error {}
    let center = FakeCenter()
    await scheduler(center) { _ in throw Offline() }.scheduleDaily(feed: try Fixtures.feed(), lang: .en, minutes: 7 * 60)
    let request = try #require(center.pending.first { $0.identifier == "aidr.daily" })
    #expect(request.content.attachments.isEmpty)
    #expect(!request.content.body.isEmpty)
  }

  @Test func undecodableImageIsSkipped() async throws {
    let center = FakeCenter()
    await scheduler(center) { _ in Data("not an image".utf8) }.scheduleDaily(feed: try Fixtures.feed(), lang: .en, minutes: 7 * 60)
    let first = try #require(center.pending.first { $0.identifier == "aidr.daily" })
    #expect(first.content.attachments.isEmpty)
  }

  @Test func reschedulingReplacesInsteadOfStacking() async throws {
    let feed = try Fixtures.feed()
    let center = FakeCenter()
    let sut = scheduler(center)
    await sut.scheduleDaily(feed: feed, lang: .vi, minutes: 7 * 60)
    await sut.scheduleDaily(feed: feed, lang: .vi, minutes: 9 * 60)
    #expect(center.pending.count == 4)
    let first = try #require(center.pending.first { $0.identifier == "aidr.daily" })
    let hour = try day(first).hour
    #expect(hour == 9)
  }

  @Test func largeImagesAreScaledDownToJpeg() throws {
    let jpeg = try NotifyScheduler.jpegData(from: Self.png(width: 3000, height: 2000))
    let image = try #require(UIImage(data: jpeg))
    #expect(max(image.size.width, image.size.height) <= 1024)
    #expect(jpeg.starts(with: [0xFF, 0xD8]), "a JPEG, whatever the source format")
    #expect(throws: NotifyError.undecodableImage) { try NotifyScheduler.jpegData(from: Data("x".utf8)) }
  }

  // MARK: Permission and the switch

  @Test func rescheduleHonorsTheSwitchAndThePermission() async throws {
    let feed = try Fixtures.feed()
    let defaults = UserDefaults(suiteName: UUID().uuidString)!
    let center = FakeCenter()
    let sut = scheduler(center, defaults: defaults)

    await sut.rescheduleIfEnabled(feed: feed, lang: .en)
    #expect(center.pending.isEmpty, "switch is off")

    defaults.set(true, forKey: SettingsKey.notifyEnabled)
    center.status = .denied
    await sut.rescheduleIfEnabled(feed: feed, lang: .en)
    #expect(center.pending.isEmpty, "the system denies notifications")

    center.status = .authorized
    defaults.set(8 * 60, forKey: SettingsKey.notifyMinutes)
    await sut.rescheduleIfEnabled(feed: feed, lang: .en)
    #expect(center.pending.count == 4)
    let first = try #require(center.pending.first { $0.identifier == "aidr.daily" })
    let hour = try day(first).hour
    #expect(hour == 8)

    sut.cancelDaily()
    #expect(center.pending.isEmpty)
  }

  @Test func permissionIsAskedOnlyWhenNotDeterminedYet() async {
    let center = FakeCenter()
    center.status = .notDetermined
    let sut = scheduler(center)
    #expect(await sut.enable())
    #expect(center.asked == 1)
    #expect(await sut.enable())
    #expect(center.asked == 1, "already authorized")

    let denied = FakeCenter()
    denied.status = .denied
    #expect(await scheduler(denied).enable() == false)
    #expect(denied.asked == 0, "the system alert only shows once; Settings is the way back")

    let refusing = FakeCenter()
    refusing.status = .notDetermined
    refusing.grants = false
    #expect(await scheduler(refusing).enable() == false)
  }

  @Test func testNotificationFiresSoonWithTheSameContent() async throws {
    let feed = try Fixtures.feed()
    let center = FakeCenter()
    #expect(await scheduler(center).sendTest(feed: feed, lang: .vi))
    let request = try #require(center.pending.first { $0.identifier == NotifyScheduler.testID })
    let trigger = try #require(request.trigger as? UNTimeIntervalNotificationTrigger)
    #expect(trigger.timeInterval <= 5)
    #expect(request.content.title == "AI;DR · Thứ Bảy 28/11")
    #expect(request.content.attachments.count == 1)

    let off = FakeCenter()
    off.status = .denied
    #expect(await scheduler(off).sendTest(feed: feed, lang: .vi) == false)
  }

  // MARK: Pure helpers

  @Test func bodyIsPlainText() {
    #expect(
      NotifyContent.plainText("**Nvidia** rose [4.6%](https://x.test/a) on `GB10`\n  <b>news</b>")
        == "Nvidia rose 4.6% on GB10 news")
    #expect(NotifyContent.plainText("gpt_4 and 2*3 stay") == "gpt_4 and 2*3 stay")
  }

  @Test func tapCarriesTheStoryId() {
    #expect(NotifyContent.storyID(from: ["storyId": "abc"]) == "abc")
    #expect(NotifyContent.storyID(from: [:]) == nil)
    #expect(NotifyContent.storyID(from: ["storyId": 3]) == nil)
  }
}
