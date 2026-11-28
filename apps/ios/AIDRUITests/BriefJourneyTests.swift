import XCTest

/// The AI;DR tab: cover, a story page, the end page with a streak, the day
/// video, and a gradient page, in VI and EN and in dark mode. Screenshots are
/// kept for the CI artifact. Content is live, so these assert structure.
final class BriefJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testBriefVietnamese() {
    // 2026-10-15 is a day whose VI archive has a video.
    let app = launch(language: "vi", locale: "vi_VN", env: ["AIDR_BRIEF_VIDEO_DATE": "2026-10-15"])
    capture(app, "brief-cover-vi")
    XCTAssertTrue(swipe(to: "video", in: app), "video page missing")
    XCTAssertTrue(element(app, "brief-video-play").waitForExistence(timeout: 10))
    Thread.sleep(forTimeInterval: 4)
    capture(app, "brief-video-vi")
    XCTAssertTrue(swipe(to: "story-1", in: app))
    Thread.sleep(forTimeInterval: 4)
    capture(app, "brief-story-vi")
    assertEnd(app)
    capture(app, "brief-end-vi")
  }

  @MainActor
  func testBriefEnglish() {
    let app = launch(language: "en", locale: "en_US")
    capture(app, "brief-cover-en")
    XCTAssertTrue(swipe(to: "story-1", in: app))
    Thread.sleep(forTimeInterval: 4)
    capture(app, "brief-story-en")
    XCTAssertTrue(element(app, "brief-read-more").exists || element(app, "brief-story-1-plain").exists)
    assertEnd(app)
    capture(app, "brief-end-en")
  }

  /// No images: every page is the topic gradient. Dark appearance.
  @MainActor
  func testGradientPagesInDarkMode() {
    let app = launch(
      language: "en", locale: "en_US", env: ["AIDR_BRIEF_NO_IMAGES": "1"], dark: true)
    capture(app, "brief-cover-dark-en")
    XCTAssertTrue(swipe(to: "story-2", in: app))
    XCTAssertTrue(element(app, "brief-story-2-plain").exists, "page should draw the gradient")
    Thread.sleep(forTimeInterval: 1)
    capture(app, "brief-story-plain-en")
    assertEnd(app)
    capture(app, "brief-end-dark-en")
  }

  /// Tapping the poster loads the YouTube player in a web view.
  @MainActor
  func testVideoPlaysInAWebView() {
    let app = launch(language: "en", locale: "en_US", env: ["AIDR_BRIEF_VIDEO_DATE": "2026-10-16"])
    XCTAssertTrue(swipe(to: "video", in: app), "video page missing")
    let play = element(app, "brief-video-play")
    XCTAssertTrue(play.waitForExistence(timeout: 10))
    play.tap()
    XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15), "player web view never appeared")
    Thread.sleep(forTimeInterval: 6)
    capture(app, "brief-video-playing-en")
  }

  // MARK: Helpers

  /// Launches with a streak of the two days before today already read, and
  /// opens the AI;DR tab.
  @MainActor
  private func launch(
    language: String, locale: String, env: [String: String] = [:], dark: Bool = false
  ) -> XCUIApplication {
    let app = XCUIApplication()
    var args = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
    args += ["-brief.finishedDays", "(\"\(day(offset: -2))\",\"\(day(offset: -1))\")"]
    if dark { args += ["-AppleInterfaceStyle", "Dark"] }
    app.launchArguments = args
    app.launchEnvironment = env
    app.launch()
    let tab = app.tabBars.buttons["AI;DR"]
    XCTAssertTrue(tab.waitForExistence(timeout: 15), "AI;DR tab missing")
    tab.tap()
    if !element(app, "brief-cover").waitForExistence(timeout: 45) {
      capture(app, "failure-brief")
      let tree = XCTAttachment(string: app.debugDescription)
      tree.name = "failure-tree-brief"
      tree.lifetime = .keepAlways
      add(tree)
      XCTFail("brief cover never appeared")
    }
    Thread.sleep(forTimeInterval: 1)
    return app
  }

  private func day(offset: Int) -> String {
    let date = Calendar.current.date(byAdding: .day, value: offset, to: Date())!
    let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
  }

  @MainActor
  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any)[id]
  }

  /// Swipes up one page at a time until the progress bar names `page`.
  @MainActor
  private func swipe(to page: String, in app: XCUIApplication, max: Int = 16) -> Bool {
    for _ in 0..<max {
      if element(app, "brief-progress-\(page)").exists { return true }
      app.swipeUp()
      Thread.sleep(forTimeInterval: 0.8)
    }
    return element(app, "brief-progress-\(page)").exists
  }

  /// The end page shows the streak: the two seeded days plus today.
  @MainActor
  private func assertEnd(_ app: XCUIApplication) {
    XCTAssertTrue(swipe(to: "end", in: app), "end page missing")
    let count = element(app, "brief-streak-count")
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertEqual(count.label, "3")
    XCTAssertTrue(element(app, "brief-share").exists, "share button missing")
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
