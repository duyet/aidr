import AIDRKit
import Foundation
import SwiftUI
import Testing

struct SettingsTests {
  @Test func chosenLanguageBeatsTheSystemOne() {
    #expect(Lang.preferred(["en-US"], stored: "vi") == .vi)
    #expect(Lang.preferred(["vi-VN"], stored: "en") == .en)
  }

  @Test func systemChoiceFollowsThePhone() {
    #expect(Lang.preferred(["vi-VN"], stored: "system") == .vi)
    #expect(Lang.preferred(["fr"], stored: "system") == .en)
    #expect(Lang.preferred(["vi"], stored: nil) == .vi)
    #expect(Lang.preferred(["vi"], stored: "klingon") == .vi, "an unknown value reads as the system choice")
  }

  @Test func everyChoiceRoundTripsThroughItsStoredValue() {
    for choice in TextSizeChoice.allCases { #expect(TextSizeChoice(stored: choice.rawValue) == choice) }
    #expect(TextSizeChoice(stored: nil) == .system)
    #expect(TextSizeChoice(stored: "huge") == .system)
    #expect(TextSizeChoice.system.dynamicTypeSize == nil, "System leaves Dynamic Type alone")
    let sizes = TextSizeChoice.allCases.compactMap(\.dynamicTypeSize)
    #expect(sizes == sizes.sorted(), "each step is larger than the one before")
    #expect(Set(sizes).count == sizes.count)
  }

  @Test func notifyDefaultsToSevenInTheMorningAndOff() {
    let defaults = UserDefaults(suiteName: UUID().uuidString)!
    #expect(NotifyPrefs.enabled(defaults) == false)
    #expect(NotifyPrefs.minutes(defaults) == 420)
    defaults.set(0, forKey: SettingsKey.notifyMinutes)
    #expect(NotifyPrefs.minutes(defaults) == 0, "midnight is a valid time, not 'unset'")
    defaults.set(99_999, forKey: SettingsKey.notifyMinutes)
    #expect(NotifyPrefs.minutes(defaults) == 1439)
  }

  @Test func prefetchWarmsTheImagesTodayAsksFor() throws {
    let feed = try Fixtures.feed()
    for lang in [Lang.en, .vi] {
      let urls = RefreshJob.prefetchURLs(feed, lang: lang)
      let rows = Digest.rows(feed, lang: lang, limit: 16).compactMap(\.thumbnail)
      #expect(urls.count <= 16)
      #expect(!urls.isEmpty)
      var seen = Set<URL>()
      let expected = rows.filter { seen.insert($0).inserted }
      #expect(urls == expected, "same URLs, same order, no repeats")
    }
  }
}
