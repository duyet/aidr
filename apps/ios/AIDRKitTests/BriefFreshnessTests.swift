import AIDRKit
import Foundation
import Testing

struct BriefFreshnessTests {
  let now = Date(timeIntervalSince1970: 1_795_000_000)

  @Test func freshContentSaysJustNow() {
    #expect(BriefFreshness.label(updatedAt: now.addingTimeInterval(-20), offline: false, lang: .en, now: now) == "Updated just now")
    #expect(BriefFreshness.label(updatedAt: now.addingTimeInterval(-20), offline: false, lang: .vi, now: now) == "Cập nhật vừa xong")
  }

  @Test func olderContentCountsMinutesFromTheFeedTime() throws {
    let en = try #require(BriefFreshness.label(updatedAt: now.addingTimeInterval(-5 * 60), offline: false, lang: .en, now: now))
    #expect(en.hasPrefix("Updated ") && en.contains("5"))
    let vi = try #require(BriefFreshness.label(updatedAt: now.addingTimeInterval(-5 * 60), offline: false, lang: .vi, now: now))
    #expect(vi.hasPrefix("Cập nhật ") && vi.contains("5"))
  }

  @Test func offlineNamesWhenTheSavedCopyIsFrom() throws {
    let utc = try #require(TimeZone(identifier: "UTC"))
    let saved = Date(timeIntervalSince1970: 1_794_999_120)
    let stamp = DateFormatter()
    stamp.dateFormat = "HH:mm"
    stamp.timeZone = utc
    let clock = stamp.string(from: saved)
    #expect(BriefFreshness.label(updatedAt: saved, offline: true, lang: .en, now: now, timeZone: utc) == "Offline · saved \(clock)")
    #expect(BriefFreshness.label(updatedAt: saved, offline: true, lang: .vi, now: now, timeZone: utc) == "Ngoại tuyến · bản lưu lúc \(clock)")
  }

  @Test func noFeedTimeNoLine() {
    #expect(BriefFreshness.label(updatedAt: nil, offline: false, lang: .en) == nil)
  }
}
