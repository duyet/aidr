import AIDRKit
import SwiftUI

/// Pins Dynamic Type to the size picked in Settings. "Theo máy" leaves the
/// system's size alone. Every `.inter(relativeTo:)` font follows it.
struct TextSizeModifier: ViewModifier {
  @AppStorage(SettingsKey.textSize) private var stored = TextSizeChoice.system.rawValue

  func body(content: Content) -> some View {
    content.transformEnvironment(\.dynamicTypeSize) { size in
      if let pinned = TextSizeChoice(stored: stored).dynamicTypeSize { size = pinned }
    }
  }
}

/// Launch arguments for the screenshot journey. A reader never sets them.
/// `-aidr.ui.settings YES` opens the Settings sheet at launch, `-aidr.ui.dark YES`
/// forces dark mode for this launch only.
enum SettingsHooks {
  static var showSettings: Bool { UserDefaults.standard.bool(forKey: "aidr.ui.settings") }
  static var dark: Bool { UserDefaults.standard.bool(forKey: "aidr.ui.dark") }
}
