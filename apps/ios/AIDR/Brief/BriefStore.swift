import AIDRKit
import Foundation
import Observation

/// Today's brief: the cached edition paints at once, then the feed and the
/// day video refresh. The streak lives here so a page can finish it.
@MainActor
@Observable
final class BriefStore {
  private(set) var feed: Feed?
  private(set) var video: BriefVideo?
  private(set) var isRefreshing = false
  /// Set when the last refresh failed; the brief keeps the cached feed.
  private(set) var refreshFailed = false
  private(set) var streak: BriefStreak

  let lang: Lang
  private let api: APIClient
  private let snapshots: SnapshotStore
  private let streakStore: BriefStreakStore
  private let environment: [String: String]

  init(
    lang: Lang, api: APIClient = BriefStore.client(), snapshots: SnapshotStore = SnapshotStore(),
    streakStore: BriefStreakStore = BriefStreakStore(),
    environment: [String: String] = ProcessInfo.processInfo.environment
  ) {
    self.lang = lang
    self.api = api
    self.snapshots = snapshots
    self.streakStore = streakStore
    self.environment = environment
    feed = snapshots.load()
    streak = streakStore.load()
  }

  /// AIDR_API_BASE points the app at another origin, as in TodayStore.
  nonisolated static func client() -> APIClient {
    if let raw = ProcessInfo.processInfo.environment["AIDR_API_BASE"], let base = URL(string: raw) {
      return APIClient(base: base)
    }
    return APIClient()
  }

  /// Test hooks, like AIDR_API_BASE: AIDR_BRIEF_NO_IMAGES draws every page
  /// with the gradient, AIDR_BRIEF_VIDEO_DATE reads that day's video.
  var deck: BriefDeck {
    guard let feed else { return BriefDeck(pages: [], date: nil, learned: []) }
    return BriefDeck.build(
      feed: feed, lang: lang, video: video, withImages: environment["AIDR_BRIEF_NO_IMAGES"] != "1")
  }

  var streakCount: Int { streak.current(today: BriefStreak.key(for: .now)) }

  func refresh() async {
    guard !isRefreshing else { return }
    isRefreshing = true
    defer { isRefreshing = false }
    do {
      let (fresh, data) = try await api.feed(days: 3)
      feed = fresh
      refreshFailed = false
      try? snapshots.save(data)
    } catch {
      refreshFailed = true
    }
    await refreshVideo()
  }

  /// A day with no video, or a failed read, leaves the brief without the
  /// page. The feed failure above is what tells the reader they are offline.
  private func refreshVideo() async {
    guard let date = environment["AIDR_BRIEF_VIDEO_DATE"] ?? feed?.tldr?.date else { return }
    if let found = try? await api.dayVideo(date: date, lang: lang) { video = found }
  }

  /// The end page appeared: today counts as read.
  func finish(now: Date = .now) {
    streak.recordFinished(on: BriefStreak.key(for: now))
    streakStore.save(streak)
  }
}
