import SwiftUI

/// Inter ships in the app bundle (UIAppFonts). These are the PostScript names
/// of the static TTFs from the Inter 4.1 release.
public enum InterFont: String, CaseIterable, Sendable {
  case regular = "Inter-Regular"
  case medium = "Inter-Medium"
  case semibold = "Inter-SemiBold"
  case bold = "Inter-Bold"
}
