import AIDRKit
import SwiftUI

/// The heat steps of the calendar, from packages/ui/tokens.css (--heat-1..4).
/// They are the brand yellow on purpose: the accent preference does not recolor them.
enum ArchiveHeat {
  static func background(_ level: Int) -> Color {
    switch level {
    case 1: Color(light: "#fbeeb4", dark: "#3a300b")
    case 2: Color(light: "#f8dc6a", dark: "#6b5612")
    case 3: Color(light: "#f5c518", dark: "#b8930f")
    case 4: Color(light: "#c99a06", dark: "#f5c518")
    default: Palette.muted
    }
  }

  static func foreground(_ level: Int) -> Color {
    switch level {
    case 1, 2: Color(light: "#0a0a0a", dark: "#fafafa")
    case 3, 4: Color(hex: "#0a0a0a")
    default: Palette.mutedForeground
    }
  }
}

/// A headline with the web's keyword highlights: figures in one color, names
/// in another, following the reader's highlight preference through Palette.
struct ArchiveHeadline: View {
  let text: String
  var tags: [String] = []
  var size: CGFloat = 15
  var weight: InterFont = .medium
  /// A topic dot and label before the text, like the Today digest rows.
  var topic: String?
  var topicColor: TopicColor?

  var body: some View {
    Text(attributed).lineSpacing(2)
  }

  private var attributed: AttributedString {
    var out = AttributedString()
    if let topic {
      var dot = AttributedString("● ")
      dot.swiftUI.font = .system(size: 8)
      dot.swiftUI.foregroundColor = topicColor.map { Palette.topic($0) } ?? Palette.mutedForeground
      dot.swiftUI.baselineOffset = 1.5
      var label = AttributedString(topic.uppercased() + "  ")
      label.swiftUI.font = .mono(11, weight: .medium)
      label.swiftUI.foregroundColor = Palette.mutedForeground
      label.swiftUI.kern = 0.8
      out += dot + label
    }
    for segment in Highlight.keywords(text, tags: tags) {
      var piece = AttributedString(segment.text)
      switch segment.kind {
      case .num:
        piece.swiftUI.font = .headline(size, .semibold)
        piece.swiftUI.foregroundColor = Palette.keywordNumber
      case .entity:
        piece.swiftUI.font = .headline(size, .semibold)
        piece.swiftUI.foregroundColor = Palette.keywordEntity
      case nil:
        piece.swiftUI.font = .headline(size, weight)
        piece.swiftUI.foregroundColor = Palette.foreground
      }
      out += piece
    }
    return out
  }
}

/// A rounded story image box. Shows the muted fill until the image arrives.
struct ArchiveThumb: View {
  let url: URL?
  var width: CGFloat? = 56
  var height: CGFloat? = 56
  var radius: CGFloat = 8

  var body: some View {
    AsyncImage(url: url) { phase in
      if let image = phase.image {
        image.resizable().scaledToFill()
      } else {
        Palette.muted
      }
    }
    .frame(width: width, height: height)
    .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    .accessibilityHidden(true)
  }
}

/// "● MODELS · deepmind.google": the category dot and name, then the publisher.
struct ArchiveEyebrow: View {
  let category: String?
  let host: String?
  let lang: Lang

  var body: some View {
    HStack(spacing: 6) {
      if let category {
        Circle().fill(Palette.topic(Topic.color(forCategory: category))).frame(width: 6, height: 6)
        Text(Topic.label(category, lang: lang).uppercased())
      }
      if let host {
        if category != nil { Text("·") }
        Text(host)
      }
    }
    .font(.mono(11, weight: .medium))
    .tracking(0.8)
    .foregroundStyle(Palette.mutedForeground)
    .lineLimit(1)
  }
}

/// A small mono section label.
struct ArchiveSectionLabel: View {
  let text: String

  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text.uppercased())
      .font(.mono(11, weight: .medium))
      .tracking(1.1)
      .foregroundStyle(Palette.mutedForeground)
      .accessibilityAddTraits(.isHeader)
  }
}

/// "Cập nhật 5 phút trước" / "Updated 5 min. ago", refreshed every minute. While
/// the screen shows saved content because a refresh failed: "Ngoại tuyến · bản
/// lưu lúc 07:12" / "Offline · saved 07:12".
struct ArchiveFreshness: View {
  let updatedAt: Date?
  let offline: Bool
  let lang: Lang
  /// Extra diagnostics for the accessibility tree, e.g. the last error.
  var detail: String?

  var body: some View {
    TimelineView(.everyMinute) { context in
      let text = label(now: context.date)
      if !text.isEmpty {
        Text(text)
          .font(.mono(11))
          .foregroundStyle(Palette.mutedForeground)
          .accessibilityValue(detail ?? "")
          .accessibilityIdentifier("archive-freshness")
      }
    }
  }

  private func label(now: Date) -> String {
    let locale = Locale(identifier: lang == .vi ? "vi_VN" : "en_US")
    if offline {
      guard let updatedAt else { return lang == .vi ? "Ngoại tuyến" : "Offline" }
      let time = updatedAt.formatted(Date.FormatStyle().hour().minute().locale(locale))
      return lang == .vi ? "Ngoại tuyến · bản lưu lúc \(time)" : "Offline · saved \(time)"
    }
    guard let updatedAt else { return "" }
    if now.timeIntervalSince(updatedAt) < 60 {
      return lang == .vi ? "Vừa cập nhật" : "Updated just now"
    }
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = locale
    formatter.unitsStyle = .short
    let relative = formatter.localizedString(for: updatedAt, relativeTo: now)
    return (lang == .vi ? "Cập nhật " : "Updated ") + relative
  }
}

struct ArchiveHairline: View {
  var body: some View {
    Rectangle().fill(Palette.border).frame(height: 0.5)
  }
}

/// A centered message for an empty or failed screen.
struct ArchiveNote: View {
  let text: String
  var systemImage: String?

  var body: some View {
    VStack(spacing: Spacing.sm) {
      if let systemImage {
        Image(systemName: systemImage).font(.system(size: 22)).foregroundStyle(Palette.mutedForeground)
      }
      Text(text)
        .font(.inter(14, relativeTo: .body))
        .foregroundStyle(Palette.mutedForeground)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(Spacing.xl)
  }
}

/// The day block ("26 • AI;DR / THỨ NĂM · THÁNG 11 2026"), like Today's.
struct ArchiveDayBlock: View {
  let date: String
  let lang: Lang
  var count: Int?

  var body: some View {
    let parts = EditionDate.parts(date, lang: lang)
    HStack(alignment: .center, spacing: Spacing.md) {
      Text(parts?.day ?? String(date.suffix(2)))
        .font(.headline(44, .semibold, relativeTo: .largeTitle))
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
        Text(parts?.line ?? date)
          .font(.mono(11))
          .tracking(1.1)
          .foregroundStyle(Palette.mutedForeground)
      }
      Spacer(minLength: Spacing.sm)
      if let count {
        Text(ArchiveCalendar.storiesLabel(count, lang: lang))
          .font(.inter(13, .medium, relativeTo: .footnote))
          .monospacedDigit()
          .foregroundStyle(Palette.foreground)
          .padding(.horizontal, Spacing.md)
          .frame(minHeight: 30)
          .background(Palette.muted, in: Capsule())
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("archive-day-block")
  }
}

/// Previous and next as two glass capsules.
struct ArchiveStepper: View {
  let previousTitle: String
  let nextTitle: String
  let canGoPrevious: Bool
  let canGoNext: Bool
  let previous: () -> Void
  let next: () -> Void

  var body: some View {
    HStack(spacing: Spacing.sm) {
      Button(action: previous) {
        Label(previousTitle, systemImage: "chevron.left")
          .font(.inter(13, .semibold, relativeTo: .footnote))
      }
      .buttonStyle(.glass)
      .disabled(!canGoPrevious)
      .accessibilityIdentifier("archive-previous")
      Spacer(minLength: 0)
      Button(action: next) {
        HStack(spacing: 6) {
          Text(nextTitle)
          Image(systemName: "chevron.right")
        }
        .font(.inter(13, .semibold, relativeTo: .footnote))
      }
      .buttonStyle(.glass)
      .disabled(!canGoNext)
      .accessibilityIdentifier("archive-next")
    }
    .tint(Palette.foreground)
  }
}
