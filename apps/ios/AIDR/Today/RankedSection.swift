import AIDRKit
import SwiftUI

/// "TIN XẾP HẠNG HÔM NAY": the day's stories in rank order.
struct RankedSection: View {
  let stories: [TodayStory]
  /// A chip filters the list.
  let filtered: Bool
  let learned: [String]
  let lang: Lang

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(lang == .vi ? "TIN XẾP HẠNG HÔM NAY" : "RANKED TODAY")
        .font(.mono(11, weight: .semibold))
        .tracking(1.1)
        .foregroundStyle(Palette.mutedForeground)
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.xs)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("ranked-header")
      if stories.isEmpty {
        Text(
          !filtered
            ? (lang == .vi ? "Chưa có tin nào hôm nay." : "No stories yet today.")
            : (lang == .vi ? "Chưa có tin nào trong chủ đề này hôm nay." : "No stories in this topic today.")
        )
        .font(.inter(14, relativeTo: .body))
        .foregroundStyle(Palette.mutedForeground)
        .padding(Spacing.lg)
      } else {
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(Array(stories.enumerated()), id: \.element.id) { index, story in
            StoryRow(
              story: story, learned: learned, lang: lang, identifier: "ranked-row-\(index + 1)",
              isLead: index == 0)
          }
        }
      }
    }
  }
}

/// Matches for the search field, over every story of the loaded days.
struct SearchResultsView: View {
  let results: [TodayStory]
  let query: String
  let learned: [String]
  let lang: Lang

  var body: some View {
    if results.isEmpty {
      ContentUnavailableView.search(text: query)
    } else {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          Text(lang == .vi ? "\(results.count) KẾT QUẢ" : "\(results.count) RESULTS")
            .font(.mono(11, weight: .semibold))
            .tracking(1.1)
            .foregroundStyle(Palette.mutedForeground)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xs)
            .accessibilityIdentifier("search-count")
          ForEach(Array(results.enumerated()), id: \.element.id) { index, story in
            StoryRow(
              story: story, learned: learned, lang: lang, identifier: "search-result-\(index + 1)")
          }
        }
        .padding(.bottom, Spacing.xxl)
      }
      .scrollDismissesKeyboard(.interactively)
    }
  }
}
