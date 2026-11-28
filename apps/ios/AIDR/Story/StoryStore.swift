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

  func load() async {
    if item == nil {
      if let cached = cache.load(id: id) {
        item = cached
        isComplete = true
      } else if let partial = snapshots.load()?.itemsById[id] {
        item = partial
      }
    }
    do {
      let (fresh, data) = try await api.storyWithData(id: id)
      item = fresh
      isComplete = true
      failed = false
      try? cache.save(data, id: id)
    } catch {
      failed = item == nil
    }
  }

  func retry() async {
    failed = false
    await load()
  }
}
