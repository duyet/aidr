import Foundation

/// The last feed that decoded, kept as the server's bytes in Application
/// Support so launch paints before the network answers.
public struct SnapshotStore: Sendable {
  public let fileURL: URL

  public init(directory: URL = SnapshotStore.defaultDirectory) {
    fileURL = directory.appending(path: "feed.json")
  }

  public static var defaultDirectory: URL {
    URL.applicationSupportDirectory.appending(path: "AIDR", directoryHint: .isDirectory)
  }

  /// The cached feed, or nil when there is none or it no longer decodes.
  public func load() -> Feed? {
    guard let data = try? Data(contentsOf: fileURL) else { return nil }
    return try? APIClient.decode(Feed.self, from: data)
  }

  /// Saves bytes that already decoded as a `Feed`. Atomic, so a crash never
  /// leaves half a file.
  public func save(_ data: Data) throws {
    try FileManager.default.createDirectory(
      at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: fileURL, options: .atomic)
  }
}
