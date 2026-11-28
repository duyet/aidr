import AIDRKit
import SwiftUI

/// Stand-in for a screen that has not landed yet.
struct ComingSoon: View {
  let title: String
  let systemImage: String
  let lang: Lang

  var body: some View {
    ContentUnavailableView(
      title, systemImage: systemImage,
      description: Text(lang == .vi ? "Sắp có." : "Coming soon."))
  }
}
