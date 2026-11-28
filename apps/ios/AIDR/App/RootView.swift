import AIDRKit
import SwiftUI

/// The tab root. Each tab view owns its NavigationStack; feature folders own
/// the tab views, so lanes never edit this file.
struct RootView: View {
  @State private var today = TodayStore()
  private let lang = Lang.preferred()

  var body: some View {
    TabView {
      Tab(lang == .vi ? "Hôm nay" : "Today", systemImage: "newspaper") {
        TodayView(store: today, lang: lang)
      }
      Tab(lang == .vi ? "Tuần" : "Weeks", systemImage: "calendar.day.timeline.left") {
        WeeksTab(lang: lang)
      }
      Tab(lang == .vi ? "Lịch" : "Calendar", systemImage: "calendar") {
        CalendarTab(lang: lang)
      }
      Tab("AI;DR", systemImage: "text.line.first.and.arrowtriangle.forward") {
        BriefTab(lang: lang)
      }
    }
    .tabBarMinimizeBehavior(.onScrollDown)
    .tint(Palette.foreground)
  }
}
