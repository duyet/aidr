import AIDRKit
import Foundation
import Observation

/// Today's edition: painted from the disk snapshot at once, then refreshed.
@MainActor
@Observable
final class TodayStore {
  private(set) var feed: Feed?
  /// Every story of the loaded days, for local search.
  private(set) var index = SearchIndex()
  private(set) var isRefreshing = false
  /// Set when the last refresh failed; the screen keeps the cached feed.
  private(set) var refreshFailed = false
  /// When the cached edition was written to disk, for "Offline · saved 07:12".
  private(set) var savedAt: Date?
  private var lastSuccess: Date?

  // Screen state lives here, not in the views: a preference change rebuilds
  // the tab tree (RootView `.id(prefs)`) and the reader keeps their place.
  var query = ""
  var category: String?
  var tag: String?
  /// Digest rows on screen; nil follows the reader's digest count preference.
  var digestLimit: Int?
  /// Set by the digest switch so the rebuilt page scrolls back to the digest.
  var scrollToDigest = false

  private let api: APIClient
  private let snapshots: SnapshotStore

  init(api: APIClient = TodayStore.defaultClient(), snapshots: SnapshotStore = SnapshotStore()) {
    self.api = api
    self.snapshots = snapshots
    if let cached = snapshots.load() {
      adopt(cached)
      savedAt = Self.modified(snapshots.fileURL)
    }
  }

  private static func modified(_ url: URL) -> Date? {
    (try? FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate]) as? Date
  }

  private func adopt(_ fresh: Feed) {
    feed = fresh
    index = SearchIndex(feed: fresh)
  }

  /// AIDR_API_BASE points the app at another origin. The offline UI test
  /// sets an unreachable one to prove the cached edition still paints.
  nonisolated static func defaultClient() -> APIClient {
    if let raw = ProcessInfo.processInfo.environment["AIDR_API_BASE"], let base = URL(string: raw) {
      return APIClient(base: base)
    }
    return APIClient()
  }

  /// App came to the foreground: refresh in the background unless a refresh
  /// landed in the last minute. The cached edition stays on screen meanwhile.
  func refreshIfStale() async {
    if let lastSuccess, Date.now.timeIntervalSince(lastSuccess) < 60 { return }
    await refresh()
  }

  func refresh() async {
    guard !isRefreshing else { return }
    isRefreshing = true
    defer { isRefreshing = false }
    do {
      let (fresh, data) = try await api.feed(days: 3)
      adopt(fresh)
      refreshFailed = false
      lastSuccess = .now
      if (try? snapshots.save(data)) != nil { savedAt = .now }
    } catch {
      refreshFailed = true
    }
  }
}
