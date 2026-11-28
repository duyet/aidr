import Foundation

/// Local, instant search over every story the feed holds. Case and accents
/// do not matter: "nguoi" finds "Người", "dong" finds "đông".
public struct SearchIndex: Sendable {
  struct Entry: Sendable {
    let item: Item
    let title: String
    let tags: String
    let summary: String
  }

  let entries: [Entry]

  public init() { entries = [] }

  public init(feed: Feed) { self.init(items: feed.days.flatMap(\.items)) }

  public init(items: [Item]) {
    var seen = Set<String>()
    entries = items.filter { seen.insert($0.id).inserted }.map { item in
      Entry(
        item: item,
        title: Self.fold([item.title, item.titleVi ?? ""].joined(separator: " ")),
        tags: Self.fold((item.tags + [item.category ?? ""]).joined(separator: " ")),
        summary: Self.fold([item.summary ?? "", item.summaryVi ?? ""].joined(separator: " ")))
    }
  }

  public var count: Int { entries.count }

  static func fold(_ text: String) -> String {
    text.folding(options: [.diacriticInsensitive, .caseInsensitive, .widthInsensitive], locale: nil)
      .replacingOccurrences(of: "đ", with: "d")
  }

  /// Stories whose title, tags, category or summary hold every word of
  /// `query`. A title hit outranks a tag hit, a tag hit outranks a summary
  /// hit; ties keep the feed order (newest day, then rank).
  public func search(_ query: String, limit: Int = 500) -> [Item] {
    let words = Self.fold(query).split(whereSeparator: \.isWhitespace).map(String.init)
    guard !words.isEmpty else { return [] }
    var hits: [(score: Int, index: Int, item: Item)] = []
    for (index, entry) in entries.enumerated() {
      var score = 0
      var matchedAll = true
      for word in words {
        if entry.title.contains(word) {
          score += 4
        } else if entry.tags.contains(word) {
          score += 2
        } else if entry.summary.contains(word) {
          score += 1
        } else {
          matchedAll = false
          break
        }
      }
      if matchedAll { hits.append((score, index, entry.item)) }
    }
    hits.sort { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
    return hits.prefix(limit).map(\.item)
  }
}
