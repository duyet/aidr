import XCTest

final class TodayJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  @MainActor
  func testLaunchScreenshot() {
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.staticTexts["today"].waitForExistence(timeout: 30))
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "today-en"
    shot.lifetime = .keepAlways
    add(shot)
  }
}
