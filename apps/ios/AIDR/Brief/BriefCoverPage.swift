import AIDRKit
import SwiftUI

/// Page one: the day block of Today, drawn large.
struct BriefCoverPage: View {
  let cover: BriefCover
  let lang: Lang
  let offline: Bool
  let insets: EdgeInsets
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: Spacing.sm) {
        BriefMark()
        Text("AI;DR")
          .font(.inter(19, .semibold, relativeTo: .title3))
          .tracking(-0.3)
          .foregroundStyle(Palette.foreground)
        Spacer()
        if offline {
          Label(lang == .vi ? "Ngoại tuyến" : "Offline", systemImage: "wifi.slash")
            .font(.inter(12.5, .medium, relativeTo: .caption))
            .foregroundStyle(Palette.mutedForeground)
        }
      }
      Spacer(minLength: Spacing.xl)
      Text(cover.day)
        .font(.inter(140, .semibold, relativeTo: .largeTitle))
        .tracking(-6)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        .foregroundStyle(Palette.foreground)
        .accessibilityIdentifier("brief-cover-day")
      HStack(spacing: 7) {
        Circle().fill(Palette.signal).frame(width: 8, height: 8)
        Text("AI;DR")
          .font(.mono(13, weight: .semibold))
          .tracking(1.3)
          .foregroundStyle(Palette.accent)
      }
      .padding(.top, Spacing.xs)
      Text(cover.line)
        .font(.mono(13))
        .tracking(1.3)
        .foregroundStyle(Palette.mutedForeground)
        .padding(.top, 6)
      Rectangle().fill(Palette.border).frame(height: 0.5).padding(.vertical, Spacing.xl)
      Text(meta)
        .font(.mono(13, weight: .medium))
        .tracking(0.6)
        .foregroundStyle(Palette.mutedForeground)
      if let teaser = cover.teaser {
        Text(teaser)
          .font(.inter(22, .medium, relativeTo: .title3))
          .lineSpacing(3)
          .lineLimit(3)
          .minimumScaleFactor(0.8)
          .foregroundStyle(Palette.foreground)
          .padding(.top, Spacing.md)
      }
      Spacer(minLength: Spacing.xl)
      HStack(spacing: Spacing.sm) {
        Image(systemName: "chevron.up")
          .symbolEffect(.pulse, isActive: !reduceMotion)
        Text(lang == .vi ? "Vuốt lên để đọc" : "Swipe up to read")
      }
      .font(.inter(14, .medium, relativeTo: .subheadline))
      .foregroundStyle(Palette.mutedForeground)
    }
    .padding(.horizontal, Spacing.xl)
    .padding(.top, insets.top + 28)
    .padding(.bottom, insets.bottom + Spacing.lg)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background {
      Palette.background
        .overlay(alignment: .topTrailing) {
          Text(";")
            .font(.inter(420, .bold))
            .foregroundStyle(Palette.signal.opacity(0.16))
            .offset(x: 56, y: 70)
            .accessibilityHidden(true)
        }
        .clipped()
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("brief-cover")
  }

  private var meta: String {
    lang == .vi
      ? "\(cover.storyCount) tin · \(cover.minutes) phút đọc"
      : "\(cover.storyCount) stories · \(cover.minutes) min read"
  }
}

/// The yellow ";" mark.
struct BriefMark: View {
  var size: CGFloat = 22

  var body: some View {
    Text(";")
      .font(.inter(size * 0.72, .bold))
      .foregroundStyle(Palette.signalInk)
      .frame(width: size, height: size)
      .background(Palette.signal, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
      .accessibilityHidden(true)
  }
}
