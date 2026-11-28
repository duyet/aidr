import Foundation

/// What one daily notification says. Pure: the scheduler turns it into a request.
public struct NotifyContent: Equatable, Sendable {
  public var title: String
  public var subtitle: String?
  public var body: String
  public var threadID: String
  /// The story a tap opens.
  public var storyID: String?
  /// Tried in order for the banner thumbnail.
  public var imageURLs: [URL]

  /// Rows the Today digest shows; "+ N tin nữa" counts the rest of them.
  static let digestShown = 8

  /// The edition's top digest bullet in `lang`. Nil when that language has no digest:
  /// VI never falls back to the EN bullets.
  public static func edition(_ feed: Feed, lang: Lang) -> NotifyContent? {
    guard let tldr = feed.tldr, let top = Digest.bullets(tldr, lang: lang).first else { return nil }
    let bullets = Digest.bullets(tldr, lang: lang)
    let more = max(min(bullets.count, digestShown) - 1, 0)
    let primary = top.itemIds.first.flatMap { feed.itemsById[$0] }
    var seen = Set<URL>()
    let images = [top.imageUrl, primary?.imageUrl].compactMap { $0.flatMap(URL.init(string:)) }
      .filter { seen.insert($0).inserted }
    let label = EditionDate.parse(tldr.date).map { dayLabel($0, lang: lang, timeZone: .gmt) } ?? tldr.date
    return NotifyContent(
      title: "AI;DR · \(label)",
      subtitle: more == 0 ? nil : (lang == .vi ? "+ \(more) tin nữa" : "+ \(more) more \(more == 1 ? "story" : "stories")"),
      body: plainText(top.text),
      threadID: "aidr.edition.\(tldr.date)",
      storyID: top.itemIds.first,
      imageURLs: images)
  }

  /// A fallback for a day the app has no edition for yet. It claims no news.
  public static func generic(for date: Date, lang: Lang, timeZone: TimeZone) -> NotifyContent {
    let day = DateFormatter()
    day.timeZone = timeZone
    day.dateFormat = "yyyy-MM-dd"
    day.locale = Locale(identifier: "en_US_POSIX")
    return NotifyContent(
      title: "AI;DR · \(dayLabel(date, lang: lang, timeZone: timeZone))",
      subtitle: nil,
      body: lang == .vi ? "Bản tin AI;DR hôm nay đã sẵn sàng." : "Today's AI;DR is ready.",
      threadID: "aidr.edition.\(day.string(from: date))",
      storyID: nil,
      imageURLs: [])
  }

  /// "Thứ Bảy 28/11" or "Saturday, Nov 28".
  static func dayLabel(_ date: Date, lang: Lang, timeZone: TimeZone) -> String {
    let formatter = DateFormatter()
    formatter.locale = lang.locale
    formatter.timeZone = timeZone
    formatter.dateFormat = lang == .vi ? "EEEE d/M" : "EEEE, MMM d"
    return formatter.string(from: date).capitalized(with: lang.locale)
  }

  /// A notification body is plain text: drop links, tags and emphasis marks.
  public static func plainText(_ text: String) -> String {
    var out = text
    let rules: [(String, String)] = [
      (#"<[^>]+>"#, ""),
      (#"!?\[([^\]]*)\]\([^)]*\)"#, "$1"),
      (#"(\*\*|__)(.+?)\1"#, "$2"),
      (#"`+([^`]*)`+"#, "$1"),
      (#"\s+"#, " "),
    ]
    for (pattern, template) in rules {
      out = out.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
    }
    return out.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// The story id a tapped notification carries.
  public static func storyID(from userInfo: [AnyHashable: Any]) -> String? {
    userInfo[userInfoStoryKey] as? String
  }

  static let userInfoStoryKey = "storyId"
}
