import AIDRKit
import SwiftUI

/// One story in the ranked list or in search results: highlighted title,
/// "• Category · host · 9 giờ" and a small thumbnail. Opens the story.
struct StoryRow: View {
  let story: TodayStory
  let learned: [String]
  let lang: Lang
  /// "ranked-row-3" / "search-result-3".
  let identifier: String

  var body: some View {
    NavigationLink(value: Route.story(id: story.id)) {
      HStack(alignment: .top, spacing: Spacing.md) {
        VStack(alignment: .leading, spacing: 6) {
          Text(title)
            .lineSpacing(2)
            .lineLimit(3)
            .frame(maxWidth: .infinity, alignment: .leading)
          meta
        }
        if let url = story.item.imageUrl.flatMap(URL.init(string:)) {
          Thumbnail(url: url)
        }
      }
      .padding(.vertical, 13)
      .padding(.horizontal, Spacing.lg)
      .overlay(alignment: .bottom) {
        Rectangle().fill(Palette.border).frame(height: 0.5).padding(.horizontal, Spacing.lg)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier(identifier)
  }

  /// Names and figures in the title take the story's category color.
  private var title: AttributedString {
    let ink = Topic.color(forCategory: story.item.category).color
    var out = AttributedString()
    for segment in Highlight.keywords(story.title, tags: story.item.tags, learned: learned) {
      var piece = AttributedString(segment.text)
      if segment.kind == nil {
        piece.swiftUI.font = .inter(15)
        piece.swiftUI.foregroundColor = Palette.foreground
      } else {
        piece.swiftUI.font = .inter(15, .semibold)
        piece.swiftUI.foregroundColor = ink
      }
      out += piece
    }
    return out
  }

  private var meta: some View {
    HStack(spacing: 6) {
      if let category = story.item.category, !category.isEmpty {
        Circle().fill(Topic.color(forCategory: category).color).frame(width: 6, height: 6)
      }
      Text(metaLine)
        .font(.inter(12.5, relativeTo: .caption))
        .foregroundStyle(Palette.mutedForeground)
        .lineLimit(1)
    }
  }

  private var metaLine: String {
    var parts: [String] = []
    if let category = story.item.category, !category.isEmpty { parts.append(category) }
    if let host = TodayFormat.host(story.item.url) { parts.append(host) }
    if let date = story.item.publishedDate {
      parts.append(TodayFormat.ago(date, now: .now, lang: lang, short: true))
    }
    return parts.joined(separator: " · ")
  }
}
