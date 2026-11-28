import Foundation

/// The cover's "Updated 5 min ago" line, from the feed's own updatedAt (not
/// the time of the fetch), or the offline note naming when the saved copy is from.
public enum BriefFreshness {
  public static func label(
    updatedAt: Date?, offline: Bool, lang: Lang, now: Date = .now, timeZone: TimeZone = .current
  ) -> String? {
    guard let updatedAt else { return nil }
    let locale = Locale(identifier: lang == .vi ? "vi_VN" : "en_US")
    if offline {
      let time = DateFormatter()
      time.locale = locale
      time.timeZone = timeZone
      time.dateFormat = "HH:mm"
      let stamp = time.string(from: updatedAt)
      return lang == .vi ? "Ngoại tuyến · bản lưu lúc \(stamp)" : "Offline · saved \(stamp)"
    }
    if now.timeIntervalSince(updatedAt) < 60 {
      return lang == .vi ? "Cập nhật vừa xong" : "Updated just now"
    }
    let relative = RelativeDateTimeFormatter()
    relative.locale = locale
    relative.unitsStyle = .short
    let ago = relative.localizedString(for: updatedAt, relativeTo: now)
    return lang == .vi ? "Cập nhật \(ago)" : "Updated \(ago)"
  }
}
