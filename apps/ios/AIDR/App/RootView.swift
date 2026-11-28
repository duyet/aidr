import AIDRKit
import SwiftUI

/// The tab root. Later lanes replace the placeholders with their screens.
struct RootView: View {
  @State private var today = TodayStore()
  private let lang = Lang.preferred()

  var body: some View {
    TabView {
      Tab(lang == .vi ? "Hôm nay" : "Today", systemImage: "newspaper") {
        TodayView(store: today, lang: lang)
      }
      Tab(lang == .vi ? "Tuần" : "Weeks", systemImage: "calendar.day.timeline.left") {
        PlaceholderView(title: lang == .vi ? "Tuần" : "Weeks", systemImage: "calendar.day.timeline.left", lang: lang)
      }
      Tab(lang == .vi ? "Lịch" : "Calendar", systemImage: "calendar") {
        PlaceholderView(title: lang == .vi ? "Lịch" : "Calendar", systemImage: "calendar", lang: lang)
      }
      Tab("AI;DR", systemImage: "text.line.first.and.arrowtriangle.forward") {
        PlaceholderView(title: "AI;DR", systemImage: "text.line.first.and.arrowtriangle.forward", lang: lang)
      }
    }
    .tabBarMinimizeBehavior(.onScrollDown)
    .tint(Palette.foreground)
  }
}

private struct PlaceholderView: View {
  let title: String
  let systemImage: String
  let lang: Lang

  var body: some View {
    ContentUnavailableView(
      title, systemImage: systemImage,
      description: Text(lang == .vi ? "Sắp có." : "Coming soon."))
  }
}
