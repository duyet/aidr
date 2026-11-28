import AIDRKit
import SwiftUI

/// The weekly editions, newest first. The week still in progress leads.
struct WeeksTab: View {
  let lang: Lang
  @State private var model: ArchiveWeeksModel
  @Environment(\.scenePhase) private var scenePhase

  init(lang: Lang) {
    self.lang = lang
    _model = State(initialValue: ArchiveWeeksModel(lang: lang))
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(lang == .vi ? "AI;DR Tuần Này" : "AI;DR Weekly")
              .font(.headline(28, .semibold, relativeTo: .title))
              .tracking(-0.6)
              .foregroundStyle(Palette.foreground)
              .accessibilityAddTraits(.isHeader)
            Text(
              lang == .vi
                ? "Mỗi tuần, những tin AI đáng đọc nhất từ bản tin hằng ngày của AI;DR."
                : "Every week, the AI stories that mattered most, picked from the AI;DR daily editions."
            )
            .font(.inter(14, relativeTo: .subheadline))
            .foregroundStyle(Palette.mutedForeground)
            ArchiveFreshness(updatedAt: model.updatedAt, offline: model.refreshFailed && !model.editions.isEmpty, lang: lang)
          }
          .padding(.top, Spacing.md)
          .padding(.bottom, Spacing.lg)
          if model.weeks.isEmpty {
            ArchiveNote(text: lang == .vi ? "Số đầu tiên sẽ ra sau khi tuần này kết thúc." : "The first issue comes out once this week closes.")
          } else {
            LazyVStack(spacing: 0) {
              ForEach(model.weeks, id: \.self) { week in
                WeekRow(week: week, model: model, lang: lang)
              }
            }
          }
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.xxl)
      }
      .background(Palette.background)
      .toolbar(.hidden, for: .navigationBar)
      .refreshable { await model.refresh() }
      .routeDestinations(lang: lang)
    }
    .accessibilityIdentifier("weeks-list")
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await model.refresh() } }
    }
  }
}

private struct WeekRow: View {
  let week: String
  let model: ArchiveWeeksModel
  let lang: Lang

  private var isOpen: Bool { week == ArchiveCalendar.openWeek(today: model.today) }

  var body: some View {
    let edition = model.editions[week]
    let lead = edition?.lead(in: lang)
    let range = ArchiveCalendar.weekRange(week, lang: lang) ?? week
    NavigationLink(value: Route.week(id: week)) {
      HStack(alignment: .top, spacing: Spacing.md) {
        VStack(alignment: .leading, spacing: 6) {
          eyebrow(range)
          if let lead, let title = lead.title(in: lang) {
            ArchiveHeadline(text: title, size: 17, weight: .semibold)
              .lineLimit(3)
              .multilineTextAlignment(.leading)
          } else if edition != nil {
            Text(lang == .vi ? "Chưa có bản tiếng Việt." : "No English edition yet.")
              .font(.inter(14, relativeTo: .subheadline))
              .foregroundStyle(Palette.mutedForeground)
          } else {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(Palette.muted)
              .frame(height: 16)
              .padding(.trailing, Spacing.xl)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if let lead, lead.imageUrl != nil {
          ArchiveThumb(url: model.thumb(lead), width: 72, height: 72, radius: 10)
        }
      }
      .padding(.vertical, 14)
      .contentShape(Rectangle())
      .overlay(alignment: .bottom) { ArchiveHairline() }
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .ignore)
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel(
      [ArchiveCalendar.issue(week).map { ArchiveCalendar.issueLabel($0, lang: lang) }, range, lead?.title(in: lang)].compactMap { $0 }.joined(separator: ", ")
    )
    .accessibilityIdentifier("weeks-row-\(week)")
    .task { await model.ensure(week) }
  }

  @ViewBuilder
  private func eyebrow(_ range: String) -> some View {
    HStack(spacing: 6) {
      if isOpen {
        Circle().fill(Palette.signal).frame(width: 6, height: 6)
        Text((lang == .vi ? "Đang diễn ra" : "In progress").uppercased())
          .foregroundStyle(Palette.foreground)
          .fontWeight(.bold)
      } else if let issue = ArchiveCalendar.issue(week) {
        Text(ArchiveCalendar.issueLabel(issue, lang: lang).uppercased())
          .foregroundStyle(Palette.accent)
          .fontWeight(.bold)
      }
      Text("·")
      Text(range.uppercased())
    }
    .font(.mono(11, weight: .medium))
    .tracking(0.8)
    .foregroundStyle(Palette.mutedForeground)
    .lineLimit(1)
    .minimumScaleFactor(0.8)
  }
}
