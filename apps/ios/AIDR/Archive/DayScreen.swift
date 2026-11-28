import AIDRKit
import SwiftUI

/// One day of AI;DR: the digest and the ranked stories, with in-place previous
/// and next day so Back still returns to the calendar.
struct DayScreen: View {
  let date: String
  let lang: Lang
  @State private var model: ArchiveDayModel

  init(date: String, lang: Lang) {
    self.date = date
    self.lang = lang
    _model = State(initialValue: ArchiveDayModel(date: date, lang: lang))
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        ArchiveDayBlock(date: model.date, lang: lang, count: model.day?.total)
          .padding(.top, Spacing.sm)
        ArchiveStepper(
          previousTitle: lang == .vi ? "Ngày trước" : "Previous day",
          nextTitle: lang == .vi ? "Ngày sau" : "Next day",
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
    .id(model.date)
    .background(Palette.background)
    .navigationTitle(ArchiveCalendar.dayLong(model.date, lang: lang))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        if let url = URL(string: "https://aidr.today/date/\(model.date)?lang=\(lang.rawValue)") {
          ShareLink(item: url)
        }
      }
    }
    .task(id: model.date) { await model.load() }
    .refreshable { await model.load() }
    .accessibilityIdentifier("day-screen")
  }

  @ViewBuilder private var content: some View {
    switch model.phase {
    case .empty:
      ArchiveNote(text: lang == .vi ? "Chưa có số báo cho ngày này." : "There is no edition for this day.", systemImage: "calendar")
    case .failed:
      ArchiveNote(text: lang == .vi ? "Không tải được. Kiểm tra kết nối rồi kéo để thử lại." : "Couldn't load. Check your connection and pull to retry.", systemImage: "wifi.slash")
    default:
      if let day = model.day {
        DayDigest(day: day, stories: model.stories, lang: lang)
        DayRanked(day: day, stories: model.stories, lang: lang)
      } else {
        ProgressView().frame(maxWidth: .infinity).padding(Spacing.xxl)
      }
    }
  }
}

private struct DayDigest: View {
  let day: ArchiveDay
  let stories: ArchiveStories
  let lang: Lang

  var body: some View {
    if !day.digest.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        ArchiveSectionLabel("AI;DR").padding(.top, Spacing.xl).padding(.bottom, Spacing.xs)
        ForEach(day.digest) { bullet in
          DigestBulletRow(bullet: bullet, stories: stories, lang: lang)
        }
      }
      .accessibilityIdentifier("day-digest")
    }
  }
}

private struct DigestBulletRow: View {
  let bullet: ArchiveDigestBullet
  let stories: ArchiveStories
  let lang: Lang

  var body: some View {
    let item = stories.item(bullet.storyId)
    let topic = item.flatMap { $0.tags.first ?? $0.category }
    let color: TopicColor? = topic.map { name in
      item?.tags.isEmpty == false ? Topic.color(forTag: name) : Topic.color(forCategory: name)
    }
    if let id = bullet.storyId {
      NavigationLink(value: Route.story(id: id)) { row(item, topic, color) }
        .buttonStyle(.plain)
        .accessibilityIdentifier("day-digest-\(bullet.rank)")
    } else {
      row(item, topic, color)
        .accessibilityIdentifier("day-digest-\(bullet.rank)")
    }
  }

  private func row(_ item: Item?, _ topic: String?, _ color: TopicColor?) -> some View {
    HStack(alignment: .top, spacing: Spacing.md) {
      Text(String(format: "%02d", bullet.rank))
        .font(.mono(12, weight: .medium))
        .foregroundStyle(Palette.mutedForeground)
        .padding(.top, 2)
      ArchiveHeadline(
        text: bullet.text, tags: item?.tags ?? [], size: 15, weight: .regular,
        topic: topic.map { Topic.label($0, lang: lang) }, topicColor: color
      )
      .multilineTextAlignment(.leading)
      .frame(maxWidth: .infinity, alignment: .leading)
      if let item, item.imageUrl != nil {
        ArchiveThumb(url: stories.thumb(bullet.storyId), width: 56, height: 56)
      }
    }
    .padding(.vertical, 13)
    .contentShape(Rectangle())
    .overlay(alignment: .bottom) { ArchiveHairline() }
    .accessibilityElement(children: .combine)
  }
}

private struct DayRanked: View {
  let day: ArchiveDay
  let stories: ArchiveStories
  let lang: Lang
  @Environment(ReaderPrefsStore.self) private var prefsStore

  var body: some View {
    if !day.stories.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        ArchiveSectionLabel(lang == .vi ? "Tin xếp hạng" : "Ranked stories")
          .padding(.top, Spacing.xl)
          .padding(.bottom, Spacing.xs)
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(day.stories) { story in
            RankedRow(
              story: story, item: stories.item(story.storyId), lang: lang,
              thumbs: prefsStore.prefs.thumbnails, summaries: prefsStore.prefs.summaries, stories: stories)
          }
        }
        if day.moreCount > 0, let url = URL(string: "https://aidr.today/date/\(day.date)?lang=\(lang.rawValue)") {
          Link(destination: url) {
            HStack(spacing: 6) {
              Text(
                lang == .vi
                  ? "Còn \(day.moreCount) tin khác trên aidr.today"
                  : "\(day.moreCount) more stories on aidr.today")
              Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .semibold))
            }
            .font(.inter(14, .medium, relativeTo: .subheadline))
            .foregroundStyle(Palette.accent)
            .padding(.vertical, Spacing.lg)
          }
          .accessibilityIdentifier("day-more")
        }
      }
      .accessibilityIdentifier("day-ranked")
    }
  }
}

private struct RankedRow: View {
  let story: ArchiveRankedStory
  let item: Item?
  let lang: Lang
  let thumbs: Bool
  let summaries: Bool
  let stories: ArchiveStories

  var body: some View {
    NavigationLink(value: Route.story(id: story.storyId)) {
      HStack(alignment: .top, spacing: Spacing.md) {
        Text(String(format: "%02d", story.rank))
          .font(.mono(12, weight: .medium))
          .foregroundStyle(Palette.mutedForeground)
          .frame(width: 22, alignment: .leading)
          .padding(.top, 3)
        VStack(alignment: .leading, spacing: 5) {
          ArchiveHeadline(text: story.title, tags: item?.tags ?? [], size: 16, weight: .semibold)
            .multilineTextAlignment(.leading)
          ArchiveEyebrow(category: story.category, host: story.host, lang: lang)
          if summaries, let summary = story.summary {
            Text(summary)
              .font(.inter(14, relativeTo: .subheadline))
              .foregroundStyle(Palette.body)
              .lineLimit(2)
              .multilineTextAlignment(.leading)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if thumbs, item?.imageUrl != nil {
          ArchiveThumb(url: stories.thumb(story.storyId), width: 56, height: 56)
        }
      }
      .padding(.vertical, 13)
      .contentShape(Rectangle())
      .overlay(alignment: .bottom) { ArchiveHairline() }
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("day-story-\(story.rank)")
    .task(id: story.storyId) {
      // The top of the list gets its tags and thumbnail while the reader looks.
      if story.rank <= 12 { await stories.ensure([story.storyId]) }
    }
  }
}
