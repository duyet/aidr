import AIDRKit
import SwiftUI

/// Placeholder. The Settings lane replaces it.
struct SettingsScreen: View {
  let lang: Lang

  var body: some View {
    ComingSoon(title: lang == .vi ? "Cài đặt" : "Settings", systemImage: "gearshape", lang: lang)
  }
}
