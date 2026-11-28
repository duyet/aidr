import SwiftUI

/// The three canvases of "Share as image". Sizes are points; the PNG is 3x.
public enum ShareCardAspect: String, CaseIterable, Identifiable, Sendable {
  /// 4:5, the feed post.
  case portrait
  /// 1:1.
  case square
  /// 9:16, for stories.
  case story

  public var id: String { rawValue }

  public static let renderScale: CGFloat = 3

  public var size: CGSize {
    switch self {
    case .portrait: CGSize(width: 360, height: 450)
    case .square: CGSize(width: 360, height: 360)
    case .story: CGSize(width: 360, height: 640)
    }
  }

  public var label: String {
    switch self {
    case .portrait: "4:5"
    case .square: "1:1"
    case .story: "9:16"
    }
  }

  /// The PNG's size in pixels.
  public var pixelSize: CGSize {
    CGSize(width: size.width * Self.renderScale, height: size.height * Self.renderScale)
  }

  var headlineSize: CGFloat {
    switch self {
    case .portrait: 21
    case .square: 19
    case .story: 25
    }
  }

  var headlineLines: Int {
    switch self {
    case .portrait: 4
    case .square: 3
    case .story: 6
    }
  }

  var summaryLines: Int {
    switch self {
    case .portrait: 4
    case .square: 3
    case .story: 11
    }
  }

  var imageMaxHeight: CGFloat {
    switch self {
    case .portrait: 200
    case .square: 140
    case .story: 300
    }
  }
}

/// What sits behind the card.
public enum ShareCardBackground: Hashable, Sendable {
  /// The story image, blurred. Needs an image; without one the first gradient stands in.
  case blur
  case gradient(Int)
  case solid(Int)
}

/// The swatches: six gradients (the first is the AI;DR yellow) and six solids.
public enum ShareCardPalette {
  public struct Swatch: Sendable {
    public let hex: [String]
    public let en: String
    public let vi: String

    public func name(_ lang: Lang) -> String { lang == .vi ? vi : en }
  }

  public static let gradients: [Swatch] = [
    Swatch(hex: ["#f5c518", "#ffe27a"], en: "AI;DR yellow", vi: "Vàng AI;DR"),
    Swatch(hex: ["#ff9966", "#ff5e62"], en: "Sunset", vi: "Hoàng hôn"),
    Swatch(hex: ["#36d1dc", "#5b86e5"], en: "Ocean", vi: "Đại dương"),
    Swatch(hex: ["#a18cd1", "#fbc2eb"], en: "Violet", vi: "Tím"),
    Swatch(hex: ["#84fab0", "#8fd3f4"], en: "Mint", vi: "Bạc hà"),
    Swatch(hex: ["#3a3d44", "#15161a"], en: "Graphite", vi: "Than chì"),
  ]

  public static let solids: [Swatch] = [
    Swatch(hex: ["#f5f4ee"], en: "Paper", vi: "Giấy"),
    Swatch(hex: ["#1f1e1d"], en: "Ink", vi: "Mực"),
    Swatch(hex: ["#f5c518"], en: "Yellow", vi: "Vàng"),
    Swatch(hex: ["#1d4ed8"], en: "Blue", vi: "Xanh dương"),
    Swatch(hex: ["#be185d"], en: "Pink", vi: "Hồng"),
    Swatch(hex: ["#0f766e"], en: "Teal", vi: "Xanh ngọc"),
  ]

  /// Every background in swatch order. `.blur` leads when `withBlur`.
  public static func backgrounds(withBlur: Bool) -> [ShareCardBackground] {
    var out: [ShareCardBackground] = withBlur ? [.blur] : []
    out += gradients.indices.map { ShareCardBackground.gradient($0) }
    out += solids.indices.map { ShareCardBackground.solid($0) }
    return out
  }

  public static func gradient(_ index: Int) -> LinearGradient {
    let swatch = gradients[min(max(index, 0), gradients.count - 1)]
    return LinearGradient(
      colors: swatch.hex.map { Color(hex: $0) }, startPoint: .topLeading, endPoint: .bottomTrailing)
  }

  public static func solid(_ index: Int) -> Color {
    Color(hex: solids[min(max(index, 0), solids.count - 1)].hex[0])
  }

  public static func name(_ background: ShareCardBackground, lang: Lang) -> String {
    switch background {
    case .blur: lang == .vi ? "Ảnh mờ" : "Blurred image"
    case .gradient(let i): gradients[min(max(i, 0), gradients.count - 1)].name(lang)
    case .solid(let i): solids[min(max(i, 0), solids.count - 1)].name(lang)
    }
  }

  /// A stable id for tests and accessibility: "blur", "gradient-2", "solid-0".
  public static func identifier(_ background: ShareCardBackground) -> String {
    switch background {
    case .blur: "blur"
    case .gradient(let i): "gradient-\(i)"
    case .solid(let i): "solid-\(i)"
    }
  }
}

/// The composer's controls. Equatable and Sendable so a view can re-render on change.
public struct ShareCardStyle: Equatable, Sendable {
  public static let paddingRange: ClosedRange<Double> = 0...48
  public static let radiusRange: ClosedRange<Double> = 0...36
  public static let shadowRange: ClosedRange<Double> = 0...1

  public var aspect: ShareCardAspect = .portrait
  public var background: ShareCardBackground = .gradient(0)
  /// The canvas margin around the card, in points.
  public var padding: Double = 22
  /// The card's corner radius, in points.
  public var cornerRadius: Double = 22
  /// 0 is flat, 1 is the deepest shadow.
  public var shadow: Double = 0.4

  public init() {}
}
