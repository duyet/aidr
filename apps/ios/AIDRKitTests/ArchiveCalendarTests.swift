import AIDRKit
import Foundation
import Testing

struct ArchiveCalendarTests {
  @Test func todayIsTheVietnamDayNotTheDeviceDay() throws {
    let day = try #require(ArchiveCalendar.epochDay("2026-11-28"))
    let midnightUTC = day * 86_400
    // 16:59:59 UTC is 23:59:59 in Ho Chi Minh City, 17:00:00 UTC is the next day.
    #expect(ArchiveCalendar.today(Date(timeIntervalSince1970: TimeInterval(midnightUTC + 16 * 3600 + 3599))) == "2026-11-28")
    #expect(ArchiveCalendar.today(Date(timeIntervalSince1970: TimeInterval(midnightUTC + 17 * 3600))) == "2026-11-29")
  }

  @Test func datesMustBeReal() {
    #expect(ArchiveCalendar.epochDay("2026-02-30") == nil)
    #expect(ArchiveCalendar.epochDay("nope") == nil)
    #expect(ArchiveCalendar.addDays("2026-12-31", 1) == "2027-01-01")
    #expect(ArchiveCalendar.addDays("2026-03-01", -1) == "2026-02-28")
    #expect(ArchiveCalendar.weekdayMon0("2026-11-28") == 5)  // Saturday
    #expect(ArchiveCalendar.weekdayMon0("2026-11-23") == 0)  // Monday
  }

  @Test func isoWeeksMatchTheWebCalendar() {
    #expect(ArchiveCalendar.isoWeek(ofDate: "2026-11-01") == "2026-W44")
    #expect(ArchiveCalendar.isoWeek(ofDate: "2026-11-02") == "2026-W45")
    #expect(ArchiveCalendar.isoWeek(ofDate: "2026-11-28") == "2026-W48")
    #expect(ArchiveCalendar.isoWeek(ofDate: "2027-01-01") == "2026-W53")
    #expect(ArchiveCalendar.weekDates("2026-W53")?.first == "2026-12-28")
    #expect(ArchiveCalendar.weekDates("2026-W54") == nil)
    #expect(ArchiveCalendar.weekDates("2025-W53") == nil)  // 2025 has 52 weeks
    #expect(ArchiveCalendar.weekBounds("2026-W47")?.start == "2026-11-16")
    #expect(ArchiveCalendar.weekBounds("2026-W47")?.end == "2026-11-22")
  }

  @Test func issueNumbersCountFromWeek40() {
    #expect(ArchiveCalendar.issue("2026-W40") == 1)
    #expect(ArchiveCalendar.issue("2026-W44") == 5)
    #expect(ArchiveCalendar.issue("2026-W46") == 7)
    #expect(ArchiveCalendar.issue("2026-W47") == 8)
    #expect(ArchiveCalendar.issue("2026-W48") == 9)
    #expect(ArchiveCalendar.issue("2026-W39") == nil)
  }

  @Test func weekListRunsFromTheOpenWeekBackToIssueOne() {
    let weeks = ArchiveCalendar.weeks(today: "2026-11-28")
    #expect(weeks.first == "2026-W48")
    #expect(weeks[1] == "2026-W47")
    #expect(weeks.last == "2026-W40")
    #expect(weeks.count == 9)
    #expect(ArchiveCalendar.lastClosedWeek(today: "2026-11-28") == "2026-W47")
    // On a Monday the week that just ended is the newest closed one.
    #expect(ArchiveCalendar.lastClosedWeek(today: "2026-11-30") == "2026-W48")
    #expect(ArchiveCalendar.openWeek(today: "2026-11-30") == "2026-W49")
    #expect(ArchiveCalendar.openWeek(today: "2026-09-20") == nil)
  }

  @Test func weekLinksAndFinality() {
    let today = "2026-11-28"
    #expect(ArchiveCalendar.isLinkedWeek("2026-W47", today: today))
    #expect(ArchiveCalendar.isLinkedWeek("2026-W48", today: today))  // in progress: provisional ranking
    #expect(!ArchiveCalendar.isLinkedWeek("2026-W49", today: today))
    #expect(!ArchiveCalendar.isLinkedWeek("2026-W39", today: today))
    #expect(ArchiveCalendar.isFinalWeek("2026-W46", today: today))
    #expect(!ArchiveCalendar.isFinalWeek("2026-W47", today: today))  // may still be upgraded
    #expect(!ArchiveCalendar.isFinalWeek("2026-W48", today: today))
  }

  @Test func daysSettleAfterThreeDays() {
    #expect(ArchiveCalendar.isSettled("2026-11-24", today: "2026-11-28"))
    #expect(!ArchiveCalendar.isSettled("2026-11-25", today: "2026-11-28"))
    #expect(!ArchiveCalendar.isSettled("2026-11-28", today: "2026-11-28"))
    #expect(ArchiveCalendar.isArchiveDate("2026-08-15", today: "2026-11-28"))
    #expect(!ArchiveCalendar.isArchiveDate("2026-08-14", today: "2026-11-28"))
    #expect(!ArchiveCalendar.isArchiveDate("2026-11-29", today: "2026-11-28"))
  }

  @Test func novemberGridHasSixIsoWeekRows() throws {
    let rows = ArchiveCalendar.monthRows("2026-11")
    #expect(rows.count == 6)
    #expect(rows.allSatisfy { $0.count == 7 })
    #expect(rows[0].prefix(6).allSatisfy { $0 == nil })  // the 1st is a Sunday
    #expect(rows[0][6] == "2026-11-01")
    #expect(rows[5][0] == "2026-11-30")
    let weeks = rows.map { row in row.compactMap { $0 }.first.flatMap { ArchiveCalendar.isoWeek(ofDate: $0) } }
    #expect(weeks == ["2026-W44", "2026-W45", "2026-W46", "2026-W47", "2026-W48", "2026-W49"])
    #expect(rows.flatMap { $0 }.compactMap { $0 }.count == 30)
    #expect(ArchiveCalendar.shiftMonth("2026-01", -1) == "2025-12")
    #expect(ArchiveCalendar.shiftMonth("2026-12", 1) == "2027-01")
    #expect(ArchiveCalendar.daysInMonth("2026-02") == 28)
  }

  @Test func heatLevelsAreRelativeToTheBusiestDay() {
    #expect(ArchiveCalendar.heatLevel(count: 0, max: 195) == 0)
    #expect(ArchiveCalendar.heatLevel(count: 10, max: 0) == 0)
    #expect(ArchiveCalendar.heatLevel(count: 2, max: 10) == 1)
    #expect(ArchiveCalendar.heatLevel(count: 3, max: 10) == 2)
    #expect(ArchiveCalendar.heatLevel(count: 5, max: 10) == 2)
    #expect(ArchiveCalendar.heatLevel(count: 6, max: 10) == 3)
    #expect(ArchiveCalendar.heatLevel(count: 8, max: 10) == 4)
    #expect(ArchiveCalendar.heatLevel(count: 195, max: 195) == 4)
  }

  @Test func labelsReadInBothLanguages() {
    #expect(ArchiveCalendar.monthTitle("2026-11", lang: .vi) == "Tháng 11, 2026")
    #expect(ArchiveCalendar.monthTitle("2026-11", lang: .en) == "November 2026")
    #expect(ArchiveCalendar.dayLong("2026-11-26", lang: .vi) == "Thứ Năm, 26 tháng 11")
    #expect(ArchiveCalendar.dayLong("2026-11-26", lang: .en) == "Thursday, Nov 26")
    #expect(ArchiveCalendar.weekdayShort("2026-11-28", lang: .vi) == "T7")
    #expect(ArchiveCalendar.weekdayShort("2026-11-22", lang: .vi) == "CN")
    #expect(ArchiveCalendar.weekdayShort("2026-11-28", lang: .en) == "Sat")
    #expect(ArchiveCalendar.storiesLabel(36, lang: .vi) == "36 tin")
    #expect(ArchiveCalendar.storiesLabel(1, lang: .en) == "1 story")
    #expect(ArchiveCalendar.storiesLabel(36, lang: .en) == "36 stories")
    #expect(ArchiveCalendar.issueLabel(8, lang: .vi) == "Số 8")
    #expect(ArchiveCalendar.issueLabel(8, lang: .en) == "No. 8")
    #expect(ArchiveCalendar.weekNumber("2026-W47") == "W47")
  }

  @Test func weekRangesMatchTheWeb() {
    #expect(ArchiveCalendar.weekRange("2026-W47", lang: .vi) == "16 – 22 tháng 11, 2026")
    #expect(ArchiveCalendar.weekRange("2026-W47", lang: .en) == "Nov 16 – 22, 2026")
    #expect(ArchiveCalendar.weekRange("2026-W44", lang: .vi) == "26/10 – 1/11, 2026")
    #expect(ArchiveCalendar.weekRange("2026-W44", lang: .en) == "Oct 26 – Nov 1, 2026")
    #expect(ArchiveCalendar.weekRange("2026-W53", lang: .en) == "Dec 28, 2026 – Jan 3, 2027")
  }
}
