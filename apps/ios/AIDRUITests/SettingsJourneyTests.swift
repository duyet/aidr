import XCTest

/// The Settings sheet in both languages, in dark mode and at the largest text
/// size. `-aidr.ui.settings YES` opens the sheet at launch (Today's "Aa" button
/// is another lane's). `-aidr.lang system` and the other `-aidr.*` arguments are
/// per launch, so nothing a test picks outlives it. The notification permission
/// alert is never raised: the switch is seeded on and no test taps it.
final class SettingsJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testSettingsVietnamese() {
    let app = launch(language: "vi", locale: "vi_VN")
    assertSettings(app, title: "Cài đặt")
    capture(app, "settings-main-vi")
    scrollToBottom(app)
    capture(app, "settings-links-vi")
  }

  @MainActor
  func testSettingsEnglish() {
    let app = launch(language: "en", locale: "en_US")
    assertSettings(app, title: "Settings")
    capture(app, "settings-main-en")
    scrollToBottom(app)
    capture(app, "settings-links-en")
  }

  @MainActor
  func testSettingsDarkVietnamese() {
    let app = launch(language: "vi", locale: "vi_VN", extra: ["-aidr.ui.dark", "YES"])
    assertSettings(app, title: "Cài đặt")
    capture(app, "settings-dark-vi")
  }

  @MainActor
  func testSettingsLargeTextEnglish() {
    let app = launch(language: "en", locale: "en_US", extra: ["-aidr.textSize", "extraLarge"])
    assertSettings(app, title: "Settings")
    capture(app, "settings-large-en")
  }

  // MARK: Helpers

  @MainActor
  private func launch(language: String, locale: String, extra: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments =
      [
        "-AppleLanguages", "(\(language))", "-AppleLocale", locale,
        "-aidr.lang", "system",
        "-aidr.ui.settings", "YES",
        "-aidr.notify.enabled", "YES",
      ] + extra
    app.launch()
    return app
  }

  @MainActor
  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any)[id]
  }

  /// The sheet's structure, not its words: the rows a reader needs are all there.
  @MainActor
  private func assertSettings(_ app: XCUIApplication, title: String) {
    guard element(app, "settings-notify-toggle").waitForExistence(timeout: 45) else {
      capture(app, "failure-settings")
      let tree = XCTAttachment(string: app.debugDescription)
      tree.name = "failure-tree-settings"
      tree.lifetime = .keepAlways
      add(tree)
      XCTFail("the Settings sheet never appeared")
      return
    }
    XCTAssertTrue(element(app, "settings-done").exists, "Done button")
    XCTAssertTrue(element(app, "settings-language").exists, "language picker")
    XCTAssertTrue(element(app, "settings-text-size").exists, "text size picker")
    XCTAssertTrue(element(app, "settings-notify-time").exists, "time picker shows when the switch is on")
    XCTAssertTrue(element(app, "settings-test-button").exists, "test notification button")
    XCTAssertTrue(app.navigationBars[title].exists || app.staticTexts[title].exists, "title \(title)")
    // Let the screen behind the sheet settle, then the sheet's own animation.
    Thread.sleep(forTimeInterval: 2)
  }

  @MainActor
  private func scrollToBottom(_ app: XCUIApplication) {
    let version = element(app, "settings-version")
    for _ in 0..<4 where !version.isHittable { app.swipeUp() }
    XCTAssertTrue(version.exists, "version row")
    Thread.sleep(forTimeInterval: 1)
  }

  @MainActor
  private func capture(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
