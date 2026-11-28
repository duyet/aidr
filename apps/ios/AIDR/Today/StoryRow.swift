import AIDRKit
import SwiftUI

/// One story in the ranked list or in search results: highlighted title,
/// "• Category · host · 9 giờ", optional summary and thumbnail. Opens the
/// story. The lead story of the newspaper layout is a big card.
struct StoryRow: View {
  let story: TodayStory
  let learned: [String]
  let lang: Lang
  /// "ranked-row-3" / "search-result-3".
  let identifier: String
  var isLead = false

  @Environment(ReaderPrefsStore.self) private var prefsStore

  private var prefs: ReaderPrefs { prefsStore.prefs }
  private var newspaper: Bool { prefs.layout == .newspaper }
  private var imageURL: URL? { story.item.imageUrl.flatMap(URL.init(string:)) }

  var body: some View {
    NavigationLink(value: Route.story(id: story.id)) {
      Group {
        if isLead && newspaper { lead } else { row }
      }
      .padding(.vertical, prefs.layout == .comfortable ? 18 : 13)
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

  private var row: some View {
    HStack(alignment: .top, spacing: Spacing.md) {
      text(titleSize: newspaper ? 18 : 15, lines: prefs.layout == .compact ? 2 : 3)
      // The web's newspaper layout drops row thumbnails.
      if prefs.thumbnails && !newspaper, let imageURL {
        Thumbnail(url: imageURL)
      }
    }
  }

  private var lead: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      if prefs.thumbnails, let imageURL {
        AsyncImage(url: imageURL) { phase in
          if let image = phase.image {
            image.resizable().scaledToFill()
          } else {
            Palette.muted
          }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityHidden(true)
      }
      text(titleSize: 24, lines: 5)
    }
  }

  private func text(titleSize: CGFloat, lines: Int) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title(size: titleSize))
        .lineSpacing(newspaper ? 1 : 2)
        .lineLimit(lines)
        .frame(maxWidth: .infinity, alignment: .leading)
      if let second = story.secondTitle {
        Text(second)
          .font(.inter(13.5, relativeTo: .footnote))
          .foregroundStyle(Palette.mutedForeground)
          .lineLimit(1)
      }
      // The web's newspaper layout always shows summaries.
      if prefs.summaries || newspaper, let summary = story.summary {
        Text(summary)
          .font(.inter(13, relativeTo: .footnote))
          .lineSpacing(2)
          .foregroundStyle(Palette.mutedForeground)
          .lineLimit(2)
      }
      meta
    }
  }

  /// Names and figures in the title take the reader's highlight color: the
  /// story's category ink, the accent, or none.
  private func title(size: CGFloat) -> AttributedString {
    let ink: Color? =
      switch prefs.highlight {
      case .topic: Palette.topic(Topic.color(forCategory: story.item.category))
      case .one: Palette.accent
      case .none: nil
      }
    func face(_ weight: InterFont) -> Font {
      newspaper
        ? .custom(weight == .regular ? InterFont.regular.serifName : InterFont.semibold.serifName, size: size, relativeTo: .headline)
        : .inter(size, weight)
    }
    var out = AttributedString()
    for segment in Highlight.keywords(story.title, tags: story.item.tags, learned: learned) {
      var piece = AttributedString(segment.text)
      if segment.kind == nil || ink == nil {
        piece.swiftUI.font = face(.regular)
        piece.swiftUI.foregroundColor = Palette.foreground
      } else {
        piece.swiftUI.font = face(.semibold)
        piece.swiftUI.foregroundColor = ink
      }
      out += piece
    }
    return out
  }

  private var meta: some View {
    HStack(spacing: 6) {
      if let category = story.item.category, !category.isEmpty {
        Circle().fill(Palette.topic(Topic.color(forCategory: category))).frame(width: 6, height: 6)
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
