import AIDRKit
import Foundation
import Testing

struct BriefStreakTests {
  @Test func consecutiveDaysAddUp() {
    var streak = BriefStreak()
    for day in ["2026-11-26", "2026-11-27", "2026-11-28"] { streak.recordFinished(on: day) }
    #expect(streak.current(today: "2026-11-28") == 3)
  }

  @Test func finishingTwiceInADayCountsOnce() {
    var streak = BriefStreak()
    streak.recordFinished(on: "2026-11-28")
    streak.recordFinished(on: "2026-11-28")
    #expect(streak.current(today: "2026-11-28") == 1)
    #expect(streak.days.count == 1)
  }

  @Test func aMissedDayResetsTheStreak() {
    let streak = BriefStreak(days: ["2026-11-24", "2026-11-25", "2026-11-27"])
    #expect(streak.current(today: "2026-11-27") == 1)
    #expect(streak.current(today: "2026-11-28") == 1, "yesterday still holds the run until today passes")
    #expect(streak.current(today: "2026-11-29") == 0)
  }

  @Test func theRunCrossesMonthAndYearEnds() {
    let streak = BriefStreak(days: ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"])
    #expect(streak.current(today: "2027-01-02") == 4)
    let leap = BriefStreak(days: ["2028-02-28", "2028-02-29", "2028-03-01"])
    #expect(leap.current(today: "2028-03-01") == 3)
  }

  @Test func weekEndsToday() {
    let streak = BriefStreak(days: ["2026-11-27", "2026-11-28"])
    let week = streak.week(endingOn: "2026-11-28")
    #expect(week.map(\.key) == ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"])
    #expect(week.map(\.done) == [false, false, false, false, false, true, true])
    // 2026-11-28 is a Saturday.
    #expect(week.last?.weekday == 7)
  }

  @Test func dayKeyIsTheLocalCalendarDay() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    // 2026-11-28 18:30 UTC is already the 29th in Vietnam.
    let late = Date(timeIntervalSince1970: 1_795_890_600)
    #expect(BriefStreak.key(for: late, calendar: calendar) == "2026-11-29")
  }

  @Test func storeKeepsTheDaysAcrossLaunches() throws {
    let suite = "brief-streak-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = BriefStreakStore(defaults: defaults)
    #expect(store.load().days.isEmpty)
    var streak = BriefStreak()
    streak.recordFinished(on: "2026-11-27")
    streak.recordFinished(on: "2026-11-28")
    store.save(streak)
    #expect(BriefStreakStore(defaults: defaults).load() == streak)
  }
}
