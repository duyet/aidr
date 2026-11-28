import AIDRKit
import SwiftUI

/// The AI;DR tab: today's digest as a swipeable brief.
struct BriefTab: View {
  let lang: Lang
  @State private var store: BriefStore
  @Environment(\.scenePhase) private var scenePhase

  init(lang: Lang) {
    self.lang = lang
    _store = State(initialValue: BriefStore(lang: lang))
  }

  var body: some View {
    NavigationStack {
      content
        .background(Palette.background)
        .toolbar(.hidden, for: .navigationBar)
        .routeDestinations(lang: lang)
    }
    .task { await store.refresh() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await store.refresh() } }
    }
  }

  @ViewBuilder private var content: some View {
    let deck = store.deck
    if !deck.isEmpty {
      BriefPager(
        deck: deck, lang: lang, offline: store.refreshFailed, streak: store.streak,
        onFinished: { store.finish() })
    } else if store.feed != nil {
      ContentUnavailableView(
        lang == .vi ? "Chưa có AI;DR tiếng Việt cho hôm nay." : "No AI;DR for today yet.",
        systemImage: "text.line.first.and.arrowtriangle.forward")
    } else if store.refreshFailed {
      ContentUnavailableView {
        Label(lang == .vi ? "Không tải được" : "Couldn't load", systemImage: "wifi.slash")
      } description: {
        Text(lang == .vi ? "Kiểm tra kết nối rồi thử lại." : "Check your connection and try again.")
      } actions: {
        Button(lang == .vi ? "Thử lại" : "Try again") { Task { await store.refresh() } }
          .buttonStyle(.glassProminent)
      }
    } else {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}
