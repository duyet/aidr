import AIDRKit
import SwiftUI

/// Text with its numbers and names picked out, the way the web's
/// `KeywordText varied` does. The reader's highlight choice applies: each key
/// word takes its own hue (the tag color for that word), or the accent for
/// all, or none.
enum StoryKeywordText {
  /// `headline` uses the reader's headline font; the rest uses the body font.
  static func attributed(
    _ text: String, tags: [String], size: CGFloat, base: InterFont, ink: Color,
    style: Font.TextStyle, headline: Bool = false
  ) -> AttributedString {
    let mode = ReaderStyle.current.highlight
    func font(_ weight: InterFont) -> Font {
      headline ? .headline(size, weight, relativeTo: style) : .inter(size, weight, relativeTo: style)
    }
    var out = AttributedString()
    for segment in Highlight.keywords(text, tags: tags) {
      var piece = AttributedString(segment.text)
      switch (segment.kind, mode) {
      case (nil, _), (_, .none):
        piece.swiftUI.font = font(base)
        piece.swiftUI.foregroundColor = ink
      case (.num?, .one):
        piece.swiftUI.font = font(.semibold)
        piece.swiftUI.foregroundColor = Palette.keywordNumber
      case (.entity?, .one):
        piece.swiftUI.font = font(.semibold)
        piece.swiftUI.foregroundColor = Palette.keywordEntity
      case (_, .topic):
        piece.swiftUI.font = font(.semibold)
        piece.swiftUI.foregroundColor = Topic.color(forTag: segment.text).color
      }
      out += piece
    }
    return out
  }
}
