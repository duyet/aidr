import AIDRKit
import Foundation
import Testing

@MainActor
struct ReaderPrefsTests {
  private func freshDefaults() -> UserDefaults {
    let name = "ReaderPrefsTests-\(UUID().uuidString)"
    return UserDefaults(suiteName: name)!
  }

  @Test func savedChoicesSurviveARelaunch() {
    let defaults = freshDefaults()
    let store = ReaderPrefsStore(defaults: defaults)
    store.prefs.appearance = .cream
    store.prefs.bodyFont = .serif
    store.prefs.accent = .violet
    store.prefs.digestCount = 16

    let relaunched = ReaderPrefsStore(defaults: defaults)
    #expect(relaunched.prefs.appearance == .cream)
    #expect(relaunched.prefs.bodyFont == .serif)
    #expect(relaunched.prefs.accent == .violet)
    #expect(relaunched.prefs.digestCount == 16)
    #expect(ReaderStyle.current == relaunched.prefs)
  }

  @Test func olderOrBrokenSavedValuesKeepDefaults() throws {
    let json = #"{"appearance":"dark","accent":"teal","digestCount":9}"#
    let prefs = try JSONDecoder().decode(ReaderPrefs.self, from: Data(json.utf8))
    #expect(prefs.appearance == .dark)
    #expect(prefs.accent == .yellow)
    #expect(prefs.digestCount == 8)
    #expect(prefs.highlight == .topic)
  }

  @Test func languageOverrideBeatsTheSystem() {
    #expect(ReaderLanguage.system.resolve(["vi-VN"]) == .vi)
    #expect(ReaderLanguage.en.resolve(["vi-VN"]) == .en)
    #expect(ReaderLanguage.vi.resolve(["en-US"]) == .vi)
  }
}
