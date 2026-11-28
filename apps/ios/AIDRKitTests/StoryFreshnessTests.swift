import AIDRKit
import Foundation
import Testing

/// The reader can tell how old a story is, and whether it is a saved copy.
struct StoryFreshnessTests {
  let fetched = Date(timeIntervalSince1970: 1_795_849_920)  // 07:12:00 UTC

  @Test func recentCopyIsJustUpdated() {
    let now = fetched.addingTimeInterval(20)
    #expect(StoryFreshness.line(fetchedAt: fetched, now: now, lang: .vi, offline: false) == "Vừa cập nhật")
    #expect(StoryFreshness.line(fetchedAt: fetched, now: now, lang: .en, offline: false) == "Just updated")
  }

  @Test func ageReadsInTheReadersLanguage() {
    let now = fetched.addingTimeInterval(5 * 60)
    let vi = StoryFreshness.line(fetchedAt: fetched, now: now, lang: .vi, offline: false)
    #expect(vi.hasPrefix("Cập nhật") && vi.contains("5") && vi.contains("phút"))
    let en = StoryFreshness.line(fetchedAt: fetched, now: now, lang: .en, offline: false)
    #expect(en.hasPrefix("Updated") && en.contains("5"))
  }

  @Test func offlineNamesTheSaveTime() {
    let now = fetched.addingTimeInterval(3 * 3600)
    #expect(StoryFreshness.line(fetchedAt: fetched, now: now, lang: .vi, offline: true, timeZone: .gmt) == "Ngoại tuyến · bản lưu lúc 07:12")
    #expect(StoryFreshness.line(fetchedAt: fetched, now: now, lang: .en, offline: true, timeZone: .gmt) == "Offline · saved 07:12")
  }
}
