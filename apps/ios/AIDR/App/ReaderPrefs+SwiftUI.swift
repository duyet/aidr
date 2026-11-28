import AIDRKit
import SwiftUI

extension ReaderAppearance {
  /// nil follows the system.
  var colorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light, .cream, .gray: .light
    case .dark, .black: .dark
    }
  }
}

extension ReaderTextSize {
  /// The Dynamic Type range the app allows: one size, or every size.
  var dynamicTypeRange: ClosedRange<DynamicTypeSize> {
    switch self {
    case .system: .xSmall ... .accessibility5
    case .small: .small ... .small
    case .medium: .medium ... .medium
    case .large: .large ... .large
    case .xLarge: .xLarge ... .xLarge
    case .xxLarge: .xxLarge ... .xxLarge
    case .xxxLarge: .xxxLarge ... .xxxLarge
    }
  }
}
