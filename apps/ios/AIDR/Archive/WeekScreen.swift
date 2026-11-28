import AIDRKit
import SwiftUI

/// One weekly edition from /api/week/:week, with in-place previous and next
/// issue so Back still returns to the list or the calendar.
struct WeekScreen: View {
  let week: String
  let lang: Lang
  @State private var model: ArchiveWeekModel
  @Environment(\.scenePhase) private var scenePhase

  init(week: String, lang: Lang) {
    self.week = week
    self.lang = lang
    _model = State(initialValue: ArchiveWeekModel(week: week, lang: lang))
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        header
        ArchiveStepper(
          previousTitle: lang == .vi ? "Số trước" : "Previous",
          nextTitle: lang == .vi ? "Số sau" : "Next",
          canGoPrevious: model.canGoPrevious,
          canGoNext: model.canGoNext,
          previous: { model.step(-1) },
          next: { model.step(1) }
        )
        .padding(.top, Spacing.md)
        content
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.bottom, Spacing.xxl)
    }
    .id(model.week)
    .background(Palette.background)
    .navigationTitle(ArchiveCalendar.weekNumber(model.week))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        if let url = URL(string: "https://aidr.today/week/\(model.week)?lang=\(lang.rawValue)") {
          ShareLink(item: url)
        }
      }
    }
    .task(id: model.week) { await model.load() }
    .refreshable { await model.load() }
    .accessibilityIdentifier("week-screen")
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await model.load() } }
    }
  }

  private var stories: [ArchiveWeekStory] { model.edition?.stories(in: lang) ?? [] }

  private var header: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        if let issue = model.issue {
          Text(ArchiveCalendar.issueLabel(issue, lang: lang))
            .font(.inter(12, .bold, relativeTo: .caption))
            .foregroundStyle(Palette.primaryForeground)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Palette.accent, in: Capsule())
        }
        Text(ArchiveCalendar.weekRange(model.week, lang: lang) ?? model.week)
          .font(.mono(12, weight: .semibold))
          .foregroundStyle(Palette.foreground)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Spacer(minLength: 0)
        Text(
          (lang == .vi ? "Tuần " : "Week ") + String(ArchiveCalendar.weekNumber(model.week).dropFirst())
        )
        .font(.mono(11))
        .tracking(1)
        .foregroundStyle(Palette.mutedForeground)
        .textCase(.uppercase)
      }
      Text(lang == .vi ? "AI;DR Tuần Này" : "AI;DR Weekly")
        .font(.headline(28, .semibold, relativeTo: .title))
        .tracking(-0.6)
        .foregroundStyle(Palette.foreground)
        .accessibilityAddTraits(.isHeader)
      if model.edition?.isProvisional == true {
        HStack(spacing: 6) {
          Circle().fill(Palette.signal).frame(width: 6, height: 6)
          Text(lang == .vi ? "Đang diễn ra · xếp hạng tạm thời, số chính thức ra vào thứ Hai" : "In progress · provisional ranking, the issue lands on Monday")
        }
        .font(.inter(13, .medium, relativeTo: .footnote))
        .foregroundStyle(Palette.foreground)
      } else if !stories.isEmpty {
        Text(
          lang == .vi
            ? "\(stories.count) tin AI đáng đọc nhất trong tuần"
            : "The \(stories.count) AI stories worth reading this week"
        )
        .font(.inter(14, relativeTo: .subheadline))
        .foregroundStyle(Palette.mutedForeground)
      }
      ArchiveFreshness(updatedAt: model.updatedAt, offline: model.refreshFailed && model.edition != nil, lang: lang)
    }
    .padding(Spacing.lg)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
    .padding(.top, Spacing.sm)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("week-header")
  }

  @ViewBuilder private var content: some View {
    switch model.phase {
    case .loading where model.edition == nil:
      ProgressView().frame(maxWidth: .infinity).padding(Spacing.xxl)
    case .missing:
      ArchiveNote(text: lang == .vi ? "Chưa có số báo cho tuần này." : "There is no edition for this week yet.", systemImage: "calendar")
    case .failed:
      ArchiveNote(text: lang == .vi ? "Không tải được. Kiểm tra kết nối rồi kéo để thử lại." : "Couldn't load. Check your connection and pull to retry.", systemImage: "wifi.slash")
    default:
      if let edition = model.edition {
        if let intro = edition.intro(in: lang) {
          Text(intro)
            .font(.inter(16, relativeTo: .body))
            .lineSpacing(4)
            .foregroundStyle(Palette.body)
            .padding(.top, Spacing.lg)
        }
        if stories.isEmpty {
          ArchiveNote(text: lang == .vi ? "Chưa có bản tiếng Việt cho tuần này." : "No English edition for this week yet.")
        } else {
          LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(stories) { story in
              WeekStoryRow(story: story, model: model, lang: lang)
            }
          }
          .padding(.top, Spacing.md)
        }
      }
    }
  }
}

private struct WeekStoryRow: View {
  let story: ArchiveWeekStory
  let model: ArchiveWeekModel
  let lang: Lang

  var body: some View {
    NavigationLink(value: Route.story(id: story.itemId)) {
      VStack(alignment: .leading, spacing: 10) {
        if story.rank == 1, story.imageUrl != nil {
          Color.clear
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay { ArchiveThumb(url: URL(string: story.imageUrl ?? ""), width: nil, height: nil, radius: 0) }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityHidden(true)
        }
        HStack(alignment: .top, spacing: Spacing.md) {
          VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
              Text(String(format: "%02d", story.rank))
                .font(.mono(12, weight: .semibold))
                .foregroundStyle(Palette.accent)
              ArchiveEyebrow(category: story.category, host: story.source, lang: lang)
            }
            ArchiveHeadline(text: story.title(in: lang) ?? "", size: story.rank == 1 ? 22 : 17, weight: .semibold)
              .multilineTextAlignment(.leading)
            if let text = story.text(in: lang) {
              Text(text)
                .font(.inter(15, relativeTo: .body))
                .lineSpacing(3)
                .foregroundStyle(Palette.body)
                .multilineTextAlignment(.leading)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          if story.rank != 1, story.imageUrl != nil {
            ArchiveThumb(url: model.thumb(story), width: 72, height: 72, radius: 10)
          }
        }
      }
      .padding(.vertical, 16)
      .contentShape(Rectangle())
      .overlay(alignment: .bottom) { ArchiveHairline() }
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .ignore)
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel(
      [story.title(in: lang), story.category.map { Topic.label($0, lang: lang) }, story.source].compactMap { $0 }.joined(separator: ", ")
    )
    .accessibilityIdentifier("week-story-\(story.rank)")
  }
}
