import XCTest

/// The Today journey a reader takes, in both languages: the top of the
/// edition, "Show more", the ranked list, a category chip, search, and a
/// relaunch with the network gone. Screenshots are kept for the CI artifact.
/// Assertions are about structure, never about the day's text.
final class TodayJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testTodayVietnamese() {
    let app = launch(language: "vi", locale: "vi_VN")
    assertDigest(app)
    XCTAssertTrue(app.staticTexts["Hôm nay"].exists || app.buttons["Hôm nay"].exists, "VI tab label")
    journey(app, lang: "vi")
  }

  @MainActor
  func testTodayEnglish() {
    let app = launch(language: "en", locale: "en_US")
    assertDigest(app)
    journey(app, lang: "en")
  }

  /// The Aa button presents Settings as a sheet.
  @MainActor
  func testAaOpensSettingsSheet() {
    let app = launch(language: "en", locale: "en_US")
    let aa = app.buttons["settings-button"]
    XCTAssertTrue(aa.waitForExistence(timeout: 20), "Aa button")
    aa.tap()
    Thread.sleep(forTimeInterval: 1.5)
    XCTAssertFalse(aa.isHittable, "the sheet covers the Today toolbar")
    capture(app, "today-settings-en")
  }

  @MainActor
  func testTodayDarkMode() {
    let app = launch(language: "en", locale: "en_US", prefs: Self.darkPrefs)
    assertDigest(app)
    capture(app, "today-dark-top-en")
    scroll(app, until: "ranked-header")
    capture(app, "today-dark-ranked-en")
  }

  /// Reader prefs reach the list: newspaper layout (lead card, serif headline,
  /// summaries) with both languages, and comfortable with one highlight color.
  @MainActor
  func testTodayLayoutsFollowReaderPrefs() {
    let newspaper = launch(language: "vi", locale: "vi_VN", prefs: "<7b226c61796f7574223a226e6577737061706572222c2273756d6d6172696573223a747275652c2262696c696e6775616c223a747275652c2264696765737456696577223a22696d616765227d>")
    assertDigest(newspaper)
    scroll(newspaper, until: "ranked-header")
    XCTAssertTrue(element(newspaper, "ranked-row-1").waitForExistence(timeout: 5))
    Thread.sleep(forTimeInterval: 3)
    capture(newspaper, "today-newspaper-vi")
    newspaper.terminate()

    let comfortable = launch(language: "en", locale: "en_US", prefs: "<7b226c61796f7574223a22636f6d666f727461626c65222c2273756d6d6172696573223a747275652c227468756d626e61696c73223a747275652c22686967686c69676874223a226f6e65222c22616363656e74223a22626c7565227d>")
    assertDigest(comfortable)
    scroll(comfortable, until: "ranked-header")
    XCTAssertTrue(element(comfortable, "ranked-row-1").waitForExistence(timeout: 5))
    Thread.sleep(forTimeInterval: 3)
    capture(comfortable, "today-comfortable-en")
  }

  /// Online launch writes the snapshot; a relaunch against an unreachable API
  /// still paints the edition from disk and says it is offline.
  @MainActor
  func testOfflineRelaunchPaintsFromCache() {
    let online = launch(language: "en", locale: "en_US")
    assertDigest(online)
    online.terminate()

    let offline = XCUIApplication()
    offline.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    offline.launchEnvironment["AIDR_API_BASE"] = "http://127.0.0.1:9"
    offline.launch()
    XCTAssertTrue(row(offline, 1).waitForExistence(timeout: 5), "cached digest did not paint")
    XCTAssertTrue(element(offline, "offline-note").waitForExistence(timeout: 30))
    capture(offline, "today-offline")
  }

  // MARK: Journey

  @MainActor
  private func journey(_ app: XCUIApplication, lang: String) {
    XCTAssertTrue(element(app, "day-header").exists, "day header")
    XCTAssertTrue(element(app, "chip-all").exists, "All chip")
    capture(app, "today-top-\(lang)")

    // Show more steps the digest from 8 rows to 12.
    XCTAssertFalse(row(app, 9).exists, "digest starts at 8 rows")
    let more = element(app, "digest-more")
    scroll(app, until: "digest-more", fraction: 0.8)
    XCTAssertTrue(more.exists, "Show more")
    more.tap()
    XCTAssertTrue(row(app, 9).waitForExistence(timeout: 5), "digest grows to 12 rows")

    // The ranked list.
    scroll(app, until: "ranked-header")
    XCTAssertTrue(element(app, "ranked-row-1").waitForExistence(timeout: 5), "ranked list")
    Thread.sleep(forTimeInterval: 3)  // thumbnails
    capture(app, "today-ranked-\(lang)")

    // A category chip filters the list.
    scroll(app, until: "chip-all", up: true, fraction: 0.5)
    let chip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'chip-' AND identifier != 'chip-all'")).firstMatch
    XCTAssertTrue(chip.waitForExistence(timeout: 5), "category chip")
    chip.tap()
    Thread.sleep(forTimeInterval: 1)
    capture(app, "today-chip-\(lang)")
    chip.tap()

    // A trending tag filters too (when today's stories match one).
    let tagChip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'tag-'")).firstMatch
    if tagChip.waitForExistence(timeout: 3) {
      tagChip.tap()
      Thread.sleep(forTimeInterval: 1)
      capture(app, "today-tag-\(lang)")
      tagChip.tap()
    }

    // The digest switch writes the preference, rebuilds the tree and lands
    // back on the digest, now with thumbnails.
    let imageView = element(app, "digest-view-image")
    XCTAssertTrue(imageView.waitForExistence(timeout: 5), "digest view switch")
    imageView.tap()
    XCTAssertTrue(row(app, 1).waitForExistence(timeout: 10), "digest after the switch")
    Thread.sleep(forTimeInterval: 3)
    capture(app, "today-digest-image-\(lang)")

    // Search over every loaded story.
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "search field")
    field.tap()
    field.typeText("ai")
    XCTAssertTrue(element(app, "search-result-1").waitForExistence(timeout: 10), "search results")
    Thread.sleep(forTimeInterval: 2)
    capture(app, "today-search-\(lang)")
  }

  // MARK: Helpers

  /// Reader prefs as plist data for the "aidr.prefs" key: {} (all defaults)
  /// or {"appearance":"dark"}. The simulator's own appearance is shared with
  /// the other journeys, and prefs a journey changes must not leak into the next.
  static let defaultPrefs = "<7b7d>"
  static let darkPrefs = "<7b22617070656172616e6365223a226461726b227d>"

  @MainActor
  private func launch(language: String, locale: String, prefs: String = TodayJourneyTests.defaultPrefs) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale, "-aidr.prefs", prefs]
    app.launch()
    return app
  }

  @MainActor
  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any)[id]
  }

  @MainActor
  private func row(_ app: XCUIApplication, _ rank: Int) -> XCUIElement {
    element(app, "digest-row-\(rank)")
  }

  /// Drags in short steps (about a third of the window) until `id` sits
  /// between the navigation bar and `fraction` of the window height.
  @MainActor
  private func scroll(_ app: XCUIApplication, until id: String, up: Bool = false, fraction: Double = 0.6) {
    let target = element(app, id)
    let window = app.windows.firstMatch
    let height = window.frame.height
    for _ in 0..<30 {
      // Clear of the navigation bar and search field above 150pt.
      if target.exists, target.frame.minY > 150, up || target.frame.minY < height * fraction { return }
      // Overshot: the target sits under the bars, so step back down the page.
      let back = up || (target.exists && target.frame.minY <= 150)
      // Drag from the left margin, where no row's tap target starts a navigation.
      let start = window.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: back ? 0.45 : 0.75))
      let end = window.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: back ? 0.7 : 0.45))
      start.press(forDuration: 0.05, thenDragTo: end)
    }
    capture(app, "failure-today-scroll-\(id)")
    XCTFail("never scrolled to \(id)")
  }

  @MainActor
  private func assertDigest(_ app: XCUIApplication) {
    if !row(app, 1).waitForExistence(timeout: 45) {
      let name = self.name.components(separatedBy: " ").last?.trimmingCharacters(in: CharacterSet(charactersIn: "]")) ?? "test"
      capture(app, "failure-\(name)")
      let tree = XCTAttachment(string: app.debugDescription)
      tree.name = "failure-tree-\(name)"
      tree.lifetime = .keepAlways
      add(tree)
      XCTFail("digest row 1 never appeared")
      return
    }
    XCTAssertTrue(element(app, "day-block").exists)
    // Let the first thumbnails arrive before the screenshot.
    _ = app.images.firstMatch.waitForExistence(timeout: 5)
    Thread.sleep(forTimeInterval: 4)
  }

  @MainActor
  private func capture(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
