import XCTest

/// Story lane journey: open the first digest row, read the story, open
/// "Share as image", pick two backgrounds, and keep the rendered PNG. VI, EN,
/// dark mode, and a relaunch with no network.
final class StoryJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor func testStoryVietnamese() throws {
    try journey(language: "vi", locale: "vi_VN", dark: false)
  }

  @MainActor func testStoryEnglish() throws {
    try journey(language: "en", locale: "en_US", dark: false)
  }

  @MainActor func testStoryDarkMode() throws {
    XCUIDevice.shared.appearance = .dark
    defer { XCUIDevice.shared.appearance = .light }
    try journey(language: "en", locale: "en_US", dark: true)
  }

  /// "Aa" in the nav bar opens the shared Customize sheet without leaving the story.
  @MainActor func testAaOpensSettings() throws {
    XCUIDevice.shared.appearance = .light
    let app = launch(language: "en", locale: "en_US")
    try openFirstStory(app)
    let aa = app.buttons["story-aa"]
    XCTAssertTrue(aa.waitForExistence(timeout: 10), "Aa button missing from the story nav bar")
    Thread.sleep(forTimeInterval: 3)
    aa.tap()
    Thread.sleep(forTimeInterval: 2)
    capture(app, "story-aa-settings-en")
  }

  /// Online open caches the story; a relaunch against an unreachable API still reads it.
  @MainActor func testStoryOpensOffline() throws {
    XCUIDevice.shared.appearance = .light
    let online = launch(language: "en", locale: "en_US")
    try openFirstStory(online)
    XCTAssertTrue(online.descendants(matching: .any)["story-headline"].waitForExistence(timeout: 10))
    // The story is cached once the network answers.
    Thread.sleep(forTimeInterval: 6)
    online.terminate()

    let offline = XCUIApplication()
    offline.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    offline.launchEnvironment["AIDR_API_BASE"] = "http://127.0.0.1:9"
    offline.launch()
    try openFirstStory(offline)
    XCTAssertTrue(offline.descendants(matching: .any)["story-headline"].waitForExistence(timeout: 10), "cached story did not paint")
    XCTAssertTrue(offline.descendants(matching: .any)["story-aidr"].exists)
    let freshness = offline.descendants(matching: .any)["story-freshness"]
    XCTAssertTrue(freshness.waitForExistence(timeout: 30), "no freshness line on a saved story")
    XCTAssertTrue(freshness.label.hasPrefix("Offline"), "saved copy must say it is offline, got: \(freshness.label)")
    Thread.sleep(forTimeInterval: 2)
    capture(offline, "story-offline-en")
  }

  // MARK: Journey

  @MainActor
  private func journey(language: String, locale: String, dark: Bool) throws {
    if !dark { XCUIDevice.shared.appearance = .light }
    let tag = dark ? "dark-\(language)" : language
    let dump = "/tmp/aidr-story-card-\(tag).png"
    try? FileManager.default.removeItem(atPath: dump)

    let app = launch(language: language, locale: locale, extra: ["AIDR_SHARE_CARD_DUMP": dump])
    try openFirstStory(app)
    XCTAssertTrue(app.descendants(matching: .any)["story-headline"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.descendants(matching: .any)["story-meta"].exists)
    // Let the hero image arrive before the screenshot.
    Thread.sleep(forTimeInterval: 5)
    capture(app, "story-top-\(tag)")

    app.swipeUp()
    Thread.sleep(forTimeInterval: 1)
    let shareImage = app.buttons["story-share-image"]
    scroll(app, until: shareImage)
    XCTAssertTrue(shareImage.exists, "Share as image button not found")
    capture(app, "story-summary-\(tag)")
    scroll(app, until: app.descendants(matching: .any)["story-tags"], swipes: 4)
    capture(app, "story-sources-\(tag)")

    scroll(app, until: shareImage, swipes: 4, down: true)
    shareImage.tap()
    XCTAssertTrue(app.descendants(matching: .any)["share-preview"].waitForExistence(timeout: 10), "composer did not open")
    Thread.sleep(forTimeInterval: 3)
    capture(app, "story-share-composer-1-\(tag)")

    let second = app.buttons["share-bg-gradient-2"]
    XCTAssertTrue(second.waitForExistence(timeout: 5))
    second.tap()
    Thread.sleep(forTimeInterval: 2)
    capture(app, "story-share-composer-2-\(tag)")
    attachPNG(dump, "story-share-card-\(tag)")

    try? FileManager.default.removeItem(atPath: dump)
    app.buttons["9:16"].tap()
    Thread.sleep(forTimeInterval: 2.5)
    capture(app, "story-share-composer-story-\(tag)")
    attachPNG(dump, "story-share-card-9x16-\(tag)")
  }

  // MARK: Helpers

  @MainActor
  private func launch(language: String, locale: String, extra: [String: String] = [:]) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
    for (key, value) in extra { app.launchEnvironment[key] = value }
    app.launch()
    return app
  }

  /// Taps the first digest row. The Today lane owns the row's NavigationLink to
  /// Route.story; until it lands the tap goes nowhere and this test skips, loudly.
  @MainActor
  private func openFirstStory(_ app: XCUIApplication) throws {
    let row = app.descendants(matching: .any)["digest-row-1"]
    if !row.waitForExistence(timeout: 45) {
      capture(app, "failure-story-today")
      XCTFail("digest row 1 never appeared")
      return
    }
    row.tap()
    if !app.descendants(matching: .any)["story-screen"].waitForExistence(timeout: 15) {
      throw XCTSkip("Tapping digest row 1 did not open a story: Today rows are not wired to Route.story yet (Today lane).")
    }
  }

  @MainActor
  private func scroll(_ app: XCUIApplication, until element: XCUIElement, swipes: Int = 8, down: Bool = false) {
    var count = 0
    while !(element.exists && element.isHittable) && count < swipes {
      if down { app.swipeDown() } else { app.swipeUp() }
      count += 1
    }
    Thread.sleep(forTimeInterval: 0.6)
  }

  @MainActor
  private func capture(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }

  /// The PNG the share sheet would receive, written by the app (AIDR_SHARE_CARD_DUMP).
  @MainActor
  private func attachPNG(_ path: String, _ name: String) {
    guard let data = FileManager.default.contents(atPath: path) else {
      XCTFail("the rendered share card was not written to \(path)")
      return
    }
    let png = XCTAttachment(data: data, uniformTypeIdentifier: "public.png")
    png.name = name
    png.lifetime = .keepAlways
    add(png)
  }
}
