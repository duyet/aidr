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
    if !waitFor(app, "day-screen", timeout: 20) { failWithTree(app, "day-screen") }
    if !waitFor(app, "day-story-", timeout: 45) { failWithTree(app, "day") }
    Thread.sleep(forTimeInterval: 5)
    capture(app, "archive-day-\(suffix)")
    app.navigationBars.buttons.firstMatch.tap()

    // A week
    waitForCalendar(app)
    let weekCells = elements(app, prefix: "calendar-week-")
    XCTAssertGreaterThan(weekCells.count, 0, "no linked weeks in the month grid")
    weekCells.element(boundBy: 0).tap()
    if !waitFor(app, "week-screen", timeout: 20) { failWithTree(app, "week-screen") }
    if !waitFor(app, "week-story-", timeout: 45) { failWithTree(app, "week") }
    Thread.sleep(forTimeInterval: 5)
    capture(app, "archive-week-\(suffix)")
    app.navigationBars.buttons.firstMatch.tap()

    // Weeks list
    openTab(app, weeksTab)
    if !waitFor(app, "weeks-row-", timeout: 20) { failWithTree(app, "weeks") }
    // Let the rows fetch their editions and thumbnails.
    Thread.sleep(forTimeInterval: 8)
    capture(app, "archive-weeks-\(suffix)")
  }

  // MARK: Helpers

  @MainActor
  private func launch(language: String, locale: String, dark: Bool = false) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
    // Dark through the reader prefs (JSON data in UserDefaults "aidr.prefs", as the
    // Brief journey does): the system style launch argument does not reach the app.
    // Launch-scoped, so no other test inherits dark mode.
    if dark { app.launchArguments += ["-aidr.prefs", "<7b22617070656172616e6365223a226461726b227d>"] }
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
    if !waitFor(app, "calendar-grid", timeout: 30) { failWithTree(app, "calendar-grid") }
    let deadline = Date().addingTimeInterval(60)
    while Date() < deadline && elements(app, prefix: "calendar-day-").count < 2 {
      Thread.sleep(forTimeInterval: 1)
    }
    if elements(app, prefix: "calendar-day-").count <= 1 { failWithTree(app, "calendar") }
    // Thumbnails of the agenda rows.
    Thread.sleep(forTimeInterval: 5)
  }

  /// Polls for an element whose identifier starts with `prefix`. A plain poll, so a
  /// miss leaves no per-poll debug attachments (their names break the CI upload).
  @MainActor
  private func waitFor(_ app: XCUIApplication, _ prefix: String, timeout: TimeInterval) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if elements(app, prefix: prefix).count > 0 { return true }
      Thread.sleep(forTimeInterval: 1)
    }
    return false
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
