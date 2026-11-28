import AIDRKit
import SwiftUI

/// The last page: you are caught up, how many days in a row, and Share.
struct BriefEndPage: View {
  let date: String?
  let lang: Lang
  let streak: BriefStreak
  let insets: EdgeInsets
  let onRestart: () -> Void

  var body: some View {
    let today = BriefStreak.key(for: .now)
    VStack(alignment: .leading, spacing: 0) {
      Spacer(minLength: Spacing.xl)
      Image(systemName: "checkmark")
        .font(.system(size: 30, weight: .bold))
        .foregroundStyle(Palette.signalInk)
        .frame(width: 72, height: 72)
        .background(Palette.signal, in: Circle())
        .accessibilityHidden(true)
      Text(lang == .vi ? "Hết rồi!" : "You're all caught up")
        .font(.inter(40, .semibold, relativeTo: .largeTitle))
        .tracking(-1)
        .lineLimit(2)
        .minimumScaleFactor(0.7)
        .foregroundStyle(Palette.foreground)
        .padding(.top, Spacing.xl)
      Text(lang == .vi ? "Bạn đã đọc hết AI;DR hôm nay." : "That was today's AI;DR.")
        .font(.inter(16, relativeTo: .body))
        .foregroundStyle(Palette.mutedForeground)
        .padding(.top, Spacing.sm)
      streakCard(today: today)
        .padding(.top, Spacing.xl)
      Spacer(minLength: Spacing.xl)
      HStack(spacing: Spacing.md) {
        if let date, let url = BriefDeck.shareURL(date: date, lang: lang) {
          ShareLink(item: url) {
            Label(lang == .vi ? "Chia sẻ bản tin" : "Share this edition", systemImage: "square.and.arrow.up")
              .font(.inter(16, .semibold, relativeTo: .body))
              .foregroundStyle(Palette.signalInk)
              .padding(.horizontal, Spacing.xs)
          }
          .buttonStyle(.glassProminent)
          .tint(Palette.signal)
          .controlSize(.large)
          .accessibilityIdentifier("brief-share")
        }
        Button(action: onRestart) {
          Label(lang == .vi ? "Đọc lại" : "Read again", systemImage: "arrow.counterclockwise")
            .font(.inter(16, .medium, relativeTo: .body))
        }
        .buttonStyle(.glass)
        .controlSize(.large)
      }
    }
    .padding(.horizontal, Spacing.xl)
    .padding(.top, insets.top + 28)
    .padding(.bottom, insets.bottom + Spacing.lg)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Palette.background)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("brief-end")
  }

  private func streakCard(today: String) -> some View {
    let count = max(streak.current(today: today), 1)
    return VStack(alignment: .leading, spacing: Spacing.lg) {
      HStack(alignment: .center, spacing: Spacing.md) {
        Image(systemName: "flame.fill")
          .font(.system(size: 34))
          .foregroundStyle(Color(hex: "#f59e0b"))
          .accessibilityHidden(true)
        Text("\(count)")
          .font(.inter(56, .semibold, relativeTo: .largeTitle))
          .tracking(-2)
          .monospacedDigit()
          .foregroundStyle(Palette.foreground)
          .accessibilityIdentifier("brief-streak-count")
        VStack(alignment: .leading, spacing: 2) {
          Text(lang == .vi ? "ngày liên tiếp" : "day streak")
            .font(.inter(16, .semibold, relativeTo: .body))
            .foregroundStyle(Palette.foreground)
          Text(lang == .vi ? "đọc hết bản tin" : "finishing the brief")
            .font(.inter(13, relativeTo: .footnote))
            .foregroundStyle(Palette.mutedForeground)
        }
      }
      HStack(spacing: 0) {
        ForEach(streak.week(endingOn: today), id: \.key) { day in
          VStack(spacing: Spacing.sm) {
            Circle()
              .fill(day.done || day.key == today ? Palette.signal : Palette.muted)
              .overlay { Circle().stroke(Palette.border, lineWidth: 0.5) }
              .frame(width: 26, height: 26)
            Text(weekdayLabel(day.weekday))
              .font(.mono(11, weight: day.key == today ? .semibold : .regular))
              .foregroundStyle(day.key == today ? Palette.foreground : Palette.mutedForeground)
          }
          .frame(maxWidth: .infinity)
        }
      }
      .accessibilityHidden(true)
    }
    .padding(Spacing.lg)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Palette.muted, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  private func weekdayLabel(_ weekday: Int) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = Locale(identifier: lang == .vi ? "vi_VN" : "en_US")
    let symbols = calendar.veryShortStandaloneWeekdaySymbols
    return symbols.indices.contains(weekday - 1) ? symbols[weekday - 1] : ""
  }
}
