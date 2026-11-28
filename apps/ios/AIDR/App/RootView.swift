import AIDRKit
import SwiftUI

/// The tab root. Each tab view owns its NavigationStack; feature folders own
/// the tab views, so lanes never edit this file.
///
/// Reader preferences: Font and Palette read ReaderStyle, so the tab tree is
/// rebuilt (`.id`) whenever a preference changes. The settings sheet hangs
/// outside that tree and stays open while the reader tries options.
struct RootView: View {
  @State private var today = TodayStore()
  @State private var prefsStore = ReaderPrefsStore.shared
  @State private var app = AppState()

  private var prefs: ReaderPrefs { prefsStore.prefs }
  private var lang: Lang { prefs.language.resolve() }

  var body: some View {
    @Bindable var app = app
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
    .background(Palette.background)
    .id(prefs)
    .preferredColorScheme(prefs.appearance.colorScheme)
    .dynamicTypeSize(prefs.textSize.dynamicTypeRange)
    .environment(prefsStore)
    .environment(app)
    .sheet(isPresented: $app.showSettings) {
      SettingsScreen(lang: lang)
        .environment(prefsStore)
        .environment(app)
        .preferredColorScheme(prefs.appearance.colorScheme)
        .dynamicTypeSize(prefs.textSize.dynamicTypeRange)
    }
  }
}
