import AIDRKit
import Foundation
import Testing

struct SettingsTests {
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
      var seen = Set<URL>()
      let expected = rows.filter { seen.insert($0).inserted }
      #expect(urls.count <= 16)
      #expect(!urls.isEmpty)
      #expect(urls == expected, "same URLs, same order, no repeats")
    }
  }
}
