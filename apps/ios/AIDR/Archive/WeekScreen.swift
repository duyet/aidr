import AIDRKit
import SwiftUI

/// Placeholder. The Archive lane replaces it with one weekly edition.
struct WeekScreen: View {
  let week: String
  let lang: Lang

  var body: some View {
    ComingSoon(title: week, systemImage: "calendar.day.timeline.left", lang: lang)
  }
}
