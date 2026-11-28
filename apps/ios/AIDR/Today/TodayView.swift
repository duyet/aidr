import AIDRKit
import SwiftUI

struct TodayView: View {
  let store: TodayStore
  let lang: Lang

  @State private var query = ""
  @State private var category: String?
  @State private var showSettings = false

  var body: some View {
    NavigationStack {
      content
        .background(Palette.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { masthead }
        .searchable(
          text: $query,
          placement: .navigationBarDrawer(displayMode: .always),
          prompt: lang == .vi ? "Tìm trong tin đã tải" : "Search stories"
        )
        .routeDestinations(lang: lang)
    }
    .task { await store.refresh() }
    .sheet(isPresented: $showSettings) {
      SettingsScreen(lang: lang)
        .presentationDragIndicator(.visible)
    }
  }

  @ToolbarContentBuilder private var masthead: some ToolbarContent {
    ToolbarItem(placement: .topBarLeading) {
      HStack(spacing: Spacing.sm) {
        LogoMark()
        Text("AI;DR")
          .font(.inter(19, .semibold, relativeTo: .title3))
          .tracking(-0.3)
          .foregroundStyle(Palette.foreground)
      }
      .accessibilityElement(children: .combine)
    }
    .sharedBackgroundVisibility(.hidden)
    ToolbarItem(placement: .topBarTrailing) {
      Button {
        showSettings = true
      } label: {
        Text("Aa").font(.inter(16, .semibold))
      }
      .accessibilityLabel(lang == .vi ? "Cài đặt" : "Settings")
      .accessibilityIdentifier("settings-button")
    }
  }

  @ViewBuilder private var content: some View {
    if let feed = store.feed {
      if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        TodayPage(
          feed: feed, lang: lang, refreshFailed: store.refreshFailed, category: $category,
          refresh: { await store.refresh() })
      } else {
        SearchResultsView(
          results: TodayStories.visible(store.index.search(query), lang: lang),
          query: query, learned: feed.learnedKeywords, lang: lang)
      }
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

/// The edition: day header, chips, AI;DR digest, ranked list.
private struct TodayPage: View {
  let feed: Feed
  let lang: Lang
  let refreshFailed: Bool
  @Binding var category: String?
  let refresh: @MainActor () async -> Void

  var body: some View {
    let today = TodayStories.today(feed, lang: lang)
    let chips = TodayStories.chips(today.stories)
    // A category that left the feed on refresh no longer filters.
    let active = chips.contains { Topic.canonical($0.name) == Topic.canonical(category) } ? category : nil
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        if refreshFailed { OfflineNote(lang: lang) }
        if let date = today.date, let heading = TodayFormat.dayHeading(date, lang: lang) {
          DayHeader(
            heading: heading,
            summary: TodayFormat.summary(
              count: today.stories.count, updatedAt: feed.updatedDate, now: .now, lang: lang))
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.xs)
        }
        CategoryChips(chips: chips, total: today.stories.count, selected: $category, lang: lang)
          .padding(.top, Spacing.md)
        DigestSection(feed: feed, lang: lang, category: active)
          .padding(.top, Spacing.lg)
        RankedSection(
          stories: TodayStories.filter(today.stories, category: active),
          category: active, learned: feed.learnedKeywords, lang: lang
        )
        .padding(.top, Spacing.xl)
      }
      .padding(.bottom, Spacing.xxl)
    }
    .refreshable { await refresh() }
  }
}

private struct OfflineNote: View {
  let lang: Lang

  var body: some View {
    Label(
      lang == .vi ? "Ngoại tuyến · đang xem bản đã lưu" : "Offline · showing the saved edition",
      systemImage: "wifi.slash"
    )
    .font(.inter(12.5, .medium, relativeTo: .caption))
    .foregroundStyle(Palette.mutedForeground)
    .padding(.horizontal, Spacing.lg)
    .padding(.bottom, Spacing.sm)
    .accessibilityIdentifier("offline-note")
  }
}

/// "Thứ Bảy, 28 thg 11, 2026" and, under it, "36 tin · cập nhật 9 phút trước".
private struct DayHeader: View {
  let heading: String
  let summary: String

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(heading)
        .font(.inter(23, .semibold, relativeTo: .title2))
        .tracking(-0.3)
        .foregroundStyle(Palette.foreground)
      Text(summary)
        .font(.inter(13, relativeTo: .footnote))
        .foregroundStyle(Palette.mutedForeground)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("day-header")
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
