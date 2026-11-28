import AIDRKit
import Testing
import UIKit

struct FontTests {
  @Test(arguments: InterFont.allCases)
  func interResolves(font: InterFont) {
    #expect(UIFont(name: font.rawValue, size: 14) != nil, "\(font.rawValue) did not load; text would fall back to SF")
  }
}
