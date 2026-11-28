import Foundation

/// UserDefaults keys for what Settings owns beyond ReaderPrefs (those are one
/// JSON value under "aidr.prefs").
public enum SettingsKey {
  public static let notifyEnabled = "aidr.notify.enabled"
  /// Minutes after midnight, local time.
  public static let notifyMinutes = "aidr.notify.minutes"
  /// Seconds since the epoch of the last foreground refresh attempt.
  public static let lastRefresh = "aidr.refresh.last"
}

extension Lang {
  public var locale: Locale { Locale(identifier: self == .vi ? "vi_VN" : "en_US") }
}

/// The daily notification's switch and time.
public enum NotifyPrefs {
  public static let defaultMinutes = 7 * 60

  public static func clamp(_ minutes: Int) -> Int { min(max(minutes, 0), 24 * 60 - 1) }

  public static func enabled(_ defaults: UserDefaults = .standard) -> Bool {
    defaults.bool(forKey: SettingsKey.notifyEnabled)
  }

  public static func minutes(_ defaults: UserDefaults = .standard) -> Int {
    guard let stored = defaults.object(forKey: SettingsKey.notifyMinutes) as? Int else { return defaultMinutes }
    return clamp(stored)
  }
}
