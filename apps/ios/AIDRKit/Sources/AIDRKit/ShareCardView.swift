import CoreTransferable
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// What the card says. The composer builds it from a story.
public struct ShareCardContent {
  public var topic: String?
  public var topicColor: TopicColor
  /// "27 THG 11, 2026"
  public var dateLine: String
  public var headline: String
  /// The story's tags, for keyword colors.
  public var tags: [String]
  /// The AI;DR summary in the reader's language, or empty.
  public var summary: String
  /// Already downloaded: ImageRenderer does not wait for AsyncImage.
  public var image: UIImage?

  public init(
    topic: String?, topicColor: TopicColor, dateLine: String, headline: String, tags: [String],
    summary: String, image: UIImage?
  ) {
    self.topic = topic
    self.topicColor = topicColor
    self.dateLine = dateLine
    self.headline = headline
    self.tags = tags
    self.summary = summary
    self.image = image
  }
}

/// The story card on its background. The preview draws it live and
/// `ShareCardRenderer` draws the same view into the PNG. Colors are fixed to
/// the light palette so the card reads the same in every appearance.
public struct ShareCardView: View {
  private let content: ShareCardContent
  private let style: ShareCardStyle

  public init(content: ShareCardContent, style: ShareCardStyle) {
    self.content = content
    self.style = style
  }

  private enum Ink {
    static let card = Color(hex: "#ffffff")
    static let foreground = Color(hex: "#1f1e1d")
    static let body = Color(hex: "#3d3d3a")
    static let muted = Color(hex: "#64635d")
    static let rule = Color(hex: "#1f1e1d1a")
  }

  private static func inter(_ size: CGFloat, _ weight: InterFont) -> Font {
    .custom(weight.rawValue, fixedSize: size)
  }

  public var body: some View {
    let size = style.aspect.size
    ZStack {
      ShareCardBackdrop(background: style.background, image: content.image, size: size)
      card.padding(style.padding)
    }
    .frame(width: size.width, height: size.height)
    .clipped()
    .environment(\.colorScheme, .light)
    .environment(\.dynamicTypeSize, .large)
  }

  private var card: some View {
    let aspect = style.aspect
    let hasImage = content.image != nil
    return VStack(alignment: .leading, spacing: 10) {
      metaLine
      Text(attributed(content.headline, size: aspect.headlineSize, base: .semibold, emphasis: .semibold))
        .tracking(-0.4)
        .lineSpacing(1)
        .lineLimit(aspect.headlineLines)
        .multilineTextAlignment(.leading)
      if let image = content.image { hero(image, maxHeight: aspect.imageMaxHeight) }
      if !content.summary.isEmpty { summaryBlock(lines: aspect.summaryLines + (hasImage ? 0 : 4)) }
      Spacer(minLength: 0)
      footer
    }
    .padding(18)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Ink.card, in: RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous).strokeBorder(Ink.rule, lineWidth: 0.5)
    )
    .shadow(color: .black.opacity(0.32 * style.shadow), radius: 26 * style.shadow, x: 0, y: 12 * style.shadow)
  }

  private var metaLine: some View {
    HStack(spacing: 6) {
      if content.topic != nil {
        Circle().fill(Color(hex: content.topicColor.light)).frame(width: 7, height: 7)
      }
      Text(([content.topic].compactMap { $0 } + [content.dateLine]).joined(separator: " · "))
        .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
        .tracking(0.8)
        .foregroundStyle(Ink.muted)
        .lineLimit(1)
    }
  }

  private func hero(_ image: UIImage, maxHeight: CGFloat) -> some View {
    Image(uiImage: image)
      .resizable()
      .scaledToFill()
      .frame(maxWidth: .infinity, minHeight: 56, maxHeight: maxHeight)
      .clipShape(RoundedRectangle(cornerRadius: min(12, style.cornerRadius), style: .continuous))
  }

  private func summaryBlock(lines: Int) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 5) {
        Circle().fill(Palette.signal).frame(width: 6, height: 6)
        Text("AI;DR")
          .font(.system(size: 10.5, weight: .bold, design: .monospaced))
          .tracking(1)
          .foregroundStyle(Ink.foreground)
      }
      Text(attributed(content.summary, size: 13.5, base: .regular, emphasis: .semibold))
        .lineSpacing(3)
        .lineLimit(lines)
        .multilineTextAlignment(.leading)
    }
  }

  private var footer: some View {
    HStack(spacing: 7) {
      Text(";")
        .font(Self.inter(13, .bold))
        .foregroundStyle(Palette.signalInk)
        .frame(width: 20, height: 20)
        .background(Palette.signal, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
      Text("AI;DR")
        .font(Self.inter(14, .semibold))
        .foregroundStyle(Ink.foreground)
      Spacer(minLength: 0)
      Text("aidr.today")
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(Ink.muted)
    }
  }

  /// Names and figures take their own hue, like the story page.
  private func attributed(_ text: String, size: CGFloat, base: InterFont, emphasis: InterFont) -> AttributedString {
    var out = AttributedString()
    for segment in Highlight.keywords(text, tags: content.tags) {
      var piece = AttributedString(segment.text)
      if segment.kind != nil {
        piece.swiftUI.font = Self.inter(size, emphasis)
        piece.swiftUI.foregroundColor = Color(hex: Topic.color(forTag: segment.text).light)
      } else {
        piece.swiftUI.font = Self.inter(size, base)
        piece.swiftUI.foregroundColor = base == .regular ? Ink.body : Ink.foreground
      }
      out += piece
    }
    return out
  }
}

struct ShareCardBackdrop: View {
  let background: ShareCardBackground
  let image: UIImage?
  let size: CGSize

  var body: some View {
    switch background {
    case .blur:
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .frame(width: size.width, height: size.height)
          .clipped()
          .blur(radius: 34, opaque: true)
          .saturation(1.25)
          .overlay(Color.black.opacity(0.10))
      } else {
        ShareCardPalette.gradient(0)
      }
    case .gradient(let index):
      ShareCardPalette.gradient(index)
    case .solid(let index):
      ShareCardPalette.solid(index)
    }
  }
}

/// Draws the card into a PNG at 3x.
@MainActor
public enum ShareCardRenderer {
  public static func render(_ content: ShareCardContent, style: ShareCardStyle) -> UIImage? {
    let renderer = ImageRenderer(content: ShareCardView(content: content, style: style))
    renderer.scale = ShareCardAspect.renderScale
    renderer.proposedSize = ProposedViewSize(style.aspect.size)
    renderer.isOpaque = true
    return renderer.uiImage
  }
}

/// A rendered card, ready for ShareLink. Offered as a PNG so "Save Image"
/// shows in the share sheet.
public struct ShareCardImage: Transferable, Sendable {
  public let png: Data

  public init(png: Data) {
    self.png = png
  }

  public static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .png) { $0.png }
  }
}
