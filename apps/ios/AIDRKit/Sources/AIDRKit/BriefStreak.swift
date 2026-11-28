import Foundation

/// Days in a row the brief was read to the end. Days are local calendar dates
/// written "yyyy-MM-dd"; the arithmetic never leaves that label, so a time
/// zone change cannot split or merge two days.
public struct BriefStreak: Equatable, Sendable {
  public struct Day: Equatable, Sendable {
    public var key: String
    /// 1 is Sunday, like Calendar.
    public var weekday: Int
    public var done: Bool
  }

  public private(set) var days: Set<String>

  public init(days: Set<String> = []) {
    self.days = days
  }

  static let labels: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .gmt
    return calendar
  }()

  /// The local day `date` falls on.
  public static func key(for date: Date, calendar: Calendar = .current) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  static func date(_ key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return labels.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  static func shifted(_ key: String, by days: Int) -> String? {
    date(key).flatMap { labels.date(byAdding: .day, value: days, to: $0) }.map { self.key(for: $0, calendar: labels) }
  }

  /// Finishing a day twice counts once.
  public mutating func recordFinished(on key: String) {
    days.insert(key)
  }

  /// The run of finished days ending today, or ending yesterday while today
  /// is still unread. A gap of one whole day resets it to 0.
  public func current(today: String) -> Int {
    var cursor: String? = days.contains(today) ? today : Self.shifted(today, by: -1)
    var count = 0
    while let key = cursor, days.contains(key) {
      count += 1
      cursor = Self.shifted(key, by: -1)
    }
    return count
  }

  /// The last 7 days, oldest first, ending today.
  public func week(endingOn today: String) -> [Day] {
    (0..<7).reversed().compactMap { back in
      guard let key = Self.shifted(today, by: -back), let date = Self.date(key) else { return nil }
      return Day(key: key, weekday: Self.labels.component(.weekday, from: date), done: days.contains(key))
    }
  }
}

/// The streak on disk, in UserDefaults.
public struct BriefStreakStore {
  public static let defaultsKey = "brief.finishedDays"
  static let keep = 120

  private let defaults: UserDefaults

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  public func load() -> BriefStreak {
    BriefStreak(days: Set(defaults.stringArray(forKey: Self.defaultsKey) ?? []))
  }

  public func save(_ streak: BriefStreak) {
    defaults.set(Array(streak.days.sorted().suffix(Self.keep)), forKey: Self.defaultsKey)
  }
}
