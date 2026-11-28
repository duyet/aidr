import AIDRKit
import SwiftUI

/// Placeholder. The Archive lane replaces it with one day of AI;DR.
struct DayScreen: View {
  let date: String
  let lang: Lang

  var body: some View {
    ComingSoon(title: date, systemImage: "calendar", lang: lang)
  }
}
