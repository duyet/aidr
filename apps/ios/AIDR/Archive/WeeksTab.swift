import AIDRKit
import SwiftUI

/// Placeholder. The Archive lane replaces it with the weekly editions list.
struct WeeksTab: View {
  let lang: Lang

  var body: some View {
    NavigationStack {
      ComingSoon(title: lang == .vi ? "Tuần" : "Weeks", systemImage: "calendar.day.timeline.left", lang: lang)
        .routeDestinations(lang: lang)
    }
  }
}
