import Foundation

/// The "Cập nhật 5 phút trước" line under a story's byline.
public enum StoryFreshness {
  /// "Updated 5 min. ago", or when the screen shows a saved copy because the
  /// network failed, "Offline · saved 07:12" (clock in `timeZone`, the device's by default).
  public static func line(
    fetchedAt: Date, now: Date, lang: Lang, offline: Bool, timeZone: TimeZone = .current
  ) -> String {
    if offline {
      let clock = DateFormatter()
      clock.locale = Locale(identifier: "en_US_POSIX")
      clock.timeZone = timeZone
      clock.dateFormat = "HH:mm"
      let time = clock.string(from: fetchedAt)
      return lang == .vi ? "Ngoại tuyến · bản lưu lúc \(time)" : "Offline · saved \(time)"
    }
    if now.timeIntervalSince(fetchedAt) < 60 { return lang == .vi ? "Vừa cập nhật" : "Just updated" }
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = Locale(identifier: lang == .vi ? "vi_VN" : "en_US")
    formatter.unitsStyle = lang == .vi ? .full : .short
    let relative = formatter.localizedString(for: fetchedAt, relativeTo: now)
    return lang == .vi ? "Cập nhật \(relative)" : "Updated \(relative)"
  }
}
