import Foundation
import SwiftUI

/// UserDefaults keys the Settings sheet writes and the rest of the app reads.
public enum SettingsKey {
  /// "system", "vi" or "en".
  public static let language = "aidr.lang"
  /// A `TextSizeChoice` raw value.
  public static let textSize = "aidr.textSize"
  public static let notifyEnabled = "aidr.notify.enabled"
  /// Minutes after midnight, local time.
  public static let notifyMinutes = "aidr.notify.minutes"
  /// Seconds since the epoch of the last foreground refresh attempt.
  public static let lastRefresh = "aidr.refresh.last"
}

public enum LanguageChoice: String, CaseIterable, Identifiable, Sendable {
  case system, vi, en

  public var id: String { rawValue }
}

/// "Theo máy" leaves Dynamic Type to the system. The others pin the app to one step.
public enum TextSizeChoice: String, CaseIterable, Identifiable, Sendable {
  case system, small, medium, large, extraLarge

  public var id: String { rawValue }

  public init(stored: String?) {
    self = stored.flatMap(Self.init(rawValue:)) ?? .system
  }

  public var dynamicTypeSize: DynamicTypeSize? {
    switch self {
    case .system: nil
    case .small: .small
    case .medium: .large
    case .large: .xxLarge
    case .extraLarge: .xxxLarge
    }
  }
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
