import AIDRKit
import SwiftUI

/// The story's sources: the article and the `source` rows, then
/// "+ N more" for supporting posts and discussion threads. A tap opens the
/// link in Safari.
struct StorySourcesView: View {
  let main: [StorySourceRow]
  let more: [StorySourceRow]
  let lang: Lang
  let open: (URL) -> Void

  @State private var showMore = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(lang == .vi ? "NGUỒN" : "SOURCES")
        .font(.inter(12, .bold, relativeTo: .caption))
        .tracking(0.9)
        .foregroundStyle(Palette.mutedForeground)
        .padding(.bottom, Spacing.xs)
      ForEach(main) { row in
        SourceRowView(row: row, lang: lang, open: open)
      }
      if !more.isEmpty {
        DisclosureGroup(isExpanded: $showMore) {
          ForEach(more) { row in
            SourceRowView(row: row, lang: lang, open: open)
          }
        } label: {
          Text(lang == .vi ? "+ \(more.count) nguồn khác" : "+ \(more.count) more")
            .font(.inter(13.5, .medium, relativeTo: .subheadline))
            .foregroundStyle(Palette.accent)
        }
        .tint(Palette.accent)
        .padding(.top, Spacing.md)
        .accessibilityIdentifier("story-more-sources")
      }
    }
    .accessibilityIdentifier("story-sources")
  }
}

private struct SourceRowView: View {
  let row: StorySourceRow
  let lang: Lang
  let open: (URL) -> Void

  var body: some View {
    Button {
      if let url = row.url { open(url) }
    } label: {
      HStack(alignment: .top, spacing: Spacing.md) {
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Text(row.label)
              .font(.inter(14.5, .semibold, relativeTo: .subheadline))
              .foregroundStyle(Palette.foreground)
            if let role {
              Text(role)
                .font(.mono(9.5, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(Palette.mutedForeground)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .overlay(Capsule().strokeBorder(Palette.border, lineWidth: 0.75))
            }
          }
          if let host = row.host, host != row.label {
            Text(host)
              .font(.inter(12.5, relativeTo: .caption))
              .foregroundStyle(Palette.mutedForeground)
          }
          if let quote = row.quote {
            Text("“\(quote)”")
              .font(.inter(14, relativeTo: .subheadline))
              .foregroundStyle(Palette.body)
              .lineSpacing(2)
              .lineLimit(4)
              .multilineTextAlignment(.leading)
          }
        }
        Spacer(minLength: 0)
        if row.url != nil {
          Image(systemName: "arrow.up.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Palette.mutedForeground)
            .padding(.top, 3)
        }
      }
      .padding(.vertical, 10)
      .contentShape(Rectangle())
      .overlay(alignment: .bottom) { Rectangle().fill(Palette.border).frame(height: 0.5) }
    }
    .buttonStyle(.plain)
    .disabled(row.url == nil)
  }

  private var role: String? {
    switch row.kind {
    case "support": lang == .vi ? "HỖ TRỢ" : "SUPPORT"
    case "discussion": lang == .vi ? "THẢO LUẬN" : "DISCUSSION"
    default: nil
    }
  }
}
