import Foundation
import Observation

// Reader preferences, mirroring the website's Customize panel
// (apps/web/src/lib/prefs.ts). One value type, saved as JSON in
// UserDefaults under "aidr.prefs".

public enum ReaderAppearance: String, Codable, CaseIterable, Sendable {
  case system, light, cream, gray, dark, black
}

public enum ReaderLanguage: String, Codable, CaseIterable, Sendable {
  case system, vi, en

  public func resolve(_ languages: [String] = Locale.preferredLanguages) -> Lang {
    switch self {
    case .system: Lang.preferred(languages)
    case .vi: .vi
    case .en: .en
    }
  }
}

public enum ReaderFontFamily: String, Codable, CaseIterable, Sendable {
  case sans, serif
}

/// "system" follows the iPhone's Dynamic Type setting.
public enum ReaderTextSize: String, Codable, CaseIterable, Sendable {
  case system, small, medium, large, xLarge, xxLarge, xxxLarge
}

/// Recolors the logo mark, links and highlights, as on the web.
public enum ReaderAccent: String, Codable, CaseIterable, Sendable {
  case yellow, blue, green, rose, violet
}

/// Keyword color: each topic's own ink, the accent for all, or plain text.
public enum ReaderHighlight: String, Codable, CaseIterable, Sendable {
  case topic, one, none
}

public enum ReaderLayout: String, Codable, CaseIterable, Sendable {
  case compact, comfortable, newspaper
}

/// The AI;DR digest look: thumbnails, or two or three lines per row.
public enum ReaderDigestView: String, Codable, CaseIterable, Sendable {
  case image, rows2, rows3
}

public struct ReaderPrefs: Codable, Hashable, Sendable {
  public static let digestCounts = [8, 12, 16]

  public var appearance: ReaderAppearance = .system
  public var language: ReaderLanguage = .system
  public var bodyFont: ReaderFontFamily = .sans
  public var headFont: ReaderFontFamily = .sans
  public var textSize: ReaderTextSize = .system
  public var accent: ReaderAccent = .yellow
  public var highlight: ReaderHighlight = .topic
  public var layout: ReaderLayout = .compact
  public var digestView: ReaderDigestView = .rows2
  public var digestCount: Int = 8
  /// Thumbnails in the ranked list.
  public var thumbnails: Bool = true
  /// Summary lines under ranked-list titles.
  public var summaries: Bool = false
  /// Show the other language under the leading one.
  public var bilingual: Bool = false

  public init() {}

  /// Missing or unknown keys fall back to the default, so an older saved
  /// value never resets everything.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let d = ReaderPrefs()
    appearance = (try? c.decodeIfPresent(ReaderAppearance.self, forKey: .appearance)) ?? d.appearance
    language = (try? c.decodeIfPresent(ReaderLanguage.self, forKey: .language)) ?? d.language
    bodyFont = (try? c.decodeIfPresent(ReaderFontFamily.self, forKey: .bodyFont)) ?? d.bodyFont
    headFont = (try? c.decodeIfPresent(ReaderFontFamily.self, forKey: .headFont)) ?? d.headFont
    textSize = (try? c.decodeIfPresent(ReaderTextSize.self, forKey: .textSize)) ?? d.textSize
    accent = (try? c.decodeIfPresent(ReaderAccent.self, forKey: .accent)) ?? d.accent
    highlight = (try? c.decodeIfPresent(ReaderHighlight.self, forKey: .highlight)) ?? d.highlight
    layout = (try? c.decodeIfPresent(ReaderLayout.self, forKey: .layout)) ?? d.layout
    digestView = (try? c.decodeIfPresent(ReaderDigestView.self, forKey: .digestView)) ?? d.digestView
    let count = (try? c.decodeIfPresent(Int.self, forKey: .digestCount)) ?? d.digestCount
    digestCount = Self.digestCounts.contains(count) ? count : d.digestCount
    thumbnails = (try? c.decodeIfPresent(Bool.self, forKey: .thumbnails)) ?? d.thumbnails
    summaries = (try? c.decodeIfPresent(Bool.self, forKey: .summaries)) ?? d.summaries
    bilingual = (try? c.decodeIfPresent(Bool.self, forKey: .bilingual)) ?? d.bilingual
  }
}

/// The live preferences. Views read and write `prefs`; every change is saved
/// and published to ReaderStyle, which Font and Palette read.
@MainActor
@Observable
public final class ReaderPrefsStore {
  public static let shared = ReaderPrefsStore()
  public static let defaultsKey = "aidr.prefs"

  public var prefs: ReaderPrefs {
    didSet {
      guard prefs != oldValue else { return }
      ReaderStyle.current = prefs
      if let data = try? JSONEncoder().encode(prefs) {
        defaults.set(data, forKey: Self.defaultsKey)
      }
    }
  }

  private let defaults: UserDefaults

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let saved = defaults.data(forKey: Self.defaultsKey)
      .flatMap { try? JSONDecoder().decode(ReaderPrefs.self, from: $0) }
    prefs = saved ?? ReaderPrefs()
    ReaderStyle.current = prefs
  }

  public func reset() { prefs = ReaderPrefs() }
}

/// The preferences as last published, for code that runs outside the view
/// tree's observation (Font and Palette helpers). Written on the main actor
/// only; RootView rebuilds the tree when it changes.
public enum ReaderStyle {
  nonisolated(unsafe) public static var current = ReaderPrefs()
}
