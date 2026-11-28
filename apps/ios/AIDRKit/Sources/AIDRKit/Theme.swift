import SwiftUI
import UIKit

/// Inter ships in the app bundle (UIAppFonts). These are the PostScript names
/// of the static TTFs from the Inter 4.1 release.
public enum InterFont: String, CaseIterable, Sendable {
  case regular = "Inter-Regular"
  case medium = "Inter-Medium"
  case semibold = "Inter-SemiBold"
  case bold = "Inter-Bold"
}

extension Font {
  /// Inter at `size`, scaled with Dynamic Type relative to `style`.
  public static func inter(_ size: CGFloat, _ weight: InterFont = .regular, relativeTo style: Font.TextStyle = .body)
    -> Font
  {
    .custom(weight.rawValue, size: size, relativeTo: style)
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

/// Colors from packages/ui/tokens.css (light, then dark).
public enum Palette {
  public static let background = Color(light: "#ffffff", dark: "#1f1e1d")
  public static let foreground = Color(light: "#1f1e1d", dark: "#f5f4ee")
  public static let body = Color(light: "#3d3d3a", dark: "#d6d4cc")
  public static let card = Color(light: "#ffffff", dark: "#262624")
  public static let muted = Color(light: "#f5f5f3", dark: "#30302e")
  public static let mutedForeground = Color(light: "#64635d", dark: "#a19f96")
  public static let quietForeground = Color(light: "#66655f", dark: "#9c9a92")
  public static let border = Color(light: "#1f1e1d1a", dark: "#ffffff1a")
  public static let accent = Color(light: "#8f4300", dark: "#f5c518")
  public static let primary = Color(light: "#1f1e1d", dark: "#f5f4ee")
  public static let primaryForeground = Color(light: "#ffffff", dark: "#1f1e1d")
  /// The yellow signal: logo mark and the AI;DR dot. Never text on light.
  public static let signal = Color(hex: "#f5c518")
  public static let signalInk = Color(hex: "#0a0a0a")
  /// Keyword highlights: numbers and money.
  public static let keywordNumber = Color(light: "#8f4300", dark: "#f5c518")
  /// Keyword highlights: companies, products, people.
  public static let keywordEntity = Color(light: "#1d4ed8", dark: "#a0c3ec")
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
