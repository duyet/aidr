import AIDRKit
import SwiftUI

/// Wraps RootView with the work that outlives a screen: the refresh on open and
/// return, and the story a tapped notification opens.
struct RootHost: View {
  @Environment(\.scenePhase) private var scenePhase
  @State private var prefsStore = ReaderPrefsStore.shared
  @State private var inbox = NotifyInbox.shared
  @State private var showSettings = SettingsHooks.showSettings

  var body: some View {
    let prefs = prefsStore.prefs
    let lang = prefs.language.resolve()
    RootView()
      // The sheets below hang outside RootView, so they take the look from here.
      .preferredColorScheme(prefs.appearance.colorScheme)
      .dynamicTypeSize(prefs.textSize.dynamicTypeRange)
      .sheet(item: storyTarget) { target in
        StorySheet(id: target.id, lang: lang)
          .background(Palette.background)
      }
      .sheet(isPresented: $showSettings) {
        SettingsScreen(lang: lang)
          .environment(prefsStore)
      }
      .task { await BackgroundRefresh.foreground() }
      .onChange(of: scenePhase) { _, phase in
        switch phase {
        case .active: Task { await BackgroundRefresh.foreground() }
        case .background: BackgroundRefresh.schedule()
        default: break
        }
      }
  }

  private var storyTarget: Binding<StoryTarget?> {
    Binding(
      get: { inbox.storyID.map(StoryTarget.init(id:)) },
      set: { if $0 == nil { inbox.storyID = nil } })
  }
}

private struct StoryTarget: Identifiable {
  let id: String
}

/// A tapped notification opens its story over whatever tab is showing.
private struct StorySheet: View {
  let id: String
  let lang: Lang
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      StoryScreen(id: id, lang: lang)
        .routeDestinations(lang: lang)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(lang == .vi ? "Đóng" : "Close") { dismiss() }
          }
        }
    }
  }
}
