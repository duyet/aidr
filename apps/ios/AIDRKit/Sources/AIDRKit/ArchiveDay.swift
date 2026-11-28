import Foundation

/// One bullet of a day's AI;DR digest.
public struct ArchiveDigestBullet: Equatable, Sendable, Identifiable {
  public var rank: Int
  public var text: String
  /// The cited story's 8-character id, when the bullet links one.
  public var storyId: String?

  public var id: Int { rank }

  public init(rank: Int, text: String, storyId: String? = nil) {
    self.rank = rank
    self.text = text
    self.storyId = storyId
  }
}

/// One line of a day's ranked list.
public struct ArchiveRankedStory: Equatable, Sendable, Identifiable {
  public var rank: Int
  public var title: String
  /// The story's 8-character id.
  public var storyId: String
  public var category: String?
  /// The publisher host.
  public var host: String?
  /// Present for the top ten only.
  public var summary: String?

  public var id: Int { rank }

  public init(
    rank: Int, title: String, storyId: String, category: String? = nil, host: String? = nil,
    summary: String? = nil
  ) {
    self.rank = rank
    self.title = title
    self.storyId = storyId
    self.category = category
    self.host = host
    self.summary = summary
  }
}

/// One day of AI;DR, read from the Markdown twin /date/YYYY-MM-DD.md (the
/// documented machine surface for a day, see openapi.json). The twin lists at
/// most 100 ranked stories and says how many more the HTML page has.
public struct ArchiveDay: Equatable, Sendable {
  public var date: String
  public var lang: Lang
  public var digest: [ArchiveDigestBullet]
  public var stories: [ArchiveRankedStory]
  /// Numbered lines in the twin, including any dropped as English fallback.
  public var listed: Int
  /// Stories beyond the 100 listed.
  public var moreCount: Int

  /// The day's story count, the number the web calendar shows.
  public var total: Int { listed + moreCount }

  /// The top ranked story, when it has a title in this language.
  public var lead: ArchiveRankedStory? { stories.first { $0.rank == 1 } }

  public init(
    date: String, lang: Lang, digest: [ArchiveDigestBullet], stories: [ArchiveRankedStory], listed: Int,
    moreCount: Int
  ) {
    self.date = date
    self.lang = lang
    self.digest = digest
    self.stories = stories
    self.listed = listed
    self.moreCount = moreCount
  }
}

extension ArchiveDay {
  static let rankedPattern = try! NSRegularExpression(
    pattern: #"^(\d+)\. \[(.+)\]\((https://[^)\s]+)\)(?: — (.+))?$"#)
  static let bulletPattern = try! NSRegularExpression(
    pattern: #"^- (.+?)(?: \(\[(?:story|tin)\]\((https://[^)\s]+)\)\))?$"#)
  static let morePattern = try! NSRegularExpression(
    pattern: #"^(?:Còn (\d+) tin khác|(\d+) more stor(?:y|ies))"#)
  static let linkPattern = try! NSRegularExpression(
    pattern: #"^https://[^/]+/([0-9a-f]{8,64})(?:\?lang=(en|vi))?"#)
  static let escapePattern = try! NSRegularExpression(pattern: #"\\([!-/:-@\[-`{-~])"#)

  /// Capture groups of the first match, with "" for a group that did not take part.
  static func groups(_ regex: NSRegularExpression, _ text: String) -> [String]? {
    let ns = text as NSString
    guard let match = regex.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else {
      return nil
    }
    return (1..<match.numberOfRanges).map { index in
      let range = match.range(at: index)
      return range.location == NSNotFound ? "" : ns.substring(with: range)
    }
  }

  /// CommonMark backslash escapes: "\[video\]" reads "[video]".
  static func unescape(_ text: String) -> String {
    escapePattern.stringByReplacingMatches(
      in: text, range: NSRange(location: 0, length: (text as NSString).length), withTemplate: "$1")
  }

  /// The story id (8 characters) and language a permalink carries.
  static func link(_ url: String) -> (id: String, lang: String)? {
    guard let g = groups(linkPattern, url) else { return nil }
    return (String(g[0].prefix(8)), g[1])
  }

  /// Reads one day's Markdown twin.
  ///
  /// The Vietnamese reader never sees English: a bullet or story whose
  /// permalink is `lang=en` is the twin's English fallback and is dropped, a
  /// Vietnamese digest needs two bullets that read as Vietnamese (Digest.bullets),
  /// and a day whose top story is dropped has no lead.
  public static func parse(markdown: String, date: String, lang: Lang) -> ArchiveDay {
    var digest: [ArchiveDigestBullet] = []
    var stories: [ArchiveRankedStory] = []
    var listed = 0
    var more = 0
    var inDigest = false
    var open: Int?  // index in `stories` of the last ranked line, for its summary

    for raw in markdown.split(separator: "\n", omittingEmptySubsequences: false) {
      let line = String(raw)
      if line.hasPrefix("## ") {
        inDigest = line.dropFirst(3).trimmingCharacters(in: .whitespaces) == "AI;DR"
        open = nil
        continue
      }
      if line.hasPrefix("   ") {
        let extra = line.trimmingCharacters(in: .whitespaces)
        if let index = open, !extra.isEmpty {
          let joined = [stories[index].summary, unescape(extra)].compactMap { $0 }.joined(separator: " ")
          stories[index].summary = joined
        }
        continue
      }
      if let g = groups(rankedPattern, line) {
        open = nil
        listed += 1
        let info = link(g[2])
        if lang == .vi && info?.lang == "en" { continue }
        guard let info, let rank = Int(g[0]) else { continue }
        var category: String?
        var host: String?
        if !g[3].isEmpty {
          let parts = g[3].components(separatedBy: " · ")
          if parts.count >= 2 {
            category = parts.first
            host = parts.last
          } else if g[3].contains(".") {
            host = g[3]
          } else {
            category = g[3]
          }
        }
        stories.append(
          ArchiveRankedStory(
            rank: rank, title: unescape(g[1]), storyId: info.id, category: category, host: host))
        open = stories.count - 1
        continue
      }
      if inDigest, line.hasPrefix("- "), let g = groups(bulletPattern, line) {
        let info = g[1].isEmpty ? nil : link(g[1])
        if lang == .vi && info?.lang == "en" { continue }
        let text = unescape(g[0])
        if lang == .vi && !Digest.looksVietnamese(text) { continue }
        digest.append(ArchiveDigestBullet(rank: digest.count + 1, text: text, storyId: info?.id))
        continue
      }
      if let g = groups(morePattern, line) {
        more = Int(g[0].isEmpty ? g[1] : g[0]) ?? more
      }
    }
    if lang == .vi && digest.count < Digest.displayMin { digest = [] }
    return ArchiveDay(date: date, lang: lang, digest: digest, stories: stories, listed: listed, moreCount: more)
  }
}

/// What the calendar needs of a day: its count and its lead headline.
public struct ArchiveDaySummary: Equatable, Sendable, Identifiable {
  public var date: String
  public var count: Int
  public var leadId: String?
  public var leadTitle: String?

  public var id: String { date }

  public init(day: ArchiveDay) {
    date = day.date
    count = day.total
    leadId = day.lead?.storyId
    leadTitle = day.lead?.title
  }

  public init(date: String, count: Int, leadId: String? = nil, leadTitle: String? = nil) {
    self.date = date
    self.count = count
    self.leadId = leadId
    self.leadTitle = leadTitle
  }
}
