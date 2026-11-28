import AIDRKit
import SwiftUI

/// Placeholder. The Brief lane replaces it with the swipeable edition.
struct BriefTab: View {
  let lang: Lang

  var body: some View {
    NavigationStack {
      ComingSoon(title: "AI;DR", systemImage: "text.line.first.and.arrowtriangle.forward", lang: lang)
        .routeDestinations(lang: lang)
    }
  }
}
