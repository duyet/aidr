import AIDRKit
import Foundation
import Observation

/// One story: painted from the disk cache (or the feed snapshot) at once, then refreshed.
@MainActor
@Observable
final class StoryStore {
  private(set) var item: Item?
  /// False while `item` is only the feed's copy, which may lack the summary and sources.
  private(set) var isComplete = false
  /// Set when no copy exists and the fetch failed.
  private(set) var failed = false
  /// When `item` was last fetched from the server, from the disk stamp or the last refresh.
  private(set) var fetchedAt: Date?
  /// True when the last refresh failed and the screen shows a saved copy.
  private(set) var isOffline = false
  private var isRefreshing = false

  let id: String
  private let api: APIClient
  private let cache: StoryCache
  private let snapshots: SnapshotStore

  init(
    id: String, api: APIClient = StoryStore.defaultClient(), cache: StoryCache = StoryCache(),
    snapshots: SnapshotStore = SnapshotStore()
  ) {
    self.id = id
    self.api = api
    self.cache = cache
    self.snapshots = snapshots
  }

  /// AIDR_API_BASE points the app at another origin, as for Today. The offline
  /// UI test sets an unreachable one to prove a cached story still paints.
  nonisolated static func defaultClient() -> APIClient {
    if let raw = ProcessInfo.processInfo.environment["AIDR_API_BASE"], let base = URL(string: raw) {
      return APIClient(base: base)
    }
    return APIClient()
  }

  /// Paints from disk at once, then refreshes. The screen is never blanked to reload.
  func load() async {
    if item == nil {
      if let cached = cache.load(id: id) {
        item = cached
        fetchedAt = cache.fetchedAt(id: id)
        isComplete = true
      } else if let partial = snapshots.load()?.itemsById[id] {
        item = partial
      }
    }
    await refresh()
  }

  /// On appear, on app foreground and on pull to refresh.
  func refresh() async {
    guard !isRefreshing else { return }
    isRefreshing = true
    defer { isRefreshing = false }
    do {
      let (fresh, data) = try await api.storyWithData(id: id)
      let now = Date()
      item = fresh
      isComplete = true
      failed = false
      isOffline = false
      fetchedAt = now
      try? cache.save(data, id: id, fetchedAt: now)
    } catch {
      isOffline = item != nil
      failed = item == nil
    }
  }
}
