import AIDRKit
import SwiftUI

/// Launch arguments for the screenshot journey. A reader never sets them.
/// `-aidr.ui.settings YES` opens the Settings sheet at launch.
/// `-aidr.ui.prefs <json>` replaces the reader preferences for this launch;
/// the saved ones are put back, so the next launch starts clean.
enum SettingsHooks {
  static var showSettings: Bool { UserDefaults.standard.bool(forKey: "aidr.ui.settings") }

  @MainActor
  static func applyPrefs() {
    // Read from the raw arguments: UserDefaults would parse "{}" as a dictionary.
    let args = ProcessInfo.processInfo.arguments
    guard let flag = args.firstIndex(of: "-aidr.ui.prefs"), args.indices.contains(flag + 1),
      let prefs = try? JSONDecoder().decode(ReaderPrefs.self, from: Data(args[flag + 1].utf8))
    else { return }
    let defaults = UserDefaults.standard
    let saved = defaults.data(forKey: ReaderPrefsStore.defaultsKey)
    ReaderPrefsStore.shared.prefs = prefs
    if let saved { defaults.set(saved, forKey: ReaderPrefsStore.defaultsKey) } else { defaults.removeObject(forKey: ReaderPrefsStore.defaultsKey) }
  }
}

extension Lang {
  /// Picks the Vietnamese or the English string. The two never stand in for each other.
  func pick(_ vi: String, _ en: String) -> String { self == .vi ? vi : en }
}

/// A section's small caps title, in the mono eyebrow face the web uses.
struct SettingsHeader: View {
  let text: String
  let lang: Lang
  @ScaledMetric(relativeTo: .caption) private var size: CGFloat = 11

  var body: some View {
    Text(text.uppercased(with: lang.locale))
      .font(.mono(size, weight: .medium))
      .tracking(1.1)
      .foregroundStyle(Palette.mutedForeground)
      .textCase(nil)
  }
}

struct SettingsFootnote: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.inter(13, relativeTo: .footnote))
      .foregroundStyle(Palette.mutedForeground)
  }
}
