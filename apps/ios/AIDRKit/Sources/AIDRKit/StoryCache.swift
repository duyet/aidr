import Foundation

/// Every story the reader opened, kept as the server's bytes so a revisit
/// paints with no network. It lives in Caches: iOS may reclaim it when the
/// disk is tight, and the next online visit fills it again.
public struct StoryCache: Sendable {
  public let directory: URL

  public init(directory: URL = StoryCache.defaultDirectory) {
    self.directory = directory
  }

  public static var defaultDirectory: URL {
    URL.cachesDirectory.appending(path: "AIDR/stories", directoryHint: .isDirectory)
  }

  /// Story ids are hex. Anything else could name a path outside the folder.
  func fileURL(_ id: String) -> URL? {
    guard !id.isEmpty, id.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") })
    else { return nil }
    return directory.appending(path: "\(id).json")
  }

  /// The cached story, or nil when there is none or it no longer decodes.
  public func load(id: String) -> Item? {
    guard let url = fileURL(id), let data = try? Data(contentsOf: url) else { return nil }
    return try? APIClient.decode(Item.self, from: data)
  }

  /// When the cached copy was fetched. The server's story carries no
  /// update time, so the app keeps its own next to the bytes.
  public func fetchedAt(id: String) -> Date? {
    guard let url = fileURL(id)?.deletingPathExtension().appendingPathExtension("fetched"),
      let text = try? String(contentsOf: url, encoding: .utf8),
      let seconds = TimeInterval(text.trimmingCharacters(in: .whitespacesAndNewlines))
    else { return nil }
    return Date(timeIntervalSince1970: seconds)
  }

  /// Saves bytes that already decoded as an `Item`, and when they were
  /// fetched. Atomic, so a crash never leaves half a file.
  public func save(_ data: Data, id: String, fetchedAt: Date = Date()) throws {
    guard let url = fileURL(id) else { throw CocoaError(.fileWriteInvalidFileName) }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
    let stamp = url.deletingPathExtension().appendingPathExtension("fetched")
    try Data(String(Int(fetchedAt.timeIntervalSince1970)).utf8).write(to: stamp, options: .atomic)
  }
}

extension APIClient {
  /// GET /api/story/:id and the bytes it was decoded from, so a caller can
  /// cache exactly what the server sent.
  public func storyWithData(id: String) async throws -> (Item, Data) {
    let data = try await get("api/story/\(id)")
    return (try Self.decode(Item.self, from: data), data)
  }
}
