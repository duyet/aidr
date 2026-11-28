import AIDRKit
import SwiftUI

/// Placeholder. The Story lane replaces it with the story page.
struct StoryScreen: View {
  let id: String
  let lang: Lang

  var body: some View {
    ComingSoon(title: lang == .vi ? "Tin" : "Story", systemImage: "doc.text", lang: lang)
  }
}
