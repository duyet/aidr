import AIDRKit
import SwiftUI
import Testing

/// The app uses the system font, so what can break is scaling: the reader's
/// text size must move every size the way Apple scales its text styles.
@MainActor
struct FontTests {
  private func size(_ textSize: ReaderTextSize, _ points: CGFloat = 17) -> CGFloat {
    var prefs = ReaderPrefs()
    prefs.textSize = textSize
    let saved = ReaderStyle.current
    ReaderStyle.current = prefs
    defer { ReaderStyle.current = saved }
    return Font.scaledSize(points, relativeTo: .body)
  }

  @Test func defaultSizeIsTheDesignSize() {
    #expect(abs(size(.large) - 17) < 0.5)
  }

  @Test func readerTextSizeScalesEveryStep() {
    let steps: [ReaderTextSize] = [.small, .medium, .large, .xLarge, .xxLarge, .xxxLarge]
    let sizes = steps.map { size($0) }
    #expect(sizes == sizes.sorted(), "text size steps must grow: \(sizes)")
    #expect(size(.xxxLarge) > size(.small) + 4)
  }
}
