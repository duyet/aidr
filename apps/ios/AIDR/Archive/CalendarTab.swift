import AIDRKit
import SwiftUI

/// Placeholder. The Archive lane replaces it with the month heatmap.
struct CalendarTab: View {
  let lang: Lang

  var body: some View {
    NavigationStack {
      ComingSoon(title: lang == .vi ? "Lịch" : "Calendar", systemImage: "calendar", lang: lang)
        .routeDestinations(lang: lang)
    }
  }
}
