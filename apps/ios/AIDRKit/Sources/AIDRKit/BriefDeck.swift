import Foundation

public struct BriefCover: Equatable, Sendable {
  /// The edition date, yyyy-MM-dd.
  public var date: String
  public var day: String
  /// "THỨ BẢY · THÁNG 11 2026"
  public var line: String
  public var storyCount: Int
  public var minutes: Int
  /// The lead bullet's first sentence.
  public var teaser: String?
}

public struct BriefStory: Equatable, Sendable, Identifiable {
  public var row: DigestRow
  /// 1-based.
  public var position: Int
  public var total: Int
  /// Nil draws the topic-colored gradient.
  public var imageURL: URL?

  public var id: Int { position }
}

public enum BriefPage: Equatable, Sendable, Identifiable {
  case cover(BriefCover)
  case video(BriefVideo)
  case story(BriefStory)
  case end

  public var id: String {
    switch self {
    case .cover: "cover"
    case .video: "video"
    case .story(let story): "story-\(story.position)"
    case .end: "end"
    }
  }
}

/// The swipeable brief: cover, the day video when there is one, one page per
/// digest bullet, then the end page. Empty when the language has no digest.
public struct BriefDeck: Equatable, Sendable {
  public var pages: [BriefPage]
  public var date: String?
  /// The feed's learned keywords, for highlights.
  public var learned: [String]

  public var isEmpty: Bool { pages.isEmpty }

  public init(pages: [BriefPage], date: String?, learned: [String]) {
    self.pages = pages
    self.date = date
    self.learned = learned
  }

  public static func build(
    feed: Feed, lang: Lang, video: BriefVideo? = nil, limit: Int = 8, withImages: Bool = true
  ) -> BriefDeck {
    let rows = Digest.rows(feed, lang: lang, limit: limit)
    guard !rows.isEmpty, let tldr = feed.tldr else {
      return BriefDeck(pages: [], date: feed.tldr?.date, learned: [])
    }
    let parts = EditionDate.parts(tldr.date, lang: lang)
    let cover = BriefCover(
      date: tldr.date, day: parts?.day ?? "", line: parts?.line ?? tldr.date,
      storyCount: rows.count, minutes: readMinutes(rows), teaser: teaser(rows[0].text))
    var pages: [BriefPage] = [.cover(cover)]
    if let video { pages.append(.video(video)) }
    for row in rows {
      pages.append(
        .story(
          BriefStory(
            row: row, position: row.rank, total: rows.count, imageURL: withImages ? row.thumbnail : nil)))
    }
    pages.append(.end)
    return BriefDeck(pages: pages, date: tldr.date, learned: feed.learnedKeywords)
  }

  /// About 180 words a minute, never under 1.
  static func readMinutes(_ rows: [DigestRow]) -> Int {
    let words = rows.reduce(0) { $0 + $1.text.split(whereSeparator: \.isWhitespace).count }
    return max(1, Int((Double(words) / 180).rounded(.up)))
  }

  /// The first sentence, cut at a word when it runs past `maxLength`.
  public static func teaser(_ text: String, maxLength: Int = 90) -> String? {
    let flat = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !flat.isEmpty else { return nil }
    var sentence = flat
    if let stop = flat.range(of: ". ") { sentence = String(flat[..<stop.lowerBound]) }
    guard sentence.count > maxLength else { return sentence }
    let cut = sentence.prefix(maxLength)
    let words = cut.lastIndex(of: " ").map { String(cut[..<$0]) } ?? String(cut)
    return words + "…"
  }

  /// The public day page, in the reader's language.
  public static func shareURL(date: String, lang: Lang) -> URL? {
    URL(string: "https://aidr.today/date/\(date)?lang=\(lang.rawValue)")
  }
}
