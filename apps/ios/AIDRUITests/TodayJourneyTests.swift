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
    XCUIDevice.shared.appearance = .dark
    defer { XCUIDevice.shared.appearance = .unspecified }
    let app = launch(language: "en", locale: "en_US")
    assertDigest(app)
    capture(app, "today-dark-top-en")
    scroll(app, until: "ranked-header")
    capture(app, "today-dark-ranked-en")
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
    scroll(app, until: "digest-more", fraction: 0.85)
    XCTAssertTrue(more.exists, "Show more")
    more.tap()
    XCTAssertTrue(row(app, 9).waitForExistence(timeout: 5), "digest grows to 12 rows")

    // The ranked list.
    scroll(app, until: "ranked-header")
    XCTAssertTrue(element(app, "ranked-row-1").waitForExistence(timeout: 5), "ranked list")
    capture(app, "today-ranked-\(lang)")

    // A category chip filters the list.
    scroll(app, until: "chip-all", up: true, fraction: 0.5)
    let chip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'chip-' AND identifier != 'chip-all'")).firstMatch
    XCTAssertTrue(chip.waitForExistence(timeout: 5), "category chip")
    chip.tap()
    Thread.sleep(forTimeInterval: 1)
    capture(app, "today-chip-\(lang)")
    chip.tap()

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

  @MainActor
  private func launch(language: String, locale: String) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
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

  /// Swipes until `id` sits above `fraction` of the window height, at most 12 times.
  @MainActor
  private func scroll(_ app: XCUIApplication, until id: String, up: Bool = false, fraction: Double = 0.5) {
    let target = element(app, id)
    let height = app.windows.firstMatch.frame.height
    for _ in 0..<12 {
      // Clear of the navigation bar and search field above 150pt.
      if target.exists, target.frame.minY > 150, up || target.frame.minY < height * fraction { return }
      if up { app.swipeDown() } else { app.swipeUp() }
    }
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
