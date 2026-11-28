import XCTest

/// The Settings sheet in both languages, in dark and black, in cream with the
/// serif font and a violet accent, and at the largest text size, plus Today in
/// the same looks behind it. `-aidr.ui.settings YES` opens the sheet at launch
/// (the "Aa" button is Today's). `-aidr.ui.prefs <json>` sets the reader
/// preferences for that launch only: the app puts the saved ones back after
/// applying them, so no later test inherits a look. Only the test that taps a
/// swatch saves, and it ends with Reset. The notification permission alert is
/// never raised: the switch is seeded on and no test taps it.
final class SettingsJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testSettingsVietnamese() {
    let app = launch(language: "vi", locale: "vi_VN")
    assertSettings(app)
    capture(app, "settings-main-vi")
    scroll(app, to: "settings-layout")
    capture(app, "settings-layout-vi")
    scroll(app, to: "settings-notify-time")
    XCTAssertTrue(element(app, "settings-test-button").exists, "test notification button")
    capture(app, "settings-notify-vi")
    scroll(app, to: "settings-version")
    capture(app, "settings-links-vi")
  }

  @MainActor
  func testSettingsEnglish() {
    let app = launch(language: "en", locale: "en_US")
    assertSettings(app)
    capture(app, "settings-main-en")
    scroll(app, to: "settings-layout")
    capture(app, "settings-layout-en")
    scroll(app, to: "settings-version")
    capture(app, "settings-links-en")
  }

  @MainActor
  func testCreamSerifViolet() {
    let prefs = #"{"appearance":"cream","bodyFont":"serif","headFont":"serif","accent":"violet"}"#
    let sheet = launch(language: "en", locale: "en_US", prefs: prefs)
    assertSettings(sheet)
    capture(sheet, "settings-cream-en")
    sheet.terminate()

    let today = launch(language: "en", locale: "en_US", prefs: prefs, settings: false)
    settleToday(today)
    capture(today, "today-cream-serif-violet-en")
  }

  @MainActor
  func testDarkVietnamese() {
    let prefs = #"{"appearance":"dark"}"#
    let sheet = launch(language: "vi", locale: "vi_VN", prefs: prefs)
    assertSettings(sheet)
    capture(sheet, "settings-dark-vi")
    sheet.terminate()

    let today = launch(language: "vi", locale: "vi_VN", prefs: prefs, settings: false)
    settleToday(today)
    capture(today, "today-dark-vi")
  }

  @MainActor
  func testBlackBlueVietnamese() {
    let prefs = #"{"appearance":"black","accent":"blue"}"#
    let sheet = launch(language: "vi", locale: "vi_VN", prefs: prefs)
    assertSettings(sheet)
    capture(sheet, "settings-black-vi")
    sheet.terminate()

    let today = launch(language: "vi", locale: "vi_VN", prefs: prefs, settings: false)
    settleToday(today)
    capture(today, "today-black-vi")
  }

  @MainActor
  func testLargestTextEnglish() {
    let app = launch(language: "en", locale: "en_US", prefs: #"{"textSize":"xxxLarge"}"#)
    assertSettings(app)
    capture(app, "settings-large-en")
  }

  /// A swatch selects, and Reset puts the default back.
  @MainActor
  func testPickingALookAndResetting() {
    let app = launch(language: "en", locale: "en_US")
    assertSettings(app)
    XCTAssertTrue(element(app, "settings-appearance-system").isSelected, "System is the default look")
    element(app, "settings-appearance-cream").tap()
    XCTAssertTrue(element(app, "settings-appearance-cream").isSelected)
    XCTAssertFalse(element(app, "settings-appearance-system").isSelected)
    scroll(app, to: "settings-accent-violet")
    element(app, "settings-accent-violet").tap()
    XCTAssertTrue(element(app, "settings-accent-violet").isSelected)
    scroll(app, to: "settings-reset")
    element(app, "settings-reset").tap()
    scroll(app, to: "settings-appearance-system", up: false)
    XCTAssertTrue(element(app, "settings-appearance-system").isSelected, "Reset restores the default look")
    XCTAssertFalse(element(app, "settings-accent-violet").isSelected)
  }

  // MARK: Helpers

  @MainActor
  @discardableResult
  private func launch(
    language: String, locale: String, prefs: String = "{}", settings: Bool = true
  ) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = [
      "-AppleLanguages", "(\(language))", "-AppleLocale", locale,
      "-aidr.ui.prefs", prefs,
      "-aidr.notify.enabled", "YES",
    ]
    if settings { app.launchArguments += ["-aidr.ui.settings", "YES"] }
    app.launch()
    return app
  }

  @MainActor
  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any)[id]
  }

  /// The sheet's structure, not its words: the rows a reader needs are all there.
  @MainActor
  private func assertSettings(_ app: XCUIApplication) {
    guard element(app, "settings-appearance-system").waitForExistence(timeout: 45) else {
      capture(app, "failure-settings")
      let tree = XCTAttachment(string: app.debugDescription)
      tree.name = "failure-tree-settings"
      tree.lifetime = .keepAlways
      add(tree)
      XCTFail("the Settings sheet never appeared")
      return
    }
    // Only what fits above the fold: the form builds the rest as it scrolls.
    XCTAssertTrue(element(app, "settings-done").exists, "Done button")
    XCTAssertTrue(element(app, "settings-appearance-cream").exists, "appearance swatches")
    // Let the screen behind the sheet settle, then the sheet's own animation.
    Thread.sleep(forTimeInterval: 2)
  }

  /// Swipes until the row is on screen. The form builds rows lazily, so a row
  /// off screen may not exist yet.
  @MainActor
  private func scroll(_ app: XCUIApplication, to id: String, up: Bool = true) {
    let row = element(app, id)
    for _ in 0..<10 where !(row.exists && row.isHittable) {
      if up { app.swipeUp() } else { app.swipeDown() }
    }
    XCTAssertTrue(row.exists, "\(id) never scrolled into view")
    Thread.sleep(forTimeInterval: 1)
  }

  @MainActor
  private func settleToday(_ app: XCUIApplication) {
    _ = element(app, "digest-row-1").waitForExistence(timeout: 45)
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
