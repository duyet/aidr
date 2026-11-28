import AIDRKit
import Foundation
import Observation

extension ArchiveClient {
  /// AIDR_API_BASE points the app at another origin, like TodayStore does.
  static func live() -> ArchiveClient {
    if let raw = ProcessInfo.processInfo.environment["AIDR_API_BASE"], let base = URL(string: raw) {
      return ArchiveClient(api: APIClient(base: base))
    }
    return ArchiveClient()
  }
}

/// Stories the archive rows show a thumbnail or highlight tags for, read from
/// disk first and fetched by 8-character id. Their images are decoration, so a
/// failed fetch leaves a row without one.
@MainActor
@Observable
final class ArchiveStories {
  private(set) var items: [String: Item] = [:]
  let client: ArchiveClient
  private var inflight: Set<String> = []

  init(client: ArchiveClient = .live()) {
    self.client = client
  }

  func item(_ id: String?) -> Item? {
    guard let id else { return nil }
    return items[id]
  }

  func thumb(_ id: String?) -> URL? {
    guard let item = item(id) else { return nil }
    return client.thumbURL(for: item)
  }

  /// Loads the stories not held yet, six at a time.
  func ensure(_ ids: [String]) async {
    var wanted: [String] = []
    for id in ids where items[id] == nil && !inflight.contains(id) && !wanted.contains(id) {
      if let cached = client.cachedStory(id) {
        items[id] = cached
      } else {
        wanted.append(id)
      }
    }
    if wanted.isEmpty { return }
    inflight.formUnion(wanted)
    defer { inflight.subtract(wanted) }
    let client = self.client
    await withTaskGroup(of: (String, Item?).self) { group in
      var next = 0
      while next < min(6, wanted.count) {
        let id = wanted[next]
        next += 1
        group.addTask {
          let item = await client.loadStory(id)
          return (id, item)
        }
      }
      for await result in group {
        if let item = result.1 { items[result.0] = item }
        if Task.isCancelled {
          group.cancelAll()
          continue
        }
        if next < wanted.count {
          let id = wanted[next]
          next += 1
          group.addTask {
            let item = await client.loadStory(id)
            return (id, item)
          }
        }
      }
    }
  }
}

/// One month of the calendar: a count and a lead headline per day, painted from
/// disk and then refreshed. A settled day is never fetched twice.
@MainActor
@Observable
final class ArchiveMonthModel {
  let lang: Lang
  let client: ArchiveClient
  private(set) var today: String
  private(set) var month: String
  private(set) var summaries: [String: ArchiveDaySummary] = [:]
  /// Days still on their way.
  private(set) var pending = 0
  /// Days whose last fetch failed.
  private(set) var failedCount = 0
  private(set) var lastError: String?
  /// The newest fetch time among the month's days.
  private(set) var updatedAt: Date?

  init(lang: Lang, client: ArchiveClient = .live(), now: Date = Date()) {
    self.lang = lang
    self.client = client
    let today = ArchiveCalendar.today(now)
    self.today = today
    self.month = ArchiveCalendar.month(of: today)
  }

  var currentMonth: String { ArchiveCalendar.month(of: today) }
  var isCurrentMonth: Bool { month == currentMonth }
  var hasPrevious: Bool { month > ArchiveCalendar.firstMonth }
  var hasNext: Bool { month < currentMonth }
  var isLoading: Bool { pending > 0 }
  var failed: Bool { failedCount > 0 }
  /// Every day of the last refresh failed while the screen shows saved days.
  var isOffline: Bool { failedCount > 0 && allFailed && !summaries.isEmpty }
  private var allFailed = false
  var monthDates: [String] { ArchiveCalendar.monthDates(month) }
  var maxCount: Int { monthDates.compactMap { summaries[$0]?.count }.max() ?? 0 }
  /// The month's days, newest first.
  var agenda: [ArchiveDaySummary] { monthDates.reversed().compactMap { summaries[$0] } }

  func step(_ delta: Int) {
    guard let next = ArchiveCalendar.shiftMonth(month, delta), next >= ArchiveCalendar.firstMonth,
      next <= currentMonth
    else { return }
    month = next
  }

  func goToday() { month = currentMonth }

  func load() async {
    today = ArchiveCalendar.today()
    let target = month
    let dates = ArchiveCalendar.monthDates(target).filter { ArchiveCalendar.isArchiveDate($0, today: today) }
    for date in dates where summaries[date] == nil {
      if let day = client.cachedDay(date, lang: lang) { summaries[date] = ArchiveDaySummary(day: day) }
    }
    refreshUpdatedAt(dates)
    let todo = dates.filter { summaries[$0] == nil || !ArchiveCalendar.isSettled($0, today: today) }
    failedCount = 0
    allFailed = false
    lastError = nil
    pending = todo.count
    if todo.isEmpty { return }
    let client = self.client
    let lang = self.lang
    var failedDates: [String] = []
    await withTaskGroup(of: ArchiveDayResult.self) { group in
      var next = 0
      while next < min(6, todo.count) {
        let date = todo[next]
        next += 1
        group.addTask { await client.loadDay(date, lang: lang) }
      }
      for await result in group {
        if Task.isCancelled {
          group.cancelAll()
          continue
        }
        if let day = result.day {
          summaries[result.date] = ArchiveDaySummary(day: day)
        } else if result.failed {
          failedDates.append(result.date)
          lastError = result.error
        }
        if target == month { pending = max(pending - 1, 0) }
        if next < todo.count {
          let date = todo[next]
          next += 1
          group.addTask { await client.loadDay(date, lang: lang) }
        }
      }
    }
    // One more try for the days that failed, a few at a time.
    let attempted = failedDates.count
    if !failedDates.isEmpty && failedDates.count <= 12 && !Task.isCancelled {
      try? await Task.sleep(for: .seconds(1))
      var still: [String] = []
      for date in failedDates {
        let result = await client.loadDay(date, lang: lang)
        if let day = result.day {
          summaries[date] = ArchiveDaySummary(day: day)
        } else if result.failed {
          still.append(date)
          lastError = result.error
        }
      }
      failedDates = still
    }
    if target == month {
      pending = 0
      failedCount = failedDates.count
      allFailed = attempted > 0 && failedDates.count == todo.count
      refreshUpdatedAt(dates)
    }
  }

  private func refreshUpdatedAt(_ dates: [String]) {
    updatedAt = dates.compactMap { client.dayFetchedAt($0, lang: lang) }.max()
  }
}

/// One day page: the digest and the ranked stories of `date`, with in-place
/// previous and next so Back still returns to where the reader came from.
@MainActor
@Observable
final class ArchiveDayModel {
  enum Phase { case loading, loaded, empty, failed }

  let lang: Lang
  let stories: ArchiveStories
  private let client: ArchiveClient
  private(set) var today: String
  private(set) var date: String
  private(set) var day: ArchiveDay?
  private(set) var phase: Phase = .loading
  private(set) var updatedAt: Date?
  /// The last refresh failed; the screen keeps what it has.
  private(set) var refreshFailed = false

  init(date: String, lang: Lang, client: ArchiveClient = .live()) {
    self.date = date
    self.lang = lang
    self.client = client
    self.today = ArchiveCalendar.today()
    self.stories = ArchiveStories(client: client)
  }

  var canGoPrevious: Bool {
    guard let previous = ArchiveCalendar.addDays(date, -1) else { return false }
    return previous >= ArchiveCalendar.firstDate
  }

  var canGoNext: Bool { date < today }

  func step(_ delta: Int) {
    guard let next = ArchiveCalendar.addDays(date, delta), ArchiveCalendar.isArchiveDate(next, today: today)
    else { return }
    date = next
    day = nil
    phase = .loading
    updatedAt = nil
    refreshFailed = false
  }

  func load() async {
    let target = date
    today = ArchiveCalendar.today()
    if let cached = client.cachedDay(target, lang: lang) {
      day = cached
      phase = .loaded
      updatedAt = client.dayFetchedAt(target, lang: lang)
    }
    if day != nil && ArchiveCalendar.isSettled(target, today: today) {
      await prefetch()
      return
    }
    do {
      let fresh = try await client.fetchDay(target, lang: lang)
      guard target == date else { return }
      day = fresh
      phase = fresh == nil ? .empty : .loaded
      refreshFailed = false
      updatedAt = client.dayFetchedAt(target, lang: lang)
    } catch {
      guard target == date else { return }
      refreshFailed = true
      if day == nil { phase = .failed }
    }
    await prefetch()
  }

  private func prefetch() async {
    guard let day else { return }
    await stories.ensure(day.digest.compactMap(\.storyId) + day.stories.prefix(3).map(\.storyId))
  }
}

/// One weekly edition, with in-place previous and next issue.
@MainActor
@Observable
final class ArchiveWeekModel {
  enum Phase { case loading, loaded, missing, failed }

  let lang: Lang
  private let client: ArchiveClient
  private(set) var today: String
  private(set) var week: String
  private(set) var edition: ArchiveWeekEdition?
  private(set) var phase: Phase = .loading
  private(set) var updatedAt: Date?
  private(set) var refreshFailed = false

  init(week: String, lang: Lang, client: ArchiveClient = .live()) {
    self.week = week
    self.lang = lang
    self.client = client
    self.today = ArchiveCalendar.today()
  }

  var issue: Int? { ArchiveCalendar.issue(week) }

  var canGoPrevious: Bool {
    guard let previous = ArchiveCalendar.shiftWeek(week, -1) else { return false }
    return ArchiveCalendar.issue(previous) != nil
  }

  var canGoNext: Bool {
    guard let next = ArchiveCalendar.shiftWeek(week, 1) else { return false }
    return ArchiveCalendar.isLinkedWeek(next, today: today)
  }

  func step(_ delta: Int) {
    guard let next = ArchiveCalendar.shiftWeek(week, delta),
      ArchiveCalendar.isLinkedWeek(next, today: today)
    else { return }
    week = next
    edition = nil
    phase = .loading
    updatedAt = nil
    refreshFailed = false
  }

  func thumb(_ story: ArchiveWeekStory) -> URL? {
    client.thumbURL(itemId: story.itemId, image: story.imageUrl)
  }

  func load() async {
    let target = week
    today = ArchiveCalendar.today()
    if let cached = client.cachedWeek(target) {
      edition = cached
      phase = .loaded
      updatedAt = cached.updatedDate ?? client.weekFetchedAt(target)
      if ArchiveCalendar.isFinalWeek(target, today: today) { return }
    }
    do {
      let fresh = try await client.fetchWeek(target)
      guard target == week else { return }
      edition = fresh
      phase = fresh == nil ? .missing : .loaded
      refreshFailed = false
      updatedAt = fresh?.updatedDate ?? client.weekFetchedAt(target)
    } catch {
      guard target == week else { return }
      refreshFailed = true
      if edition == nil { phase = .failed }
    }
  }
}

/// The weekly editions list, newest first. Each row's edition loads when the
/// row appears; a closed week older than the last one never refetches.
@MainActor
@Observable
final class ArchiveWeeksModel {
  let lang: Lang
  private let client: ArchiveClient
  private(set) var today: String
  private(set) var weeks: [String]
  private(set) var editions: [String: ArchiveWeekEdition] = [:]
  /// The last refresh failed; rows keep their saved editions.
  private(set) var refreshFailed = false

  init(lang: Lang, client: ArchiveClient = .live()) {
    self.lang = lang
    self.client = client
    let today = ArchiveCalendar.today()
    self.today = today
    self.weeks = ArchiveCalendar.weeks(today: today)
    for week in weeks {
      if let cached = client.cachedWeek(week) { editions[week] = cached }
    }
  }

  /// The newest edition write among the rows.
  var updatedAt: Date? { editions.values.compactMap(\.updatedDate).max() }

  func thumb(_ story: ArchiveWeekStory) -> URL? {
    client.thumbURL(itemId: story.itemId, image: story.imageUrl)
  }

  func ensure(_ week: String) async {
    if editions[week] != nil && ArchiveCalendar.isFinalWeek(week, today: today) { return }
    do {
      if let fresh = try await client.fetchWeek(week) { editions[week] = fresh }
    } catch {
      refreshFailed = true
    }
  }

  /// Pull to refresh: the weeks that can still change.
  func refresh() async {
    today = ArchiveCalendar.today()
    weeks = ArchiveCalendar.weeks(today: today)
    refreshFailed = false
    for week in weeks where !ArchiveCalendar.isFinalWeek(week, today: today) {
      await ensure(week)
    }
  }
}
