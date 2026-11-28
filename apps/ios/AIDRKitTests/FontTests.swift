import AIDRKit
import Testing
import UIKit

struct FontTests {
  @Test(arguments: InterFont.allCases)
  func interResolves(font: InterFont) {
    #expect(UIFont(name: font.rawValue, size: 14) != nil, "\(font.rawValue) did not load; text would fall back to SF")
  }

  @Test(arguments: InterFont.allCases)
  func newsreaderResolves(font: InterFont) {
    #expect(UIFont(name: font.serifName, size: 14) != nil, "\(font.serifName) did not load; the serif option would fall back to SF")
  }
}
