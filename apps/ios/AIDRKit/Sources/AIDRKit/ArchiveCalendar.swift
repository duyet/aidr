import Foundation

/// Calendar rules for the archive: audience-zone days, ISO weeks, weekly issue
/// numbers, month grids and heat levels. Ports of apps/web/src/lib/calendar.ts,
/// week.ts and day-archive.ts, and components/calendar/shared.ts for labels.
///
/// A day is a calendar day in Asia/Ho_Chi_Minh (UTC+7, no DST), the same key
/// as /date/YYYY-MM-DD, whatever the device time zone is. All dates are
/// "yyyy-MM-dd" strings, months "yyyy-MM", weeks "yyyy-Www".
public enum ArchiveCalendar {
  /// The first day with an edition (sitemaps/days.xml starts here, no gaps).
  public static let firstDate = "2026-08-15"
  public static let firstMonth = "2026-08"
  /// Issue 1 of the weekly edition.
  public static let firstWeek = "2026-W40"
  /// Ranks move for 72 hours after publish, then a day is frozen.
  public static let settleDays = 3

  static let audienceOffset: TimeInterval = 7 * 3600
  static let secondsPerDay: TimeInterval = 86_400

  // MARK: Days

  /// Today in the audience zone.
  public static func today(_ now: Date = Date()) -> String {
    string(epochDay: Int(floor((now.timeIntervalSince1970 + audienceOffset) / secondsPerDay)))
  }

  static func gregorian() -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .gmt
    return calendar
  }

  /// Days since 1970-01-01 for a real calendar date, else nil ("2026-02-30" is not real).
  public static func epochDay(_ date: String) -> Int? {
    let bits = date.split(separator: "-").compactMap { Int($0) }
    guard bits.count == 3, date.split(separator: "-").count == 3 else { return nil }
    let calendar = gregorian()
    guard let value = calendar.date(from: DateComponents(year: bits[0], month: bits[1], day: bits[2]))
    else { return nil }
    let back = calendar.dateComponents([.year, .month, .day], from: value)
    guard back.year == bits[0], back.month == bits[1], back.day == bits[2] else { return nil }
    return Int(floor(value.timeIntervalSince1970 / secondsPerDay))
  }

  public static func string(epochDay: Int) -> String {
    let value = Date(timeIntervalSince1970: TimeInterval(epochDay) * secondsPerDay)
    let parts = gregorian().dateComponents([.year, .month, .day], from: value)
    return String(format: "%04d-%02d-%02d", parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1)
  }

  /// 0 for Monday through 6 for Sunday. 1970-01-01 was a Thursday.
  static func weekdayIndex(epochDay: Int) -> Int { ((epochDay % 7) + 7 + 3) % 7 }

  public static func weekdayMon0(_ date: String) -> Int? {
    guard let day = epochDay(date) else { return nil }
    return weekdayIndex(epochDay: day)
  }

  public static func addDays(_ date: String, _ delta: Int) -> String? {
    epochDay(date).map { string(epochDay: $0 + delta) }
  }

  /// True once a day is past the rank-settle window, so its edition no longer changes.
  public static func isSettled(_ date: String, today: String) -> Bool {
    guard let edge = addDays(today, -settleDays) else { return false }
    return date < edge
  }

  /// A date a reader can open: inside the archive, not in the future.
  public static func isArchiveDate(_ date: String, today: String) -> Bool {
    date >= firstDate && date <= today
  }

  // MARK: Weeks

  /// ISO week (Monday to Sunday) of a date, e.g. "2026-W48". The ISO year can
  /// differ from the calendar year: 2027-01-01 is 2026-W53.
  public static func isoWeek(ofDate date: String) -> String? {
    guard let day = epochDay(date) else { return nil }
    let thursday = day - weekdayIndex(epochDay: day) + 3
    let year = Int(string(epochDay: thursday).prefix(4)) ?? 1970
    guard let jan1 = epochDay(String(format: "%04d-01-01", year)) else { return nil }
    return String(format: "%04d-W%02d", year, (thursday - jan1) / 7 + 1)
  }

  /// Monday through Sunday of a week key, or nil for a malformed key or a week
  /// the ISO year does not have.
  public static func weekDates(_ week: String) -> [String]? {
    let bits = week.components(separatedBy: "-W")
    guard bits.count == 2, bits[0].count == 4, bits[1].count == 2,
      let year = Int(bits[0]), let number = Int(bits[1]), (1...53).contains(number),
      let jan4 = epochDay(String(format: "%04d-01-04", year))
    else { return nil }
    let monday = jan4 - weekdayIndex(epochDay: jan4) + (number - 1) * 7
    let dates = (0..<7).map { string(epochDay: monday + $0) }
    return isoWeek(ofDate: dates[0]) == week ? dates : nil
  }

  public static func weekBounds(_ week: String) -> (start: String, end: String)? {
    guard let dates = weekDates(week) else { return nil }
    return (dates[0], dates[6])
  }

  static func weeksBetween(_ a: String, _ b: String) -> Int? {
    guard let da = weekDates(a)?.first, let db = weekDates(b)?.first,
      let ea = epochDay(da), let eb = epochDay(db)
    else { return nil }
    return (eb - ea) / 7
  }

  /// Weekly issue number: 1 for 2026-W40, nil before it.
  public static func issue(_ week: String) -> Int? {
    guard let diff = weeksBetween(firstWeek, week), diff >= 0 else { return nil }
    return diff + 1
  }

  public static func shiftWeek(_ week: String, _ delta: Int) -> String? {
    guard let monday = weekDates(week)?.first, let day = epochDay(monday) else { return nil }
    return isoWeek(ofDate: string(epochDay: day + delta * 7))
  }

  /// The newest week whose Sunday is over.
  public static func lastClosedWeek(today: String) -> String? {
    addDays(today, -7).flatMap { isoWeek(ofDate: $0) }
  }

  /// The week of `today`, or nil before the first issue.
  public static func openWeek(today: String) -> String? {
    guard let week = isoWeek(ofDate: today), issue(week) != nil else { return nil }
    return week
  }

  /// Weeks with an edition, newest first: the open week, then every closed one.
  public static func weeks(today: String) -> [String] {
    var out: [String] = []
    if let open = openWeek(today: today) { out.append(open) }
    var cursor = lastClosedWeek(today: today)
    while let week = cursor, issue(week) != nil, out.count < 520 {
      out.append(week)
      cursor = shiftWeek(week, -1)
    }
    return out
  }

  /// A week a reader can open: it has an issue and has started. The open week
  /// opens its provisional ranking, as on the web.
  public static func isLinkedWeek(_ week: String, today: String) -> Bool {
    guard issue(week) != nil, let current = isoWeek(ofDate: today) else { return false }
    return week <= current
  }

  /// Closed weeks older than the last one never change; the last closed week
  /// can still be upgraded from a title fallback, and the open week is live.
  public static func isFinalWeek(_ week: String, today: String) -> Bool {
    guard let last = lastClosedWeek(today: today) else { return false }
    return week < last
  }

  // MARK: Months

  public static func month(of date: String) -> String { String(date.prefix(7)) }

  public static func shiftMonth(_ month: String, _ delta: Int) -> String? {
    let bits = month.split(separator: "-").compactMap { Int($0) }
    guard bits.count == 2, (1...12).contains(bits[1]) else { return nil }
    let index = bits[0] * 12 + (bits[1] - 1) + delta
    return String(format: "%04d-%02d", index / 12, index % 12 + 1)
  }

  public static func daysInMonth(_ month: String) -> Int? {
    guard let next = shiftMonth(month, 1), let a = epochDay(month + "-01"), let b = epochDay(next + "-01")
    else { return nil }
    return b - a
  }

  /// Every date of the month.
  public static func monthDates(_ month: String) -> [String] {
    guard let count = daysInMonth(month) else { return [] }
    return (1...count).map { "\(month)-" + String(format: "%02d", $0) }
  }

  /// The month as rows of seven (Monday first), padded with nil, so each row
  /// is inside one ISO week.
  public static func monthRows(_ month: String) -> [[String?]] {
    guard let lead = weekdayMon0(month + "-01") else { return [] }
    var cells: [String?] = Array(repeating: nil, count: lead) + monthDates(month).map { Optional($0) }
    while cells.count % 7 != 0 { cells.append(nil) }
    return stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<($0 + 7)]) }
  }

  /// Heat level 0 to 4 for a story count, relative to the busiest day shown.
  public static func heatLevel(count: Int, max: Int) -> Int {
    if count <= 0 || max <= 0 { return 0 }
    let ratio = Double(count) / Double(max)
    if ratio > 0.75 { return 4 }
    if ratio > 0.5 { return 3 }
    if ratio > 0.25 { return 2 }
    return 1
  }

  // MARK: Labels

  static let monthShortEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  static let monthLongEn = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December",
  ]
  static let weekdayLongEn = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  static let weekdayLongVi = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
  static let weekdayShortEn = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  static let weekdayShortVi = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

  /// "Tháng 11, 2026" / "November 2026".
  public static func monthTitle(_ month: String, lang: Lang) -> String {
    let bits = month.split(separator: "-").compactMap { Int($0) }
    guard bits.count == 2, (1...12).contains(bits[1]) else { return month }
    return lang == .vi ? "Tháng \(bits[1]), \(bits[0])" : "\(monthLongEn[bits[1] - 1]) \(bits[0])"
  }

  /// The grid's column heads, Monday first.
  public static func weekdayInitials(lang: Lang) -> [String] {
    lang == .vi ? weekdayShortVi : ["M", "T", "W", "T", "F", "S", "S"]
  }

  /// "T5" / "Thu".
  public static func weekdayShort(_ date: String, lang: Lang) -> String {
    guard let index = weekdayMon0(date) else { return "" }
    return (lang == .vi ? weekdayShortVi : weekdayShortEn)[index]
  }

  /// "Thứ Năm, 26 tháng 11" / "Thursday, Nov 26".
  public static func dayLong(_ date: String, lang: Lang) -> String {
    let bits = date.split(separator: "-").compactMap { Int($0) }
    guard bits.count == 3, (1...12).contains(bits[1]), let index = weekdayMon0(date) else { return date }
    if lang == .vi { return "\(weekdayLongVi[index]), \(bits[2]) tháng \(bits[1])" }
    return "\(weekdayLongEn[index]), \(monthShortEn[bits[1] - 1]) \(bits[2])"
  }

  /// "5 tin" / "1 story" / "36 stories".
  public static func storiesLabel(_ count: Int, lang: Lang) -> String {
    if lang == .vi { return "\(count) tin" }
    return count == 1 ? "1 story" : "\(count) stories"
  }

  /// "Số 8" / "No. 8".
  public static func issueLabel(_ issue: Int, lang: Lang) -> String {
    lang == .vi ? "Số \(issue)" : "No. \(issue)"
  }

  /// "W46" from "2026-W46".
  public static func weekNumber(_ week: String) -> String {
    week.components(separatedBy: "-").last ?? week
  }

  /// "16 – 22 tháng 11, 2026" / "Nov 16 – 22, 2026" (formatWeekRange in week.ts).
  public static func weekRange(_ week: String, lang: Lang) -> String? {
    guard let bounds = weekBounds(week) else { return nil }
    let s = bounds.start.split(separator: "-").compactMap { Int($0) }
    let e = bounds.end.split(separator: "-").compactMap { Int($0) }
    guard s.count == 3, e.count == 3 else { return nil }
    let (sy, sm, sd) = (s[0], s[1], s[2])
    let (ey, em, ed) = (e[0], e[1], e[2])
    if lang == .vi {
      return sm == em ? "\(sd) – \(ed) tháng \(em), \(ey)" : "\(sd)/\(sm) – \(ed)/\(em), \(ey)"
    }
    let start = monthShortEn[sm - 1]
    let end = monthShortEn[em - 1]
    if sy != ey { return "\(start) \(sd), \(sy) – \(end) \(ed), \(ey)" }
    return sm == em ? "\(start) \(sd) – \(ed), \(ey)" : "\(start) \(sd) – \(end) \(ed), \(ey)"
  }
}
