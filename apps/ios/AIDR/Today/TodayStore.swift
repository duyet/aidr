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
    if let cached = snapshots.load() { adopt(cached) }
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

  func refresh() async {
    guard !isRefreshing else { return }
    isRefreshing = true
    defer { isRefreshing = false }
    do {
      let (fresh, data) = try await api.feed(days: 3)
      adopt(fresh)
      refreshFailed = false
      try? snapshots.save(data)
    } catch {
      refreshFailed = true
    }
  }
}
