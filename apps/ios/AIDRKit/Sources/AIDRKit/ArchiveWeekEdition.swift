import Foundation

/// One story of a weekly edition. GET /api/week/:week carries more than
/// `WeekStory` decodes (titles, category, publisher, image), so the archive
/// reads its own shape. Decode with `APIClient.decode`.
public struct ArchiveWeekStory: Decodable, Sendable, Equatable, Identifiable {
  public var rank: Int
  /// The full 64-character item id.
  public var itemId: String
  public var textEn: String?
  public var textVi: String?
  public var title: String?
  public var titleVi: String?
  public var category: String?
  /// The publisher host.
  public var source: String?
  public var imageUrl: String?

  public var id: String { itemId }

  /// The headline in `lang`, or nil when that language has none (VI never shows EN).
  public func title(in lang: Lang) -> String? {
    ArchiveWeekEdition.clean(lang == .vi ? titleVi : title)
  }

  /// The one-paragraph blurb in `lang`, or nil.
  public func text(in lang: Lang) -> String? {
    ArchiveWeekEdition.clean(lang == .vi ? textVi : textEn)
  }
}

/// GET /api/week/:week
public struct ArchiveWeekEdition: Decodable, Sendable, Equatable {
  public var week: String
  public var issue: Int?
  public var startDate: String
  public var endDate: String
  public var introEn: String?
  public var introVi: String?
  public var stories: [ArchiveWeekStory]
  /// True for the week still in progress: a live ranking, not an issue yet.
  public var provisional: Bool?

  public var isProvisional: Bool { provisional == true }

  static func clean(_ value: String?) -> String? {
    guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
    return text
  }

  public func intro(in lang: Lang) -> String? { Self.clean(lang == .vi ? introVi : introEn) }

  /// The stories that have a headline in `lang`, in rank order.
  public func stories(in lang: Lang) -> [ArchiveWeekStory] {
    stories.filter { $0.title(in: lang) != nil }.sorted { $0.rank < $1.rank }
  }

  /// The lead story in `lang`.
  public func lead(in lang: Lang) -> ArchiveWeekStory? { stories(in: lang).first }
}
