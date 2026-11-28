import AIDRKit
import SwiftUI

/// The month heatmap, like aidr.today/calendar, with the month's days listed
/// under it. A day opens its day page, a week cell opens the weekly edition.
struct CalendarTab: View {
  let lang: Lang
  @State private var model: ArchiveMonthModel
  @State private var stories: ArchiveStories
  @Environment(\.scenePhase) private var scenePhase

  init(lang: Lang) {
    self.lang = lang
    let client = ArchiveClient.live()
    _model = State(initialValue: ArchiveMonthModel(lang: lang, client: client))
    _stories = State(initialValue: ArchiveStories(client: client))
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          MonthHeader(model: model, lang: lang)
          freshness
            .padding(.top, Spacing.xs)
          MonthGrid(model: model, lang: lang)
            .padding(.top, Spacing.md)
          MonthLegend(maxCount: model.maxCount, lang: lang)
            .padding(.top, Spacing.md)
          MonthAgenda(model: model, stories: stories, lang: lang)
            .padding(.top, Spacing.xl)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.xxl)
      }
      .background(Palette.background)
      .toolbar(.hidden, for: .navigationBar)
      .refreshable { await model.load() }
      .routeDestinations(lang: lang)
    }
    .task(id: model.month) { await model.load() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await model.load() } }
    }
  }

  @ViewBuilder private var freshness: some View {
    if model.failed && !model.isOffline {
      Text(lang == .vi ? "\(model.failedCount) ngày chưa tải được · kéo để thử lại" : "\(model.failedCount) days didn't load · pull to retry")
        .font(.mono(11))
        .foregroundStyle(Palette.mutedForeground)
        .accessibilityValue(model.lastError ?? "")
        .accessibilityIdentifier("archive-freshness")
    } else {
      ArchiveFreshness(updatedAt: model.updatedAt, offline: model.isOffline, lang: lang, detail: model.lastError)
    }
  }
}

private let cellHeight: CGFloat = 52
private let cellRadius: CGFloat = 12

private struct MonthHeader: View {
  let model: ArchiveMonthModel
  let lang: Lang

  var body: some View {
    HStack(spacing: Spacing.sm) {
      Text(ArchiveCalendar.monthTitle(model.month, lang: lang))
        .font(.headline(26, .semibold, relativeTo: .title))
        .tracking(-0.5)
        .foregroundStyle(Palette.foreground)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("calendar-month")
      Spacer(minLength: Spacing.sm)
      if model.isLoading { ProgressView().controlSize(.small) }
      Button {
        model.goToday()
      } label: {
        Text(lang == .vi ? "Hôm nay" : "Today").font(.inter(13, .semibold, relativeTo: .footnote))
      }
      .buttonStyle(.glass)
      .disabled(model.isCurrentMonth)
      .accessibilityIdentifier("calendar-today")
      Button {
        model.step(-1)
      } label: {
        Image(systemName: "chevron.left").font(.system(size: 14, weight: .semibold))
      }
      .buttonStyle(.glass)
      .buttonBorderShape(.circle)
      .disabled(!model.hasPrevious)
      .accessibilityLabel(lang == .vi ? "Tháng trước" : "Previous month")
      .accessibilityIdentifier("calendar-previous")
      Button {
        model.step(1)
      } label: {
        Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold))
      }
      .buttonStyle(.glass)
      .buttonBorderShape(.circle)
      .disabled(!model.hasNext)
      .accessibilityLabel(lang == .vi ? "Tháng sau" : "Next month")
      .accessibilityIdentifier("calendar-next")
    }
    .tint(Palette.foreground)
    .padding(.top, Spacing.md)
  }
}

private struct MonthGrid: View {
  let model: ArchiveMonthModel
  let lang: Lang
  private let gap: CGFloat = 4
  private let weekColumn: CGFloat = 46

  var body: some View {
    let rows = ArchiveCalendar.monthRows(model.month)
    let maxCount = model.maxCount
    VStack(spacing: gap) {
      HStack(spacing: gap) {
        Text(lang == .vi ? "Tuần" : "Wk").frame(width: weekColumn)
        ForEach(Array(ArchiveCalendar.weekdayInitials(lang: lang).enumerated()), id: \.offset) { _, initial in
          Text(initial).frame(maxWidth: .infinity)
        }
      }
      .font(.mono(11))
      .foregroundStyle(Palette.mutedForeground)
      .accessibilityHidden(true)
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        HStack(spacing: gap) {
          WeekCell(week: row.compactMap { $0 }.first.flatMap { ArchiveCalendar.isoWeek(ofDate: $0) }, today: model.today, lang: lang)
            .frame(width: weekColumn)
          ForEach(Array(row.enumerated()), id: \.offset) { _, date in
            DayCell(date: date, model: model, maxCount: maxCount, lang: lang)
              .frame(maxWidth: .infinity)
          }
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("calendar-grid")
  }
}

private struct WeekCell: View {
  let week: String?
  let today: String
  let lang: Lang

  var body: some View {
    if let week {
      if ArchiveCalendar.isLinkedWeek(week, today: today), let issue = ArchiveCalendar.issue(week) {
        NavigationLink(value: Route.week(id: week)) {
          VStack(spacing: 2) {
            Text(ArchiveCalendar.weekNumber(week))
              .font(.mono(11, weight: .semibold))
              .foregroundStyle(Palette.foreground)
            Text(ArchiveCalendar.issueLabel(issue, lang: lang))
              .font(.mono(9))
              .foregroundStyle(Palette.accent)
          }
          .frame(maxWidth: .infinity)
          .frame(height: cellHeight)
          .overlay(
            RoundedRectangle(cornerRadius: cellRadius, style: .continuous).strokeBorder(Palette.border, lineWidth: 1)
          )
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(
          lang == .vi
            ? "Bản tin tuần: \(ArchiveCalendar.issueLabel(issue, lang: lang)), \(ArchiveCalendar.weekRange(week, lang: lang) ?? week)"
            : "Weekly edition: \(ArchiveCalendar.issueLabel(issue, lang: lang)), \(ArchiveCalendar.weekRange(week, lang: lang) ?? week)"
        )
        .accessibilityIdentifier("calendar-week-\(week)")
      } else {
        Text(ArchiveCalendar.weekNumber(week))
          .font(.mono(11))
          .foregroundStyle(Palette.mutedForeground.opacity(0.6))
          .frame(maxWidth: .infinity)
          .frame(height: cellHeight)
          .overlay(dashed)
          .accessibilityHidden(true)
      }
    } else {
      Color.clear.frame(height: cellHeight)
    }
  }

  private var dashed: some View {
    RoundedRectangle(cornerRadius: cellRadius, style: .continuous)
      .strokeBorder(Palette.mutedForeground.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
  }
}

private struct DayCell: View {
  let date: String?
  let model: ArchiveMonthModel
  let maxCount: Int
  let lang: Lang

  var body: some View {
    if let date {
      cell(date)
    } else {
      Color.clear.frame(height: cellHeight)
    }
  }

  @ViewBuilder
  private func cell(_ date: String) -> some View {
    let number = Int(date.suffix(2)) ?? 0
    let isToday = date == model.today
    if let summary = model.summaries[date] {
      let level = ArchiveCalendar.heatLevel(count: summary.count, max: maxCount)
      NavigationLink(value: Route.day(date: date)) {
        face(number: number, foreground: ArchiveHeat.foreground(level), background: ArchiveHeat.background(level), isToday: isToday, dashed: false)
      }
      .buttonStyle(.plain)
      .accessibilityElement(children: .ignore)
      .accessibilityAddTraits(.isButton)
      .accessibilityLabel(label(date, summary))
      .accessibilityIdentifier("calendar-day-\(date)")
    } else {
      let waiting = model.isLoading && ArchiveCalendar.isArchiveDate(date, today: model.today)
      face(number: number, foreground: Palette.mutedForeground, background: waiting ? Palette.muted : Color.clear, isToday: isToday, dashed: !waiting)
        .accessibilityLabel(ArchiveCalendar.dayLong(date, lang: lang))
    }
  }

  private func label(_ date: String, _ summary: ArchiveDaySummary) -> String {
    var out = "\(ArchiveCalendar.dayLong(date, lang: lang)): \(ArchiveCalendar.storiesLabel(summary.count, lang: lang))"
    if let title = summary.leadTitle { out += ". \(title)" }
    return out
  }

  private func face(number: Int, foreground: Color, background: Color, isToday: Bool, dashed: Bool) -> some View {
    Text("\(number)")
      .font(.inter(14, .semibold, relativeTo: .callout))
      .monospacedDigit()
      .minimumScaleFactor(0.7)
      .foregroundStyle(foreground)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .padding(7)
      .overlay(alignment: .topTrailing) {
        if isToday { Circle().fill(foreground).frame(width: 5, height: 5).padding(7) }
      }
      .frame(height: cellHeight)
      .background(background, in: RoundedRectangle(cornerRadius: cellRadius, style: .continuous))
      .overlay {
        if dashed {
          RoundedRectangle(cornerRadius: cellRadius, style: .continuous)
            .strokeBorder(Palette.mutedForeground.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
        }
      }
      .overlay {
        if isToday {
          RoundedRectangle(cornerRadius: cellRadius, style: .continuous).strokeBorder(Palette.foreground, lineWidth: 2)
        }
      }
      .contentShape(Rectangle())
  }
}

private struct MonthLegend: View {
  let maxCount: Int
  let lang: Lang

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      HStack(spacing: 6) {
        Text(lang == .vi ? "Ít" : "Fewer")
        ForEach(0..<5, id: \.self) { level in
          RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(ArchiveHeat.background(level))
            .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).strokeBorder(Palette.border, lineWidth: 0.5))
            .frame(width: 12, height: 12)
        }
        Text(lang == .vi ? "Nhiều tin" : "More stories")
        if maxCount > 0 {
          Text(lang == .vi ? "(tối đa \(maxCount))" : "(up to \(maxCount))").font(.mono(11))
        }
      }
      HStack(spacing: Spacing.lg) {
        HStack(spacing: 6) {
          RoundedRectangle(cornerRadius: 3, style: .continuous)
            .strokeBorder(Palette.mutedForeground.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
            .frame(width: 12, height: 12)
          Text(lang == .vi ? "Chưa có số báo" : "No edition")
        }
        HStack(spacing: 6) {
          Circle().fill(Palette.foreground).frame(width: 6, height: 6)
          Text(lang == .vi ? "Hôm nay" : "Today")
        }
      }
    }
    .font(.inter(12, relativeTo: .caption))
    .foregroundStyle(Palette.mutedForeground)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("calendar-legend")
  }
}

private struct MonthAgenda: View {
  let model: ArchiveMonthModel
  let stories: ArchiveStories
  let lang: Lang

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ArchiveSectionLabel(lang == .vi ? "Tin theo ngày" : "Day by day")
        .padding(.bottom, Spacing.xs)
      if model.agenda.isEmpty {
        if model.isLoading {
          ProgressView().frame(maxWidth: .infinity).padding(Spacing.xl)
        } else {
          ArchiveNote(
            text: model.failed
              ? (lang == .vi ? "Không tải được. Kiểm tra kết nối rồi kéo để thử lại." : "Couldn't load. Check your connection and pull to retry.")
              : (lang == .vi ? "Tháng này chưa có tin nào." : "No stories this month yet."),
            systemImage: model.failed ? "wifi.slash" : nil)
        }
      } else {
        LazyVStack(spacing: 0) {
          ForEach(model.agenda) { summary in
            AgendaRow(summary: summary, stories: stories, lang: lang)
          }
        }
      }
    }
    .accessibilityIdentifier("calendar-agenda")
  }
}

private struct AgendaRow: View {
  let summary: ArchiveDaySummary
  let stories: ArchiveStories
  let lang: Lang

  var body: some View {
    let item = stories.item(summary.leadId)
    NavigationLink(value: Route.day(date: summary.date)) {
      HStack(alignment: .top, spacing: 14) {
        VStack(spacing: 2) {
          Text("\(Int(summary.date.suffix(2)) ?? 0)")
            .font(.headline(26, .medium, relativeTo: .title))
            .tracking(-0.5)
            .monospacedDigit()
            .foregroundStyle(Palette.foreground)
          Text(ArchiveCalendar.weekdayShort(summary.date, lang: lang).uppercased())
            .font(.mono(11))
            .tracking(1.1)
            .foregroundStyle(Palette.mutedForeground)
        }
        .frame(width: 44)
        VStack(alignment: .leading, spacing: 4) {
          if let title = summary.leadTitle {
            ArchiveHeadline(text: title, tags: item?.tags ?? [], size: 15, weight: .medium)
              .lineLimit(3)
              .multilineTextAlignment(.leading)
          } else {
            Text(lang == .vi ? "Xem các tin trong ngày" : "See the day's stories")
              .font(.inter(15, .medium, relativeTo: .body))
              .foregroundStyle(Palette.foreground)
          }
          Text(ArchiveCalendar.storiesLabel(summary.count, lang: lang))
            .font(.inter(13, relativeTo: .footnote))
            .foregroundStyle(Palette.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if summary.leadId != nil, item == nil || item?.imageUrl != nil {
          ArchiveThumb(url: stories.thumb(summary.leadId), width: 72, height: 54, radius: 10)
        }
      }
      .padding(.vertical, 12)
      .contentShape(Rectangle())
      .overlay(alignment: .bottom) { ArchiveHairline() }
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("agenda-row-\(summary.date)")
    .task(id: summary.leadId) {
      if let id = summary.leadId { await stories.ensure([id]) }
    }
  }
}
