import XCTest

/// The Today journey a reader takes on launch, in both languages, plus a
/// relaunch with the network gone. Screenshots are kept for the CI artifact.
final class TodayJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testTodayVietnamese() {
    let app = launch(language: "vi", locale: "vi_VN")
    assertDigest(app)
    XCTAssertTrue(app.staticTexts["Hôm nay"].exists || app.buttons["Hôm nay"].exists, "VI tab label")
    capture(app, "today-vi")
  }

  @MainActor
  func testTodayEnglish() {
    let app = launch(language: "en", locale: "en_US")
    assertDigest(app)
    capture(app, "today-en")
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
    XCTAssertTrue(offline.descendants(matching: .any)["offline-note"].waitForExistence(timeout: 30))
    capture(offline, "today-offline")
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
  private func row(_ app: XCUIApplication, _ rank: Int) -> XCUIElement {
    app.descendants(matching: .any)["digest-row-\(rank)"]
  }

  @MainActor
  private func assertDigest(_ app: XCUIApplication) {
    XCTAssertTrue(row(app, 1).waitForExistence(timeout: 45), "digest row 1 never appeared")
    XCTAssertTrue(app.descendants(matching: .any)["day-block"].exists)
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
