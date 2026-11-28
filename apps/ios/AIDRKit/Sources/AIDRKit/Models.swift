import Foundation

/// Reader language. VI and EN never fall back to each other.
public enum Lang: String, Codable, Sendable {
  case en, vi

  /// VI when the first preferred system language is Vietnamese, else EN.
  public static func preferred(_ languages: [String] = Locale.preferredLanguages) -> Lang {
    languages.first?.lowercased().hasPrefix("vi") == true ? .vi : .en
  }
}

/// GET /api/feed?days=N
public struct Feed: Decodable, Sendable, Equatable {
  public var tldr: Tldr?
  public var days: [Day]
  public var categories: [CategoryCount]
  public var trending: [TrendingTag]
  public var learnedKeywords: [String]
  public var totalStories: Int?
  /// Milliseconds since the epoch.
  public var updatedAt: Int64?

  enum CodingKeys: String, CodingKey {
    case tldr, days, categories, trending, learnedKeywords, totalStories, updatedAt
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    tldr = try c.decodeIfPresent(Tldr.self, forKey: .tldr)
    days = try c.decodeIfPresent([Day].self, forKey: .days) ?? []
    categories = try c.decodeIfPresent([CategoryCount].self, forKey: .categories) ?? []
    trending = try c.decodeIfPresent([TrendingTag].self, forKey: .trending) ?? []
    learnedKeywords = try c.decodeIfPresent([String].self, forKey: .learnedKeywords) ?? []
    totalStories = try c.decodeIfPresent(Int.self, forKey: .totalStories)
    updatedAt = try c.decodeIfPresent(Int64.self, forKey: .updatedAt)
  }

  /// Every item in the feed by id.
  public var itemsById: [String: Item] {
    var out: [String: Item] = [:]
    for day in days { for item in day.items where out[item.id] == nil { out[item.id] = item } }
    return out
  }

  public var updatedDate: Date? {
    updatedAt.map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) }
  }
}

public struct Tldr: Decodable, Sendable, Equatable {
  /// The edition date, yyyy-MM-dd.
  public var date: String
  public var bulletsEn: [Bullet]
  public var bulletsVi: [Bullet]

  enum CodingKeys: String, CodingKey { case date, bulletsEn, bulletsVi }

  public init(date: String, bulletsEn: [Bullet], bulletsVi: [Bullet]) {
    self.date = date
    self.bulletsEn = bulletsEn
    self.bulletsVi = bulletsVi
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    date = try c.decodeIfPresent(String.self, forKey: .date) ?? ""
    bulletsEn = try c.decodeIfPresent([Bullet].self, forKey: .bulletsEn) ?? []
    bulletsVi = try c.decodeIfPresent([Bullet].self, forKey: .bulletsVi) ?? []
  }
}

public struct Bullet: Decodable, Sendable, Equatable {
  public var text: String
  public var itemIds: [String]
  public var imageUrl: String?
  public var imageItemId: String?

  public init(text: String, itemIds: [String], imageUrl: String? = nil, imageItemId: String? = nil) {
    self.text = text
    self.itemIds = itemIds
    self.imageUrl = imageUrl
    self.imageItemId = imageItemId
  }
}

public struct Day: Decodable, Sendable, Equatable {
  public var date: String
  public var items: [Item]
  public var categoryCounts: [String: Int]?
}

public struct CategoryCount: Decodable, Sendable, Equatable, Identifiable {
  public var name: String
  public var count: Int
  public var id: String { name }
}

public struct TrendingTag: Decodable, Sendable, Equatable {
  public var tag: String
  public var count: Int
}

/// A story. The feed, /api/public and /api/story/:id share this shape;
/// fields one endpoint leaves out decode as nil or empty.
public struct Item: Decodable, Sendable, Equatable, Identifiable {
  public var id: String
  public var url: String
  public var title: String
  public var titleVi: String?
  public var summary: String?
  public var summaryVi: String?
  public var category: String?
  /// Seconds since the epoch.
  public var publishedAt: Int64?
  public var points: Int?
  public var comments: Int?
  public var rankScore: Double?
  public var sourceId: String?
  public var tags: [String]
  public var imageUrl: String?
  public var voteNet: Int?
  public var sources: [Source]
  public var permalink: String?

  enum CodingKeys: String, CodingKey {
    case id, url, title, titleVi, summary, summaryVi, category, publishedAt, points, comments
    case rankScore, sourceId, tags, imageUrl, voteNet, sources, permalink
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    url = try c.decodeIfPresent(String.self, forKey: .url) ?? ""
    title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
    titleVi = try c.decodeIfPresent(String.self, forKey: .titleVi)
    summary = try c.decodeIfPresent(String.self, forKey: .summary)
    summaryVi = try c.decodeIfPresent(String.self, forKey: .summaryVi)
    category = try c.decodeIfPresent(String.self, forKey: .category)
    publishedAt = try c.decodeIfPresent(Int64.self, forKey: .publishedAt)
    points = try c.decodeIfPresent(Int.self, forKey: .points)
    comments = try c.decodeIfPresent(Int.self, forKey: .comments)
    rankScore = try c.decodeIfPresent(Double.self, forKey: .rankScore)
    sourceId = try c.decodeIfPresent(String.self, forKey: .sourceId)
    tags = try c.decodeIfPresent([String].self, forKey: .tags) ?? []
    imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
    voteNet = try c.decodeIfPresent(Int.self, forKey: .voteNet)
    sources = try c.decodeIfPresent([Source].self, forKey: .sources) ?? []
    permalink = try c.decodeIfPresent(String.self, forKey: .permalink)
  }

  public var publishedDate: Date? {
    publishedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) }
  }

  /// The title in `lang`, or nil when that language has none.
  public func title(in lang: Lang) -> String? {
    let value = lang == .vi ? titleVi : title
    return value?.isEmpty == false ? value : nil
  }
}

public struct Source: Decodable, Sendable, Equatable {
  public var kind: String
  public var author: String?
  /// Seconds since the epoch.
  public var postedAt: Int64?
  public var quote: String?
  public var url: String
}

/// GET /api/public
public struct PublicEdition: Decodable, Sendable, Equatable {
  public var tldr: Tldr?
  public var stories: [Item]
  public var updatedAt: Int64?
}

/// GET /api/week/:week
public struct Week: Decodable, Sendable, Equatable {
  public var week: String
  public var issue: Int?
  public var startDate: String
  public var endDate: String
  public var introEn: String?
  public var introVi: String?
  public var stories: [WeekStory]
  public var provisional: Bool?
}

public struct WeekStory: Decodable, Sendable, Equatable {
  public var rank: Int
  public var itemId: String
  public var textEn: String?
  public var textVi: String?
}
