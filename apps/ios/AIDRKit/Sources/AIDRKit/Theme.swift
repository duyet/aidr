import SwiftUI
import UIKit

/// Text weights. The app uses the iOS system font (SF Pro, or New York for
/// serif, SF Pro Rounded for rounded); the name is kept so call sites stay put.
public enum InterFont: CaseIterable, Sendable {
  case regular, medium, semibold, bold

  public var weight: Font.Weight {
    switch self {
    case .regular: .regular
    case .medium: .medium
    case .semibold: .semibold
    case .bold: .bold
    }
  }
}

extension ReaderFontFamily {
  public var design: Font.Design {
    switch self {
    case .sans: .default
    case .serif: .serif
    case .rounded: .rounded
    }
  }
}

extension ReaderTextSize {
  /// nil follows the iPhone's Dynamic Type setting.
  var contentSizeCategory: UIContentSizeCategory? {
    switch self {
    case .system: nil
    case .small: .small
    case .medium: .medium
    case .large: .large
    case .xLarge: .extraLarge
    case .xxLarge: .extraExtraLarge
    case .xxxLarge: .extraExtraExtraLarge
    }
  }
}

extension Font.TextStyle {
  var uiTextStyle: UIFont.TextStyle {
    switch self {
    case .largeTitle: .largeTitle
    case .title: .title1
    case .title2: .title2
    case .title3: .title3
    case .headline: .headline
    case .subheadline: .subheadline
    case .callout: .callout
    case .footnote: .footnote
    case .caption: .caption1
    case .caption2: .caption2
    default: .body
    }
  }
}

extension Font {
  /// `size` at the reader's text size (or the system Dynamic Type setting),
  /// scaled the way Apple scales `style`. At the default size it is `size`.
  public static func scaledSize(_ size: CGFloat, relativeTo style: Font.TextStyle) -> CGFloat {
    let metrics = UIFontMetrics(forTextStyle: style.uiTextStyle)
    guard let category = ReaderStyle.current.textSize.contentSizeCategory else {
      return metrics.scaledValue(for: size)
    }
    return metrics.scaledValue(
      for: size, compatibleWith: UITraitCollection(preferredContentSizeCategory: category))
  }

  /// Body text in the system font, in the reader's body design.
  public static func inter(_ size: CGFloat, _ weight: InterFont = .regular, relativeTo style: Font.TextStyle = .body)
    -> Font
  {
    .system(
      size: scaledSize(size, relativeTo: style), weight: weight.weight,
      design: ReaderStyle.current.bodyFont.design)
  }

  /// Headlines in the system font, in the reader's headline design.
  public static func headline(
    _ size: CGFloat, _ weight: InterFont = .semibold, relativeTo style: Font.TextStyle = .headline
  ) -> Font {
    .system(
      size: scaledSize(size, relativeTo: style), weight: weight.weight,
      design: ReaderStyle.current.headFont.design)
  }

  /// The eyebrow and number face: the system mono, like the web's font-mono.
  public static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight, design: .monospaced)
  }
}

extension Color {
  /// "#rrggbb" or "#rrggbbaa".
  public init(hex: String) {
    self.init(uiColor: UIColor(hex: hex))
  }

  /// A color that follows the light and dark appearance.
  public init(light: String, dark: String) {
    let l = UIColor(hex: light)
    let d = UIColor(hex: dark)
    self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? d : l })
  }
}

extension UIColor {
  convenience init(hex: String) {
    let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    let value = UInt64(digits, radix: 16) ?? 0
    let hasAlpha = digits.count == 8
    let r = CGFloat((value >> (hasAlpha ? 24 : 16)) & 0xff) / 255
    let g = CGFloat((value >> (hasAlpha ? 16 : 8)) & 0xff) / 255
    let b = CGFloat((value >> (hasAlpha ? 8 : 0)) & 0xff) / 255
    let a = hasAlpha ? CGFloat(value & 0xff) / 255 : 1
    self.init(red: r, green: g, blue: b, alpha: a)
  }
}

extension TopicColor {
  public var color: Color { Color(light: light, dark: dark) }
}

/// Colors from packages/ui/tokens.css (light, then dark), adjusted by the
/// reader's appearance, accent and highlight (apps/web/src/styles.css
/// data-reader-bg, data-accent, data-highlight).
public enum Palette {
  private static var prefs: ReaderPrefs { ReaderStyle.current }

  public static var background: Color {
    switch prefs.appearance {
    case .cream: Color(hex: "#faf6ec")
    case .gray: Color(hex: "#e4e4df")
    case .black: Color(hex: "#000000")
    default: Color(light: "#ffffff", dark: "#1f1e1d")
    }
  }
  public static var foreground: Color {
    prefs.appearance == .cream ? Color(hex: "#2b2620") : Color(light: "#1f1e1d", dark: "#f5f4ee")
  }
  public static let body = Color(light: "#3d3d3a", dark: "#d6d4cc")
  public static var card: Color {
    prefs.appearance == .black ? Color(hex: "#0b0b0b") : Color(light: "#ffffff", dark: "#262624")
  }
  public static var muted: Color {
    prefs.appearance == .black ? Color(hex: "#151515") : Color(light: "#f5f5f3", dark: "#30302e")
  }
  public static let mutedForeground = Color(light: "#64635d", dark: "#a19f96")
  public static let quietForeground = Color(light: "#66655f", dark: "#9c9a92")
  public static let border = Color(light: "#1f1e1d1a", dark: "#ffffff1a")
  public static var accent: Color {
    switch prefs.accent {
    case .yellow: Color(light: "#8f4300", dark: "#f5c518")
    case .blue: Color(light: "#1d4ed8", dark: "#8db4ff")
    case .green: Color(light: "#0e7044", dark: "#5bd39a")
    case .rose: Color(light: "#b0264a", dark: "#ff8da8")
    case .violet: Color(light: "#6a3fd0", dark: "#bba2ff")
    }
  }
  public static let primary = Color(light: "#1f1e1d", dark: "#f5f4ee")
  public static let primaryForeground = Color(light: "#ffffff", dark: "#1f1e1d")
  /// The yellow signal: logo mark and the AI;DR dot. Never text on light.
  public static var signal: Color {
    switch prefs.accent {
    case .yellow: Color(hex: "#f5c518")
    case .blue: Color(hex: "#4c8dff")
    case .green: Color(hex: "#2bb673")
    case .rose: Color(hex: "#f0527a")
    case .violet: Color(hex: "#8b5cf6")
    }
  }
  public static var signalInk: Color {
    switch prefs.accent {
    case .yellow: Color(hex: "#0a0a0a")
    case .green: Color(hex: "#04140c")
    case .blue, .rose, .violet: Color(hex: "#ffffff")
    }
  }
  /// Keyword highlights: numbers and money. "one" uses the accent for every
  /// keyword; "none" leaves keywords in the text color.
  public static var keywordNumber: Color {
    switch prefs.highlight {
    case .topic: Color(light: "#8f4300", dark: "#f5c518")
    case .one: accent
    case .none: foreground
    }
  }
  /// Keyword highlights: companies, products, people.
  public static var keywordEntity: Color {
    switch prefs.highlight {
    case .topic: Color(light: "#1d4ed8", dark: "#a0c3ec")
    case .one: accent
    case .none: foreground
    }
  }
  /// A topic's dot or label color under the reader's highlight choice.
  public static func topic(_ color: TopicColor) -> Color {
    switch prefs.highlight {
    case .topic: color.color
    case .one: accent
    case .none: mutedForeground
    }
  }
}

/// Spacing on the 4pt grid (apps/web/DESIGN.md).
public enum Spacing {
  public static let xs: CGFloat = 4
  public static let sm: CGFloat = 8
  public static let md: CGFloat = 12
  public static let lg: CGFloat = 16
  public static let xl: CGFloat = 24
  public static let xxl: CGFloat = 32
}
