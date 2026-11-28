import AIDRKit
import SwiftUI

struct TodayView: View {
  let store: TodayStore
  let lang: Lang

  var body: some View {
    NavigationStack {
      content
        .background(Palette.background)
        .toolbar(.hidden, for: .navigationBar)
    }
    .task { await store.refresh() }
  }

  @ViewBuilder private var content: some View {
    if let feed = store.feed {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          Masthead(lang: lang, refreshFailed: store.refreshFailed)
          CategoryChips(categories: feed.categories, lang: lang)
            .padding(.top, Spacing.sm)
          DigestSection(feed: feed, lang: lang)
            .padding(.top, Spacing.xl)
        }
        .padding(.bottom, Spacing.xxl)
      }
      .refreshable { await store.refresh() }
    } else if store.refreshFailed {
      ContentUnavailableView {
        Label(lang == .vi ? "Không tải được" : "Couldn't load", systemImage: "wifi.slash")
      } description: {
        Text(lang == .vi ? "Kiểm tra kết nối rồi thử lại." : "Check your connection and try again.")
      } actions: {
        Button(lang == .vi ? "Thử lại" : "Try again") { Task { await store.refresh() } }
          .buttonStyle(.glassProminent)
      }
    } else {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

/// The yellow ";" mark and the AI;DR wordmark.
private struct Masthead: View {
  let lang: Lang
  let refreshFailed: Bool

  var body: some View {
    HStack(spacing: Spacing.sm) {
      LogoMark()
      Text("AI;DR")
        .font(.inter(19, .semibold, relativeTo: .title3))
        .tracking(-0.3)
        .foregroundStyle(Palette.foreground)
      Spacer()
      if refreshFailed {
        Label(lang == .vi ? "Ngoại tuyến" : "Offline", systemImage: "wifi.slash")
          .font(.inter(12.5, .medium, relativeTo: .caption))
          .foregroundStyle(Palette.mutedForeground)
          .accessibilityIdentifier("offline-note")
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.md)
  }
}

struct LogoMark: View {
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
