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
