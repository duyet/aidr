import Foundation

/// One numbered row of the AI;DR digest, ready to draw.
public struct DigestRow: Identifiable, Equatable, Sendable {
  public var rank: Int
  public var text: String
  /// The story's first tag, else its category.
  public var topic: String?
  public var topicColor: TopicColor?
  /// Tags of every story the bullet cites, for keyword highlights.
  public var tags: [String]
  public var thumbnail: URL?
  public var itemId: String?
  /// Stories cited beyond the first.
  public var extraCount: Int

  public var id: Int { rank }
}

public enum Digest {
  /// The web shows a VI digest only when it has 2 bullets or more and reads
  /// as Vietnamese. VI never shows the EN bullets.
  static let displayMin = 2

  static let viDiacritics = try! NSRegularExpression(
    pattern: "[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]",
    options: [.caseInsensitive])

  static func looksVietnamese(_ text: String) -> Bool {
    viDiacritics.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
  }

  /// Port of displayTldrBullets (apps/web/src/lib/tldr-fallback.ts).
  public static func bullets(_ tldr: Tldr?, lang: Lang) -> [Bullet] {
    guard let tldr else { return [] }
    if lang == .en { return tldr.bulletsEn }
    let texts = tldr.bulletsVi.map(\.text).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    if texts.isEmpty || !texts.contains(where: looksVietnamese) { return [] }
    return tldr.bulletsVi.count >= displayMin ? tldr.bulletsVi : []
  }

  /// The first `limit` digest rows with topic, color and thumbnail resolved
  /// the way the web's TldrBulletList does.
  public static func rows(_ feed: Feed, lang: Lang, limit: Int = 8) -> [DigestRow] {
    let items = feed.itemsById
    return bullets(feed.tldr, lang: lang).prefix(limit).enumerated().map { index, bullet in
      let primary = bullet.itemIds.first.flatMap { items[$0] }
      let topic = primary.flatMap { $0.tags.first ?? $0.category }
      var color: TopicColor?
      if let topic {
        let categoryTopic: String? =
          primary?.tags.isEmpty == true
          ? (primary?.category ?? (Topic.isKnownCategory(topic) ? topic : nil)) : nil
        color = categoryTopic.map { Topic.color(forCategory: $0) } ?? Topic.color(forTag: topic)
      }
      let thumb = bullet.imageUrl ?? primary?.imageUrl
      return DigestRow(
        rank: index + 1,
        text: bullet.text,
        topic: topic,
        topicColor: color,
        tags: bullet.itemIds.flatMap { items[$0]?.tags ?? [] },
        thumbnail: thumb.flatMap(URL.init(string:)),
        itemId: bullet.itemIds.first,
        extraCount: max(bullet.itemIds.count - 1, 0)
      )
    }
  }
}

/// The day block's two lines: "28" and "THỨ BẢY · THÁNG 11 2026".
public enum EditionDate {
  static func parse(_ date: String) -> Date? {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .gmt
    let parts = date.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  public static func parts(_ date: String, lang: Lang) -> (day: String, line: String)? {
    guard let value = parse(date) else { return nil }
    let locale = Locale(identifier: lang == .vi ? "vi_VN" : "en_US")
    func format(_ pattern: String) -> String {
      let f = DateFormatter()
      f.locale = locale
      f.timeZone = .gmt
      f.dateFormat = pattern
      return f.string(from: value)
    }
    let line = "\(format("EEEE")) · \(format("LLLL yyyy"))"
    return (format("d"), line.uppercased(with: locale))
  }
}
