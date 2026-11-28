import AIDRKit
import SwiftUI

/// The day block ("28 • AI;DR / THỨ BẢY · THÁNG 11 2026") and the
/// numbered digest rows.
struct DigestSection: View {
  let feed: Feed
  let lang: Lang
  /// The chip the reader picked: only digest rows about it show.
  let category: String?

  /// Rows on screen; "Show more" steps through TodayDigest.steps.
  @State private var limit = TodayDigest.steps[0]

  var body: some View {
    let all = TodayDigest.rows(feed, lang: lang, category: category)
    let rows = Array(all.prefix(limit))
    VStack(alignment: .leading, spacing: 0) {
      if let tldr = feed.tldr, let parts = EditionDate.parts(tldr.date, lang: lang) {
        DayBlock(day: parts.day, line: parts.line)
          .padding(.horizontal, Spacing.lg)
          .padding(.bottom, Spacing.sm)
      }
      if TodayDigest.rows(feed, lang: lang, category: nil).isEmpty {
        Text(lang == .vi ? "Chưa có AI;DR tiếng Việt cho hôm nay." : "No AI;DR for today yet.")
          .font(.inter(14, relativeTo: .body))
          .foregroundStyle(Palette.mutedForeground)
          .padding(Spacing.lg)
      } else {
        ForEach(rows) { row in
          DigestLink(row: row, learned: feed.learnedKeywords)
            .padding(.horizontal, Spacing.lg)
        }
        if all.count > limit {
          Button {
            withAnimation(.snappy) { limit = TodayDigest.next(after: limit) }
          } label: {
            Label(lang == .vi ? "Xem thêm" : "Show more", systemImage: "chevron.down")
              .labelStyle(TrailingIconLabelStyle())
              .font(.inter(13.5, .medium, relativeTo: .footnote))
              .foregroundStyle(Palette.accent)
              .frame(minHeight: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .padding(.horizontal, Spacing.lg)
          .accessibilityIdentifier("digest-more")
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("today-digest")
  }
}

private struct DayBlock: View {
  let day: String
  let line: String

  var body: some View {
    HStack(alignment: .center, spacing: Spacing.md) {
      Text(day)
        .font(.inter(44, .semibold, relativeTo: .largeTitle))
        .tracking(-1.2)
        .monospacedDigit()
        .foregroundStyle(Palette.foreground)
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Circle().fill(Palette.signal).frame(width: 6, height: 6)
          Text("AI;DR")
            .font(.mono(11, weight: .semibold))
            .tracking(1.1)
            .foregroundStyle(Palette.accent)
        }
        Text(line)
          .font(.mono(11))
          .tracking(1.1)
          .foregroundStyle(Palette.mutedForeground)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("day-block")
  }
}

private struct TrailingIconLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 4) {
      configuration.title
      configuration.icon.font(.system(size: 11, weight: .semibold))
    }
  }
}

/// A digest row that opens the first story it cites.
private struct DigestLink: View {
  let row: DigestRow
  let learned: [String]

  var body: some View {
    Group {
      if let id = row.itemId {
        NavigationLink(value: Route.story(id: id)) {
          DigestRowView(row: row, learned: learned)
        }
        .buttonStyle(.plain)
      } else {
        DigestRowView(row: row, learned: learned)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("digest-row-\(row.rank)")
  }
}

struct DigestRowView: View {
  let row: DigestRow
  let learned: [String]

  var body: some View {
    HStack(alignment: .top, spacing: Spacing.md) {
      Text(String(format: "%02d", row.rank))
        .font(.mono(12, weight: .medium))
        .foregroundStyle(Palette.mutedForeground)
        .padding(.top, 2)
      Text(attributed)
        .lineSpacing(2)
        .lineLimit(3)
        .frame(maxWidth: .infinity, alignment: .leading)
      Thumbnail(url: row.thumbnail)
    }
    .padding(.vertical, 13)
    .overlay(alignment: .bottom) { Rectangle().fill(Palette.border).frame(height: 0.5) }
    .contentShape(Rectangle())
  }

  private var attributed: AttributedString {
    var out = AttributedString()
    if let topic = row.topic {
      var dot = AttributedString("● ")
      dot.swiftUI.font = .system(size: 8)
      dot.swiftUI.foregroundColor = row.topicColor?.color ?? Palette.mutedForeground
      dot.swiftUI.baselineOffset = 1.5
      var label = AttributedString(topic.uppercased() + "  ")
      label.swiftUI.font = .mono(11, weight: .medium)
      label.swiftUI.foregroundColor = Palette.mutedForeground
      label.swiftUI.kern = 0.8
      out += dot + label
    }
    for segment in Highlight.keywords(row.text, tags: row.tags, learned: learned) {
      var piece = AttributedString(segment.text)
      switch segment.kind {
      case .num:
        piece.swiftUI.font = .inter(15, .semibold)
        piece.swiftUI.foregroundColor = Palette.keywordNumber
      case .entity:
        piece.swiftUI.font = .inter(15, .semibold)
        piece.swiftUI.foregroundColor = Palette.keywordEntity
      case nil:
        piece.swiftUI.font = .inter(15)
        piece.swiftUI.foregroundColor = Palette.foreground
      }
      out += piece
    }
    if row.extraCount > 0 {
      var more = AttributedString("  +\(row.extraCount)")
      more.swiftUI.font = .mono(11)
      more.swiftUI.foregroundColor = Palette.mutedForeground
      out += more
    }
    return out
  }
}

struct Thumbnail: View {
  let url: URL?

  var body: some View {
    AsyncImage(url: url) { phase in
      if let image = phase.image {
        image.resizable().scaledToFill()
      } else {
        Palette.muted
      }
    }
    .frame(width: 56, height: 56)
    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    .accessibilityHidden(true)
  }
}
