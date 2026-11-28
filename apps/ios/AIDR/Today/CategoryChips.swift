import AIDRKit
import SwiftUI

/// "All" plus one chip per category, with a colored dot and the count. The
/// selected chip inverts, as on the web.
struct CategoryChips: View {
  let chips: [TodayChip]
  let total: Int
  @Binding var selected: String?
  let lang: Lang

  var body: some View {
    ChipRow(trigger: selected) {
      Chip(
        label: lang == .vi ? "Tất cả" : "All", count: total, dot: nil,
        isOn: selected == nil
      ) { selected = nil }
      .accessibilityIdentifier("chip-all")
      ForEach(chips) { chip in
        let isOn = TodayStories.sameCategory(selected, chip.name)
        Chip(
          label: chip.name, count: chip.count,
          dot: Palette.topic(Topic.color(forCategory: chip.name)), isOn: isOn
        ) { selected = isOn ? nil : chip.name }
        .accessibilityIdentifier("chip-\(chip.name)")
      }
    }
  }
}

/// Trending tags that match today's stories; one filters the lists.
struct TagChips: View {
  let chips: [TodayChip]
  @Binding var selected: String?
  let lang: Lang

  var body: some View {
    ChipRow(trigger: selected) {
      Text(lang == .vi ? "XU HƯỚNG" : "TRENDING")
        .font(.mono(10.5, weight: .semibold))
        .tracking(1)
        .foregroundStyle(Palette.mutedForeground)
        .padding(.trailing, Spacing.xs)
      ForEach(chips) { chip in
        let isOn = selected == chip.name
        Chip(
          label: "#" + chip.name, count: chip.count,
          dot: Palette.topic(Topic.color(forTag: chip.name)), isOn: isOn
        ) { selected = isOn ? nil : chip.name }
        .accessibilityIdentifier("tag-\(chip.name)")
      }
    }
  }
}

/// A horizontally scrolling row that fades out at whichever edge has more
/// chips behind it.
private struct ChipRow<Content: View>: View {
  let trigger: String?
  @ViewBuilder let content: Content

  @State private var fadeLeading = false
  @State private var fadeTrailing = true

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: Spacing.sm) { content }
        .padding(.horizontal, Spacing.lg)
    }
    .scrollIndicators(.hidden)
    .onScrollGeometryChange(for: Bool.self, of: { $0.contentOffset.x > 4 }) { _, value in
      fadeLeading = value
    }
    .onScrollGeometryChange(
      for: Bool.self, of: { $0.contentSize.width - $0.containerSize.width - $0.contentOffset.x > 4 }
    ) { _, value in
      fadeTrailing = value
    }
    .mask(
      LinearGradient(
        stops: [
          .init(color: fadeLeading ? .clear : .black, location: 0),
          .init(color: .black, location: 0.06),
          .init(color: .black, location: 0.94),
          .init(color: fadeTrailing ? .clear : .black, location: 1),
        ],
        startPoint: .leading, endPoint: .trailing)
    )
    .sensoryFeedback(.selection, trigger: trigger)
  }
}

private struct Chip: View {
  let label: String
  let count: Int
  let dot: Color?
  let isOn: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let dot {
          Circle().fill(dot).frame(width: 6, height: 6)
        }
        Text(label)
          .font(.inter(13, .medium, relativeTo: .footnote))
        Text(count, format: .number)
          .font(.inter(13, .regular, relativeTo: .footnote))
          .monospacedDigit()
          .foregroundStyle(isOn ? Palette.primaryForeground.opacity(0.7) : Palette.quietForeground)
      }
      .foregroundStyle(isOn ? Palette.primaryForeground : Palette.foreground)
      .padding(.horizontal, Spacing.md)
      .frame(minHeight: 34)
      .background(isOn ? Palette.primary : Palette.muted, in: Capsule())
      // 34pt pill, 44pt target.
      .padding(.vertical, 5)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isOn ? .isSelected : [])
  }
}
