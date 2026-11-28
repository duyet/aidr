import AIDRKit
import SwiftUI

/// Topic chips: a colored dot, the localized name and the story count.
struct CategoryChips: View {
  let categories: [CategoryCount]
  let lang: Lang

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: Spacing.sm) {
        ForEach(categories) { category in
          HStack(spacing: 6) {
            Circle()
              .fill(Topic.color(forCategory: category.name).color)
              .frame(width: 6, height: 6)
            Text(Topic.label(category.name, lang: lang))
              .font(.inter(13, .medium, relativeTo: .footnote))
              .foregroundStyle(Palette.foreground)
            Text(category.count, format: .number)
              .font(.inter(13, .regular, relativeTo: .footnote))
              .monospacedDigit()
              .foregroundStyle(Palette.quietForeground)
          }
          .padding(.horizontal, Spacing.md)
          .frame(minHeight: 32)
          .background(Palette.muted, in: Capsule())
          .accessibilityElement(children: .combine)
        }
      }
      .padding(.horizontal, Spacing.lg)
    }
    .scrollIndicators(.hidden)
  }
}
