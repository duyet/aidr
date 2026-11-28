import AIDRKit
import SwiftUI

/// "All" plus one chip per category, with a colored dot and the count. The
/// selected chip inverts, as on the web. The row scrolls sideways and fades
/// out at whichever edge has more chips behind it.
struct CategoryChips: View {
  let chips: [TodayChip]
  let total: Int
  @Binding var selected: String?
  let lang: Lang

  @State private var fadeLeading = false
  @State private var fadeTrailing = true

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: Spacing.sm) {
        Chip(
          label: lang == .vi ? "Tất cả" : "All", count: total, dot: nil,
          isOn: selected == nil
        ) { selected = nil }
        .accessibilityIdentifier("chip-all")
        ForEach(chips) { chip in
          let isOn = Topic.canonical(selected) == Topic.canonical(chip.name)
          Chip(
            label: chip.name, count: chip.count, dot: Topic.color(forCategory: chip.name).color,
            isOn: isOn
          ) { selected = isOn ? nil : chip.name }
          .accessibilityIdentifier("chip-\(chip.name)")
        }
      }
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
    .sensoryFeedback(.selection, trigger: selected)
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
          .opacity(isOn ? 0.7 : 1)
          .foregroundStyle(isOn ? Palette.primaryForeground : Palette.quietForeground)
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
