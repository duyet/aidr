import AIDRKit
import SwiftUI

/// The day block ("28 • AI;DR / THỨ BẢY · THÁNG 11 2026"), the view and count
/// switches, and the numbered digest rows.
struct DigestSection: View {
  let store: TodayStore
  let feed: Feed
  let lang: Lang
  /// The chips the reader picked: only digest rows about them show.
  let category: String?
  let tag: String?

  @Environment(ReaderPrefsStore.self) private var prefsStore

  var body: some View {
    let prefs = prefsStore.prefs
    // "Show more" steps through TodayDigest.steps; until then the reader's count.
    let limit = store.digestLimit ?? prefs.digestCount
    let all = TodayDigest.rows(feed, lang: lang, category: category, tag: tag)
    let rows = Array(all.prefix(limit))
    VStack(alignment: .leading, spacing: 0) {
      if let tldr = feed.tldr, let parts = EditionDate.parts(tldr.date, lang: lang) {
        DayBlock(day: parts.day, line: parts.line)
          .padding(.horizontal, Spacing.lg)
          .padding(.bottom, Spacing.sm)
      }
      if TodayDigest.rows(feed, lang: lang, category: nil).isEmpty {
        Text(lang == .vi ? "Chưa có AI;DR tiếng Việt cho hôm nay." : "No AI;DR for today yet.")
          .font(.inter(14, relativeTo: .body))
          .foregroundStyle(Palette.mutedForeground)
          .padding(Spacing.lg)
      } else {
        DigestControls(store: store, lang: lang)
          .padding(.horizontal, Spacing.lg)
          .padding(.bottom, Spacing.xs)
        ForEach(rows) { row in
          DigestLink(row: row, learned: feed.learnedKeywords, view: prefs.digestView)
            .padding(.horizontal, Spacing.lg)
        }
        if all.count > limit {
          Button {
            withAnimation(.snappy) { store.digestLimit = TodayDigest.next(after: limit) }
          } label: {
            Label(lang == .vi ? "Xem thêm" : "Show more", systemImage: "chevron.down")
              .labelStyle(TrailingIconLabelStyle())
              .font(.inter(13.5, .medium, relativeTo: .footnote))
              .foregroundStyle(Palette.accent)
              .frame(minHeight: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .padding(.horizontal, Spacing.lg)
          .accessibilityIdentifier("digest-more")
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("today-digest")
  }
}

private struct TrailingIconLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 4) {
      configuration.title
      configuration.icon.font(.system(size: 11, weight: .semibold))
    }
  }
}

private struct DayBlock: View {
  let day: String
  let line: String

  var body: some View {
    HStack(alignment: .center, spacing: Spacing.md) {
      Text(day)
        .font(.headline(44, .semibold, relativeTo: .largeTitle))
        .tracking(-1.2)
        .monospacedDigit()
        .foregroundStyle(Palette.foreground)
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Circle().fill(Palette.signal).frame(width: 6, height: 6)
          Text("AI;DR")
            .font(.mono(11, weight: .semibold))
            .tracking(1.1)
            .foregroundStyle(Palette.accent)
        }
        Text(line)
          .font(.mono(11))
          .tracking(1.1)
          .foregroundStyle(Palette.mutedForeground)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("day-block")
  }
}

/// The web's digest switches: images, 2 rows or 3 rows; 8, 12 or 16 items.
/// Both write the reader's preferences.
private struct DigestControls: View {
  let store: TodayStore
  let lang: Lang

  @Environment(ReaderPrefsStore.self) private var prefsStore

  var body: some View {
    HStack(spacing: Spacing.md) {
      SegmentedPills(
        options: [
          PillOption(value: ReaderDigestView.image, symbol: "photo", label: lang == .vi ? "Có ảnh" : "With images", id: "digest-view-image"),
          PillOption(value: .rows2, symbol: "equal", label: lang == .vi ? "2 dòng" : "2 lines", id: "digest-view-rows2"),
          PillOption(value: .rows3, symbol: "line.3.horizontal", label: lang == .vi ? "3 dòng" : "3 lines", id: "digest-view-rows3"),
        ],
        selection: Binding(
          get: { prefsStore.prefs.digestView },
          set: { value in
            guard value != prefsStore.prefs.digestView else { return }
            store.scrollToDigest = true
            prefsStore.prefs.digestView = value
          }))
      SegmentedPills(
        options: ReaderPrefs.digestCounts.map {
          PillOption(value: $0, text: String($0), label: String($0), id: "digest-count-\($0)")
        },
        selection: Binding(
          get: { store.digestLimit ?? prefsStore.prefs.digestCount },
          set: { value in
            guard value != (store.digestLimit ?? prefsStore.prefs.digestCount) else { return }
            store.digestLimit = value
            if value != prefsStore.prefs.digestCount {
              store.scrollToDigest = true
              prefsStore.prefs.digestCount = value
            }
          }))
      Spacer(minLength: 0)
    }
  }
}

struct PillOption<Value: Hashable>: Identifiable {
  let value: Value
  var symbol: String?
  var text: String?
  let label: String
  let id: String

  init(value: Value, symbol: String? = nil, text: String? = nil, label: String, id: String) {
    self.value = value
    self.symbol = symbol
    self.text = text
    self.label = label
    self.id = id
  }
}

/// A small capsule with one selectable pill per option.
struct SegmentedPills<Value: Hashable>: View {
  let options: [PillOption<Value>]
  @Binding var selection: Value

  var body: some View {
    HStack(spacing: 2) {
      ForEach(options) { option in
        let isOn = option.value == selection
        Button {
          selection = option.value
        } label: {
          Group {
            if let symbol = option.symbol {
              Image(systemName: symbol).font(.system(size: 13, weight: .medium))
            } else if let text = option.text {
              Text(text).font(.inter(13, .medium, relativeTo: .footnote)).monospacedDigit()
            }
          }
          .foregroundStyle(isOn ? Palette.primaryForeground : Palette.mutedForeground)
          .frame(minWidth: 36, minHeight: 30)
          .background(isOn ? Palette.primary : Color.clear, in: Capsule())
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(option.label)
        .accessibilityIdentifier(option.id)
        .accessibilityAddTraits(isOn ? .isSelected : [])
      }
    }
    .padding(2)
    .background(Palette.muted, in: Capsule())
    .sensoryFeedback(.selection, trigger: selection)
  }
}

/// A digest row that opens the first story it cites.
private struct DigestLink: View {
  let row: DigestRow
  let learned: [String]
  let view: ReaderDigestView

  var body: some View {
    Group {
      if let id = row.itemId {
        NavigationLink(value: Route.story(id: id)) {
          DigestRowView(row: row, learned: learned, view: view)
        }
        .buttonStyle(.plain)
      } else {
        DigestRowView(row: row, learned: learned, view: view)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("digest-row-\(row.rank)")
  }
}

struct DigestRowView: View {
  let row: DigestRow
  let learned: [String]
  let view: ReaderDigestView

  var body: some View {
    HStack(alignment: .top, spacing: Spacing.md) {
      Text(String(format: "%02d", row.rank))
        .font(.mono(12, weight: .medium))
        .foregroundStyle(Palette.mutedForeground)
        .padding(.top, 2)
      Text(attributed)
        .lineSpacing(2)
        .lineLimit(view == .rows2 ? 2 : 3)
        .frame(maxWidth: .infinity, alignment: .leading)
      if view == .image {
        Thumbnail(url: row.thumbnail)
      }
    }
    .padding(.vertical, 13)
    .overlay(alignment: .bottom) { Rectangle().fill(Palette.border).frame(height: 0.5) }
    .contentShape(Rectangle())
  }

  private var attributed: AttributedString {
    var out = AttributedString()
    if let topic = row.topic {
      var dot = AttributedString("● ")
      dot.swiftUI.font = .system(size: 8)
      dot.swiftUI.foregroundColor = row.topicColor.map(Palette.topic) ?? Palette.mutedForeground
      dot.swiftUI.baselineOffset = 1.5
      var label = AttributedString(topic.uppercased() + "  ")
      label.swiftUI.font = .mono(11, weight: .medium)
      label.swiftUI.foregroundColor = Palette.mutedForeground
      label.swiftUI.kern = 0.8
      out += dot + label
    }
    for segment in Highlight.keywords(row.text, tags: row.tags, learned: learned) {
      var piece = AttributedString(segment.text)
      switch segment.kind {
      case .num:
        piece.swiftUI.font = .inter(15, .semibold)
        piece.swiftUI.foregroundColor = Palette.keywordNumber
      case .entity:
        piece.swiftUI.font = .inter(15, .semibold)
        piece.swiftUI.foregroundColor = Palette.keywordEntity
      case nil:
        piece.swiftUI.font = .inter(15)
        piece.swiftUI.foregroundColor = Palette.foreground
      }
      out += piece
    }
    if row.extraCount > 0 {
      var more = AttributedString("  +\(row.extraCount)")
      more.swiftUI.font = .mono(11)
      more.swiftUI.foregroundColor = Palette.mutedForeground
      out += more
    }
    return out
  }
}

struct Thumbnail: View {
  let url: URL?
  var size: CGFloat = 56

  var body: some View {
    AsyncImage(url: url) { phase in
      if let image = phase.image {
        image.resizable().scaledToFill()
      } else {
        Palette.muted
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    .accessibilityHidden(true)
  }
}
