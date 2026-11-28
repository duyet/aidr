import Foundation
import os

/// The refresh the background task and the foreground share: fetch the feed,
/// keep it for the next launch, reschedule the daily notification with it, and
/// warm the image cache for the digest.
public enum RefreshJob {
  /// BGTaskSchedulerPermittedIdentifiers in project.yml.
  public static let taskID = "oneni.aidr.app.refresh"
  public static let prefetchLimit = 16

  private static let log = Logger(subsystem: "oneni.aidr.app", category: "refresh")

  /// The language the reader chose in Settings, else the phone's.
  @MainActor
  public static func readerLang() -> Lang { ReaderPrefsStore.shared.prefs.language.resolve() }

  /// AIDR_API_BASE points the app at another origin, as TodayStore does.
  public static func defaultClient() -> APIClient {
    if let raw = ProcessInfo.processInfo.environment["AIDR_API_BASE"], let base = URL(string: raw) {
      return APIClient(base: base)
    }
    return APIClient()
  }

  /// The images Today asks for: each digest row's `thumbnail`, the same URL
  /// AsyncImage requests, so a prefetched response answers it from URLCache.
  public static func prefetchURLs(_ feed: Feed, lang: Lang, limit: Int = RefreshJob.prefetchLimit) -> [URL] {
    var seen = Set<URL>()
    return Digest.rows(feed, lang: lang, limit: limit).compactMap(\.thumbnail).filter { seen.insert($0).inserted }
  }

  /// True when the feed was fetched. A failure keeps the saved edition and the
  /// pending notifications as they are.
  @MainActor
  @discardableResult
  public static func run(
    api: APIClient = RefreshJob.defaultClient(),
    snapshots: SnapshotStore = SnapshotStore(),
    notifier: NotifyScheduler = .shared,
    lang: Lang = RefreshJob.readerLang(),
    session: URLSession = .shared
  ) async -> Bool {
    let feed: Feed
    do {
      let (fresh, data) = try await api.feed(days: 3)
      feed = fresh
      do { try snapshots.save(data) } catch {
        log.error("could not save the edition: \(error.localizedDescription, privacy: .public)")
      }
    } catch {
      return false
    }
    await notifier.rescheduleIfEnabled(feed: feed, lang: lang)
    await prefetch(prefetchURLs(feed, lang: lang), session: session)
    return true
  }

  /// Reschedules from the saved edition, fetching one when there is none.
  @MainActor
  public static func reschedule(
    snapshots: SnapshotStore = SnapshotStore(), notifier: NotifyScheduler = .shared, lang: Lang = RefreshJob.readerLang()
  ) async {
    if let feed = snapshots.load() {
      await notifier.rescheduleIfEnabled(feed: feed, lang: lang)
    } else {
      await run(snapshots: snapshots, notifier: notifier, lang: lang)
    }
  }

  /// Four at a time, stopping when the task is cancelled (a background task has about 30 seconds).
  static func prefetch(_ urls: [URL], session: URLSession) async {
    var rest = urls[...]
    while !rest.isEmpty, !Task.isCancelled {
      let batch = Array(rest.prefix(4))
      rest = rest.dropFirst(4)
      await withTaskGroup(of: Void.self) { group in
        for url in batch {
          group.addTask { _ = try? await session.data(from: url) }
        }
      }
    }
  }
}
