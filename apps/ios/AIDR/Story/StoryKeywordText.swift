import AIDRKit
import SwiftUI

/// Text with its numbers and names picked out, the way the web's
/// `KeywordText varied` does: every key word takes its own hue (the tag
/// color for that word), semibold.
enum StoryKeywordText {
  static func attributed(
    _ text: String, tags: [String], size: CGFloat, base: InterFont, ink: Color,
    style: Font.TextStyle
  ) -> AttributedString {
    var out = AttributedString()
    for segment in Highlight.keywords(text, tags: tags) {
      var piece = AttributedString(segment.text)
      if segment.kind != nil {
        piece.swiftUI.font = .inter(size, .semibold, relativeTo: style)
        piece.swiftUI.foregroundColor = Topic.color(forTag: segment.text).color
      } else {
        piece.swiftUI.font = .inter(size, base, relativeTo: style)
        piece.swiftUI.foregroundColor = ink
      }
      out += piece
    }
    return out
  }
}
