import AIDRKit
import SwiftUI

/// Wraps RootView with what every screen shares: the reader's language and text
/// size, the refresh on open and return, and the story a notification opens.
struct RootHost: View {
  @Environment(\.scenePhase) private var scenePhase
  @AppStorage(SettingsKey.language) private var languagePref = LanguageChoice.system.rawValue
  @State private var inbox = NotifyInbox.shared
  @State private var showSettings = SettingsHooks.showSettings

  var body: some View {
    // Reading the choice here rebuilds RootView when it changes, and RootView
    // reads Lang.preferred() once per build. A sheet in a tab keeps its state.
    let lang = Lang.preferred(stored: languagePref)
    RootView()
      .environment(\.locale, lang.locale)
      .modifier(TextSizeModifier())
      .preferredColorScheme(SettingsHooks.dark ? .dark : nil)
      .sheet(item: storyTarget) { target in
        StorySheet(id: target.id, lang: lang)
      }
      .sheet(isPresented: $showSettings) {
        SettingsScreen(lang: lang)
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
