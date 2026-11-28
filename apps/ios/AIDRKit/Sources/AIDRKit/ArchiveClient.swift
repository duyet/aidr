import Foundation

/// Archive files kept as the server sent them, in Application Support, so a
/// day, a week or a story opens at once and offline once it has been read.
public struct ArchiveDiskCache: Sendable {
  public let directory: URL

  public init(directory: URL = ArchiveDiskCache.defaultDirectory) {
    self.directory = directory
  }

  public static var defaultDirectory: URL {
    SnapshotStore.defaultDirectory.appending(path: "archive", directoryHint: .isDirectory)
  }

  public func read(_ name: String) -> Data? {
    try? Data(contentsOf: directory.appending(path: name))
  }

  /// Atomic, so a crash never leaves half a file. A failed write only costs a
  /// refetch, so it is not an error for the caller.
  public func write(_ data: Data, name: String) {
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try data.write(to: directory.appending(path: name), options: .atomic)
    } catch {
      return
    }
  }
}

/// The outcome of loading one day without throwing, for fan-out loops.
public struct ArchiveDayResult: Sendable {
  public var date: String
  /// The edition, or nil when the day has none or the load failed.
  public var day: ArchiveDay?
  public var failed: Bool
}

/// Reads the archive from the public API and keeps what it reads on disk.
///
/// - A day is /date/YYYY-MM-DD.md in one language.
/// - A week is /api/week/:week.
/// - A story is /api/story/:id, by its 8-character id.
///
/// A settled day, a closed week and a story do not change, so callers read the
/// cache first and fetch only what is missing or still moving
/// (`ArchiveCalendar.isSettled`, `isFinalWeek`).
public struct ArchiveClient: Sendable {
  public let api: APIClient
  public let cache: ArchiveDiskCache

  public init(api: APIClient = APIClient(), cache: ArchiveDiskCache = ArchiveDiskCache()) {
    self.api = api
    self.cache = cache
  }

  // MARK: Days

  static func dayFile(_ date: String, _ lang: Lang) -> String { "day-\(lang.rawValue)-\(date).md" }

  public func cachedDay(_ date: String, lang: Lang) -> ArchiveDay? {
    guard let data = cache.read(Self.dayFile(date, lang)), let text = String(data: data, encoding: .utf8)
    else { return nil }
    return ArchiveDay.parse(markdown: text, date: date, lang: lang)
  }

  /// The day from the network, or nil when the day has no edition (404).
  public func fetchDay(_ date: String, lang: Lang) async throws -> ArchiveDay? {
    let (data, status) = try await get(
      "date/\(date).md", query: [URLQueryItem(name: "lang", value: lang.rawValue)], accept: "text/markdown")
    if status == 404 { return nil }
    guard (200..<300).contains(status), let text = String(data: data, encoding: .utf8) else {
      throw APIError.http(status: status)
    }
    cache.write(data, name: Self.dayFile(date, lang))
    return ArchiveDay.parse(markdown: text, date: date, lang: lang)
  }

  public func loadDay(_ date: String, lang: Lang) async -> ArchiveDayResult {
    do {
      return ArchiveDayResult(date: date, day: try await fetchDay(date, lang: lang), failed: false)
    } catch {
      return ArchiveDayResult(date: date, day: nil, failed: true)
    }
  }

  // MARK: Weeks

  static func weekFile(_ week: String) -> String { "week-\(week).json" }

  public func cachedWeek(_ week: String) -> ArchiveWeekEdition? {
    guard let data = cache.read(Self.weekFile(week)) else { return nil }
    return try? APIClient.decode(ArchiveWeekEdition.self, from: data)
  }

  /// The week from the network, or nil when there is no such edition (404).
  public func fetchWeek(_ week: String) async throws -> ArchiveWeekEdition? {
    let (data, status) = try await get("api/week/\(week)", query: [], accept: "application/json")
    if status == 404 { return nil }
    guard (200..<300).contains(status) else { throw APIError.http(status: status) }
    let edition = try APIClient.decode(ArchiveWeekEdition.self, from: data)
    cache.write(data, name: Self.weekFile(week))
    return edition
  }

  // MARK: Stories

  static func storyFile(_ id: String) -> String { "story-\(id).json" }

  public func cachedStory(_ id: String) -> Item? {
    guard let data = cache.read(Self.storyFile(id)) else { return nil }
    return try? APIClient.decode(Item.self, from: data)
  }

  public func fetchStory(_ id: String) async throws -> Item {
    let (data, status) = try await get("api/story/\(id)", query: [], accept: "application/json")
    guard (200..<300).contains(status) else { throw APIError.http(status: status) }
    let item = try APIClient.decode(Item.self, from: data)
    cache.write(data, name: Self.storyFile(id))
    return item
  }

  /// The story, or nil when it could not be loaded. Its image is decoration, so
  /// a failure only leaves a row without one.
  public func loadStory(_ id: String) async -> Item? {
    try? await fetchStory(id)
  }

  // MARK: Images

  /// A 144-pixel square WebP of a story image, resized by the server
  /// (/api/thumb). `image` must be one of the story's own images; the server
  /// answers 404 for any other. A miss redirects to the publisher.
  public func thumbURL(itemId: String, image: String?) -> URL? {
    guard let image, !image.isEmpty else { return nil }
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
    guard let encoded = image.addingPercentEncoding(withAllowedCharacters: allowed),
      var components = URLComponents(url: api.base.appending(path: "api/thumb/\(itemId)"), resolvingAgainstBaseURL: false)
    else { return nil }
    components.percentEncodedQuery = "u=" + encoded
    return components.url
  }

  public func thumbURL(for item: Item) -> URL? {
    thumbURL(itemId: item.id, image: item.imageUrl)
  }

  // MARK: Transport

  func get(_ path: String, query: [URLQueryItem], accept: String) async throws -> (Data, Int) {
    var components = URLComponents(url: api.base.appending(path: path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { components.queryItems = query }
    var request = URLRequest(url: components.url!)
    request.setValue(accept, forHTTPHeaderField: "Accept")
    request.timeoutInterval = 20
    let (data, response) = try await api.session.data(for: request)
    return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
  }
}
