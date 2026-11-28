import AIDRKit
import SwiftUI

/// Text on the artwork is always white: the pages are dark in every appearance.
/// Keyword colors come from Palette, so the reader's highlight choice applies;
/// the pages force the dark scheme, which is the one they are designed for.
enum BriefInk {
  static let text = Color.white
}

/// One digest bullet over its story image, or over a topic-colored gradient.
struct BriefStoryPage: View {
  let story: BriefStory
  let learned: [String]
  let lang: Lang
  let insets: EdgeInsets

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center) {
        topicChip
        Spacer()
        Text(String(format: "%02d/%02d", story.position, story.total))
          .font(.mono(12, weight: .medium))
          .tracking(0.8)
          .foregroundStyle(BriefInk.text.opacity(0.85))
          .accessibilityLabel(
            lang == .vi
              ? "Tin \(story.position) trên \(story.total)" : "Story \(story.position) of \(story.total)")
      }
      .padding(.top, insets.top + 28)
      .padding(.trailing, BriefCustomizeButton.reserved)
      if let url = story.imageURL {
        BriefImageCard(url: url).padding(.top, Spacing.lg)
      }
      Spacer(minLength: Spacing.lg)
      Text(attributed)
        .lineSpacing(4)
        .minimumScaleFactor(0.6)
        .shadow(color: .black.opacity(0.35), radius: 8, y: 1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .layoutPriority(1)
      if let id = story.row.itemId {
        NavigationLink(value: Route.story(id: id)) {
          Label(lang == .vi ? "Đọc tiếp" : "Read more", systemImage: "arrow.right")
            .labelStyle(BriefTrailingIconLabelStyle())
            .font(.inter(16, .semibold, relativeTo: .body))
            .foregroundStyle(Palette.signalInk)
            .padding(.horizontal, Spacing.xs)
        }
        .buttonStyle(.glassProminent)
        .tint(Palette.signal)
        .controlSize(.large)
        .padding(.top, Spacing.xl)
        .accessibilityIdentifier("brief-read-more")
      }
    }
    .padding(.horizontal, Spacing.xl)
    .padding(.bottom, insets.bottom + Spacing.lg)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background { BriefBackdrop(url: story.imageURL, tint: story.row.topicColor) }
    .environment(\.colorScheme, .dark)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("brief-story-\(story.position)-\(story.imageURL == nil ? "plain" : "image")")
  }

  @ViewBuilder private var topicChip: some View {
    if let topic = story.row.topic {
      HStack(spacing: 7) {
        Circle()
          .fill(story.row.topicColor.map { Palette.topic($0) } ?? BriefInk.text.opacity(0.6))
          .frame(width: 8, height: 8)
        Text(topic.uppercased())
          .font(.mono(11, weight: .semibold))
          .tracking(1)
          .foregroundStyle(BriefInk.text)
          .lineLimit(1)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .glassEffect(.regular, in: Capsule())
    }
  }

  /// Longer bullets get a smaller size so a page rarely needs to shrink.
  private var size: CGFloat {
    switch story.row.text.count {
    case ..<170: 30
    case ..<240: 26
    default: 23
    }
  }

  private var attributed: AttributedString {
    var out = AttributedString()
    for segment in Highlight.keywords(story.row.text, tags: story.row.tags, learned: learned) {
      var piece = AttributedString(segment.text)
      switch segment.kind {
      case .num:
        piece.swiftUI.font = .headline(size, .bold, relativeTo: .title)
        piece.swiftUI.foregroundColor = Palette.keywordNumber
      case .entity:
        piece.swiftUI.font = .headline(size, .bold, relativeTo: .title)
        piece.swiftUI.foregroundColor = Palette.keywordEntity
      case nil:
        piece.swiftUI.font = .headline(size, .medium, relativeTo: .title)
        piece.swiftUI.foregroundColor = BriefInk.text
      }
      out += piece
    }
    return out
  }
}

/// "Read more" with the arrow after the words.
struct BriefTrailingIconLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: Spacing.sm) {
      configuration.title
      configuration.icon
    }
  }
}

/// The story image as a framed card in its own proportions. Many sources
/// are text screenshots, so it is never cropped into giant letters.
struct BriefImageCard: View {
  let url: URL
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    AsyncImage(url: url, transaction: Transaction(animation: reduceMotion ? nil : .easeIn(duration: 0.3))) { phase in
      if let image = phase.image {
        image.resizable().scaledToFit()
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .strokeBorder(.white.opacity(0.14), lineWidth: 0.5)
          }
          .shadow(color: .black.opacity(0.4), radius: 16, y: 8)
      } else {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(.white.opacity(0.08))
          .aspectRatio(16.0 / 9.0, contentMode: .fit)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: 220)
    .accessibilityHidden(true)
  }
}

/// A heavily blurred, darkened copy of the story image (no letter stays
/// legible), or a gradient in the topic's color when there is no image.
struct BriefBackdrop: View {
  let url: URL?
  let tint: TopicColor?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .top) {
        gradient
        if let url {
          AsyncImage(url: url, transaction: Transaction(animation: reduceMotion ? nil : .easeIn(duration: 0.3))) {
            phase in
            if let image = phase.image {
              image.resizable().scaledToFill()
                .frame(width: geo.size.width, height: geo.size.height)
                .clipped()
                .blur(radius: 70, opaque: true)
                .opacity(0.5)
            } else {
              Color.clear
            }
          }
        }
        LinearGradient(
          stops: [
            .init(color: .black.opacity(0.35), location: 0),
            .init(color: .black.opacity(0.3), location: 0.4),
            .init(color: .black.opacity(0.88), location: 1),
          ], startPoint: .top, endPoint: .bottom)
      }
      .frame(width: geo.size.width, height: geo.size.height)
    }
    .ignoresSafeArea()
    .accessibilityHidden(true)
  }

  /// Also the placeholder while an image loads or when it fails.
  private var gradient: some View {
    let base = tint.map { Color(hex: $0.dark) } ?? Color(hex: "#6b6a64")
    return LinearGradient(
      colors: [base.opacity(0.85), base.opacity(0.4), Color(hex: "#161513")],
      startPoint: .topLeading, endPoint: .bottomTrailing)
  }
}
