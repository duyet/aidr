import Foundation

/// One source row of the story page.
public struct StorySourceRow: Equatable, Sendable, Identifiable {
  public var id: String
  /// "source", "support" or "discussion".
  public var kind: String
  /// The author (an @handle on X), else the publisher host.
  public var label: String
  public var host: String?
  public var quote: String?
  public var url: URL?
}

/// The line above the headline: "AGENTS · 27 THG 11, 2026 · 23:37 · 6 NGUỒN".
public struct StoryMetaLine: Equatable, Sendable {
  /// The story's category as the web shows it, upper case. Nil when the story has none.
  public var topic: String?
  public var topicColor: TopicColor
  /// Date, clock and source count, upper case, in the order they read.
  public var parts: [String]
}

public struct StoryHeadline: Equatable, Sendable {
  public var text: String
  /// True when a Vietnamese reader gets the original English title because
  /// the story has no Vietnamese one yet.
  public var isOriginal: Bool
}

/// Port of the web story page's text rules (apps/web/src/components/story-page/lib.ts,
/// story/story-text.ts, lib/plain-text.ts). Pure, so the unit tests pin them.
public enum StoryDetail {
  /// The audience zone of the web: the story's day and clock are read here, not on the device clock.
  public static let timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? .gmt

  // MARK: Meta line

  static func formatter(_ pattern: String, locale: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: locale)
    f.timeZone = timeZone
    f.dateFormat = pattern
    return f
  }

  /// "27 thg 11, 2026" or "Nov 27, 2026".
  public static func dateLabel(_ date: Date, lang: Lang) -> String {
    let f = lang == .vi ? formatter("d MMM, yyyy", locale: "vi_VN") : formatter("MMM d, yyyy", locale: "en_US")
    return f.string(from: date)
  }

  /// "23:37", 24 hour.
  public static func clock(_ date: Date) -> String {
    formatter("HH:mm", locale: "en_US_POSIX").string(from: date)
  }

  /// Sources that carried the story: every row but the discussion threads.
  public static func outlets(_ item: Item) -> Int {
    item.sources.filter { $0.kind != "discussion" }.count
  }

  /// "27 THG 11, 2026" in capitals, or nil when the story has no date.
  public static func dateLine(_ item: Item, lang: Lang) -> String? {
    item.publishedDate.map { dateLabel($0, lang: lang).uppercased(with: Locale(identifier: lang == .vi ? "vi_VN" : "en_US")) }
  }

  public static func meta(_ item: Item, lang: Lang) -> StoryMetaLine {
    let locale = Locale(identifier: lang == .vi ? "vi_VN" : "en_US")
    var parts: [String] = []
    if let date = item.publishedDate, let line = dateLine(item, lang: lang) {
      parts.append(line)
      parts.append(clock(date))
    }
    let count = outlets(item)
    if count > 0 {
      parts.append(lang == .vi ? "\(count) NGUỒN" : "\(count) \(count == 1 ? "SOURCE" : "SOURCES")")
    }
    let category = item.category?.trimmingCharacters(in: .whitespacesAndNewlines)
    return StoryMetaLine(
      topic: category?.isEmpty == false ? category?.uppercased(with: locale) : nil,
      topicColor: Topic.color(forCategory: item.category),
      parts: parts)
  }

  // MARK: Headline and summary

  static let titleMarker = try! NSRegularExpression(
    pattern: #"^\s*(?:(?:update[ds]?|breaking(?:\s+news)?|cập\s+nhật|tin\s+nóng)\s*:\s*)+"#,
    options: [.caseInsensitive])

  /// Drops a wire marker such as "Update:" from a headline. Never returns an empty title.
  public static func stripTitleMarker(_ title: String) -> String {
    let range = NSRange(location: 0, length: (title as NSString).length)
    let stripped = titleMarker.stringByReplacingMatches(in: title, range: range, withTemplate: "")
    return stripped.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? title : stripped
  }

  /// The headline in `lang`. A Vietnamese reader of a story with no Vietnamese
  /// title gets the English original, marked. An English reader never gets Vietnamese.
  public static func headline(_ item: Item, lang: Lang) -> StoryHeadline? {
    if let own = item.title(in: lang) {
      return StoryHeadline(text: stripTitleMarker(own).trimmingCharacters(in: .whitespacesAndNewlines), isOriginal: false)
    }
    guard lang == .vi, let original = item.title(in: .en) else { return nil }
    return StoryHeadline(
      text: stripTitleMarker(original).trimmingCharacters(in: .whitespacesAndNewlines), isOriginal: true)
  }

  public static func paragraphs(_ text: String?) -> [String] {
    (text ?? "").components(separatedBy: "\n\n")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }

  /// The AI;DR paragraphs in `lang`. Empty when that language has no summary:
  /// VI and EN never fill in for each other.
  public static func summary(_ item: Item, lang: Lang) -> [String] {
    paragraphs(lang == .vi ? item.summaryVi : item.summary)
  }

  public static func summaryText(_ item: Item, lang: Lang) -> String {
    summary(item, lang: lang).joined(separator: " ")
  }

  // MARK: Links and sources

  /// An http(s) URL with a host, else nil. SFSafariViewController crashes on anything else.
  public static func safeURL(_ value: String?) -> URL? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty,
      let url = URL(string: value), let scheme = url.scheme?.lowercased(),
      scheme == "http" || scheme == "https", url.host() != nil
    else { return nil }
    return url
  }

  /// "techmeme.com" for "https://www.techmeme.com/x".
  public static func publisherHost(_ url: URL?) -> String? {
    guard var host = url?.host()?.lowercased(), !host.isEmpty else { return nil }
    if host.hasPrefix("www.") { host.removeFirst(4) }
    return host.isEmpty ? nil : host
  }

  /// "Từ techmeme.com" or "Từ Berber Jin · wsj.com": the author of the article
  /// link itself, never an aggregator that reposted it.
  public static func byline(_ item: Item, lang: Lang) -> String? {
    let articleURL = safeURL(item.url)
    let host = publisherHost(articleURL)
    let author = item.sources.first {
      $0.kind == "source" && trimmed($0.author) != nil && articleURL != nil && safeURL($0.url) == articleURL
    }.flatMap { trimmed($0.author) }
    let prefix = lang == .vi ? "Từ" : (author != nil && host != nil && author != host ? "By" : "From")
    if let author, let host, author != host { return "\(prefix) \(author) · \(host)" }
    if let name = author ?? host { return "\(prefix) \(name)" }
    return nil
  }

  static func trimmed(_ value: String?) -> String? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
    return value
  }

  static let socialHosts: Set<String> = ["x.com", "twitter.com", "threads.net"]

  static func hasContent(_ source: Source) -> Bool {
    trimmed(source.author) != nil || (source.postedAt ?? 0) != 0 || trimmed(source.quote) != nil
      || safeURL(source.url) != nil
  }

  /// The author (an @handle on X), else the publisher host.
  static func name(_ source: Source) -> String? {
    let host = publisherHost(safeURL(source.url))
    if let author = trimmed(source.author) {
      let social = host.map { socialHosts.contains($0) } ?? false
      return social && !author.hasPrefix("@") && !author.contains(where: \.isWhitespace) ? "@\(author)" : author
    }
    return host
  }

  static func row(_ source: Source, label: String, id: String) -> StorySourceRow {
    let url = safeURL(source.url)
    return StorySourceRow(
      id: id, kind: source.kind, label: label, host: publisherHost(url), quote: trimmed(source.quote), url: url)
  }

  /// The article and every `source` row first, de-duplicated by link, then the
  /// supporting and discussion rows that go behind "+ N more".
  public static func sources(_ item: Item) -> (main: [StorySourceRow], more: [StorySourceRow]) {
    var main: [StorySourceRow] = []
    var seen = Set<String>()
    func add(_ source: Source, id: String) {
      guard let label = name(source) else { return }
      let key = safeURL(source.url)?.absoluteString ?? "name:\(label)"
      guard seen.insert(key).inserted else { return }
      main.append(row(source, label: label, id: id))
    }
    let rows = item.sources.filter(hasContent)
    if let articleURL = safeURL(item.url) {
      // A `source` row for the article link replaces the bare publisher, so its author wins.
      let articleRow = rows.first { $0.kind == "source" && safeURL($0.url) == articleURL }
      add(articleRow ?? Source(kind: "source", author: nil, postedAt: nil, quote: nil, url: item.url), id: "article")
    }
    for (index, source) in rows.enumerated() where source.kind == "source" { add(source, id: "source-\(index)") }
    let more = rows.enumerated().filter { $0.element.kind != "source" }.map { index, source in
      row(source, label: name(source) ?? source.kind.capitalized, id: "more-\(index)")
    }
    return (main, more)
  }
}

/// The text and links the story page copies and shares. Same shapes as the
/// web's apps/web/src/lib/share-text.ts, so a paste from the app and from the
/// site read alike and land with the same utm tags.
public enum StoryShare {
  public static let origin = "https://aidr.today"

  /// The story permalink in `lang`, tagged `utm_content=<slot>-<id8>`.
  public static func link(_ item: Item, lang: Lang, slot: String) -> URL {
    let id8 = String(item.id.prefix(8))
    let query = "lang=\(lang.rawValue)&utm_source=share&utm_medium=social&utm_campaign=story&utm_content=\(slot)-\(id8)"
    return URL(string: "\(origin)/\(id8)?\(query)") ?? URL(string: origin)!
  }

  /// "Copy AI;DR": title, blank line, "AI;DR: " and the summary, blank line, link.
  /// A story with no summary in `lang` gets the title and the link.
  public static func copyText(_ item: Item, lang: Lang) -> String {
    let title = StoryDetail.headline(item, lang: lang)?.text ?? item.title
    let url = link(item, lang: lang, slot: "aidr").absoluteString
    let summary = StoryDetail.summaryText(item, lang: lang)
    return summary.isEmpty ? "\(title)\n\(url)" : "\(title)\n\nAI;DR: \(summary)\n\n\(url)"
  }
}
