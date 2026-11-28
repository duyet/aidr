import Foundation

/// How Today words its day heading, update line and row meta. Ports of
/// formatDayHeading, timeAgo and publisherHost in apps/web/src/lib.
public enum TodayFormat {
  static func locale(_ lang: Lang) -> Locale { Locale(identifier: lang == .vi ? "vi_VN" : "en_US") }

  /// "Thứ Bảy, 28 thg 11, 2026" or "Saturday, Nov 28, 2026" for a yyyy-MM-dd
  /// edition date; nil when the date does not parse.
  public static func dayHeading(_ date: String, lang: Lang) -> String? {
    guard let value = EditionDate.parse(date) else { return nil }
    let formatter = DateFormatter()
    formatter.locale = locale(lang)
    formatter.timeZone = .gmt
    formatter.formattingContext = .beginningOfSentence
    formatter.setLocalizedDateFormatFromTemplate("EEEEMMMdy")
    return formatter.string(from: value)
  }

  /// "9 phút trước" / "9m ago"; `short` drops the "trước" / "ago": "9 giờ" / "9h".
  public static func ago(_ date: Date, now: Date, lang: Lang, short: Bool = false) -> String {
    let seconds = max(0, Int(now.timeIntervalSince(date)))
    let unit: (value: Int, vi: String, en: String)
    if seconds < 3600 {
      unit = (max(1, seconds / 60), "phút", "m")
    } else if seconds < 86400 {
      unit = (seconds / 3600, "giờ", "h")
    } else {
      unit = (seconds / 86400, "ngày", "d")
    }
    switch (lang, short) {
    case (.vi, true): return "\(unit.value) \(unit.vi)"
    case (.vi, false): return "\(unit.value) \(unit.vi) trước"
    case (.en, true): return "\(unit.value)\(unit.en)"
    case (.en, false): return "\(unit.value)\(unit.en) ago"
    }
  }

  /// "36 tin · cập nhật 9 phút trước" / "36 stories · updated 9m ago".
  public static func summary(count: Int, updatedAt: Date?, now: Date, lang: Lang) -> String {
    let stories = lang == .vi ? "\(count) tin" : "\(count) stories"
    guard let updatedAt else { return stories }
    let ago = ago(updatedAt, now: now, lang: lang)
    return lang == .vi ? "\(stories) · cập nhật \(ago)" : "\(stories) · updated \(ago)"
  }

  /// The publisher's host without "www.", as the web's meta line shows it.
  public static func host(_ url: String) -> String? {
    guard let host = URL(string: url)?.host(percentEncoded: false), !host.isEmpty else { return nil }
    return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
  }
}

/// A story that has a title in the reader's language.
public struct TodayStory: Identifiable, Equatable, Sendable {
  public let item: Item
  public let title: String
  /// The summary from the reader's language column, never the other one.
  public let summary: String?
  /// The other language's title, for the bilingual view; nil when it is
  /// missing or the same as `title`.
  public let secondTitle: String?

  public init(item: Item, title: String, summary: String? = nil, secondTitle: String? = nil) {
    self.item = item
    self.title = title
    self.summary = summary
    self.secondTitle = secondTitle
  }

  public var id: String { item.id }
}

/// A category chip: the name as the feed spells it and how many of today's
/// stories carry it.
public struct TodayChip: Identifiable, Equatable, Sendable {
  public let name: String
  public let count: Int

  public init(name: String, count: Int) {
    self.name = name
    self.count = count
  }

  public var id: String { name }
}

public enum TodayStories {
  /// Today's stories in feed rank order. A story with no title in `lang` is
  /// left out: VI and EN never stand in for each other.
  public static func visible(_ items: [Item], lang: Lang, bilingual: Bool = false) -> [TodayStory] {
    items.compactMap { item in
      guard let title = item.title(in: lang) else { return nil }
      let summary = (lang == .vi ? item.summaryVi : item.summary)?.trimmingCharacters(in: .whitespacesAndNewlines)
      let other = bilingual ? item.title(in: lang == .vi ? .en : .vi) : nil
      return TodayStory(
        item: item, title: title,
        summary: summary?.isEmpty == false ? summary : nil,
        secondTitle: other == title ? nil : other)
    }
  }

  /// The newest day the feed holds: its date and its stories.
  public static func today(_ feed: Feed, lang: Lang, bilingual: Bool = false) -> (date: String?, stories: [TodayStory]) {
    let day = feed.days.first
    return (day?.date ?? feed.tldr?.date, visible(day?.items ?? [], lang: lang, bilingual: bilingual))
  }

  /// The web's tag filter: the story is tagged with it, or its title says it.
  public static func hasTag(_ item: Item, _ tag: String) -> Bool {
    let needle = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return false }
    return item.tags.contains { $0.lowercased() == needle }
      || item.title.lowercased().contains(needle)
      || (item.titleVi?.lowercased().contains(needle) ?? false)
  }

  /// Trending tags that match at least one of today's stories, with how many.
  public static func tagChips(_ trending: [TrendingTag], stories: [TodayStory], limit: Int = 12) -> [TodayChip] {
    var seen = Set<String>()
    var out: [TodayChip] = []
    for entry in trending {
      let key = entry.tag.lowercased()
      guard seen.insert(key).inserted else { continue }
      let count = stories.filter { hasTag($0.item, entry.tag) }.count
      if count > 0 { out.append(TodayChip(name: entry.tag, count: count)) }
      if out.count == limit { break }
    }
    return out
  }

  /// One chip per category in `stories`, the busiest first.
  public static func chips(_ stories: [TodayStory]) -> [TodayChip] {
    var counts: [String: (name: String, count: Int)] = [:]
    for story in stories {
      guard let name = story.item.category, let key = Topic.canonical(name) else { continue }
      counts[key, default: (name, 0)].count += 1
    }
    return counts.values
      .map { TodayChip(name: $0.name, count: $0.count) }
      .sorted { $0.count != $1.count ? $0.count > $1.count : $0.name < $1.name }
  }

  /// True when two category names are the same category: case and spaces do not matter.
  public static func sameCategory(_ a: String?, _ b: String?) -> Bool {
    guard let a = Topic.canonical(a), let b = Topic.canonical(b) else { return false }
    return a == b
  }

  public static func filter(_ stories: [TodayStory], category: String?, tag: String? = nil) -> [TodayStory] {
    stories.filter { matches($0.item, category: category, tag: tag) }
  }

  /// Both the category and the tag, when given, must match.
  public static func matches(_ item: Item, category: String?, tag: String?) -> Bool {
    if let key = Topic.canonical(category), Topic.canonical(item.category) != key { return false }
    if let tag, !hasTag(item, tag) { return false }
    return true
  }
}

public enum TodayDigest {
  /// "Show more" steps: 8, then 12, then 16 rows.
  public static let steps = [8, 12, 16]

  public static func next(after limit: Int) -> Int {
    steps.first { $0 > limit } ?? limit
  }

  /// Up to 16 digest rows; with a category, only the rows whose first cited
  /// story is in it. Rows keep the rank they have in the whole digest.
  public static func rows(_ feed: Feed, lang: Lang, category: String?, tag: String? = nil) -> [DigestRow] {
    let all = Digest.rows(feed, lang: lang, limit: steps.last ?? 16)
    if Topic.canonical(category) == nil && tag == nil { return all }
    let items = feed.itemsById
    return all.filter { row in
      guard let id = row.itemId, let item = items[id] else { return false }
      return TodayStories.matches(item, category: category, tag: tag)
    }
  }
}
