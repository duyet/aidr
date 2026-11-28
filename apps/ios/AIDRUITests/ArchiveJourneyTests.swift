import XCTest

/// The Archive journey: the calendar, a day, a week and the weeks list, in
/// both languages, plus the calendar in dark mode. Screenshots are kept for the
/// CI artifact. Assertions are about structure, since the content is live.
final class ArchiveJourneyTests: XCTestCase {
  @MainActor
  func testArchiveVietnamese() {
    runJourney(language: "vi", locale: "vi_VN", suffix: "vi", calendarTab: "Lịch", weeksTab: "Tuần")
  }

  @MainActor
  func testArchiveEnglish() {
    runJourney(language: "en", locale: "en_US", suffix: "en", calendarTab: "Calendar", weeksTab: "Weeks")
  }

  @MainActor
  func testCalendarDark() {
    let app = launch(language: "vi", locale: "vi_VN", dark: true)
    openTab(app, "Lịch")
    waitForCalendar(app)
    capture(app, "archive-calendar-dark")
  }

  // MARK: Journey

  @MainActor
  private func runJourney(language: String, locale: String, suffix: String, calendarTab: String, weeksTab: String) {
    continueAfterFailure = false
    let app = launch(language: language, locale: locale)

    // Calendar
    openTab(app, calendarTab)
    waitForCalendar(app)
    capture(app, "archive-calendar-\(suffix)")

    // A day from the middle of the grid.
    let days = elements(app, prefix: "calendar-day-")
    let dayCount = days.count
    XCTAssertGreaterThan(dayCount, 1, "no edition days in the month grid")
    days.element(boundBy: dayCount / 2).tap()
    XCTAssertTrue(app.descendants(matching: .any)["day-screen"].waitForExistence(timeout: 20), "day screen")
    let firstStory = app.descendants(matching: .any)["day-story-1"]
    if !firstStory.waitForExistence(timeout: 45) { failWithTree(app, "day") }
    Thread.sleep(forTimeInterval: 5)
    capture(app, "archive-day-\(suffix)")
    app.navigationBars.buttons.firstMatch.tap()

    // A week
    waitForCalendar(app)
    let weekCells = elements(app, prefix: "calendar-week-")
    XCTAssertGreaterThan(weekCells.count, 0, "no linked weeks in the month grid")
    weekCells.element(boundBy: 0).tap()
    XCTAssertTrue(app.descendants(matching: .any)["week-screen"].waitForExistence(timeout: 20), "week screen")
    if !app.descendants(matching: .any)["week-story-1"].waitForExistence(timeout: 45) { failWithTree(app, "week") }
    Thread.sleep(forTimeInterval: 5)
    capture(app, "archive-week-\(suffix)")
    app.navigationBars.buttons.firstMatch.tap()

    // Weeks list
    openTab(app, weeksTab)
    if !elements(app, prefix: "weeks-row-").firstMatch.waitForExistence(timeout: 20) { failWithTree(app, "weeks") }
    // Let the rows fetch their editions and thumbnails.
    Thread.sleep(forTimeInterval: 8)
    capture(app, "archive-weeks-\(suffix)")
  }

  // MARK: Helpers

  @MainActor
  private func launch(language: String, locale: String, dark: Bool = false) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
    // A launch argument, not XCUIDevice.appearance, so no other test inherits dark mode.
    if dark { app.launchArguments += ["-AppleInterfaceStyle", "Dark"] }
    app.launch()
    return app
  }

  @MainActor
  private func openTab(_ app: XCUIApplication, _ label: String) {
    let tab = app.tabBars.buttons[label]
    if tab.waitForExistence(timeout: 20) {
      tab.tap()
    } else {
      app.buttons[label].firstMatch.tap()
    }
  }

  @MainActor
  private func elements(_ app: XCUIApplication, prefix: String) -> XCUIElementQuery {
    app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix))
  }

  /// The grid is up and at least two edition days have loaded.
  @MainActor
  private func waitForCalendar(_ app: XCUIApplication) {
    XCTAssertTrue(app.descendants(matching: .any)["calendar-grid"].waitForExistence(timeout: 30), "calendar grid")
    let deadline = Date().addingTimeInterval(60)
    while Date() < deadline && elements(app, prefix: "calendar-day-").count < 2 {
      Thread.sleep(forTimeInterval: 1)
    }
    if elements(app, prefix: "calendar-day-").count <= 1 { failWithTree(app, "calendar") }
    // Thumbnails of the agenda rows.
    Thread.sleep(forTimeInterval: 5)
  }

  @MainActor
  private func failWithTree(_ app: XCUIApplication, _ name: String) {
    capture(app, "failure-archive-\(name)")
    let tree = XCTAttachment(string: app.debugDescription)
    tree.name = "failure-tree-archive-\(name)"
    tree.lifetime = .keepAlways
    add(tree)
    XCTFail("\(name) screen never filled")
  }

  @MainActor
  private func capture(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
