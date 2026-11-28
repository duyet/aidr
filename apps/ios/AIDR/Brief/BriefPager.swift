import AIDRKit
import SwiftUI

/// Full-screen vertical paging over the deck, with a thin progress bar on top.
/// The scroll view runs under the status bar and the tab bar, so each page
/// pads itself with `insets`.
struct BriefPager: View {
  let deck: BriefDeck
  let lang: Lang
  let offline: Bool
  let streak: BriefStreak
  let onFinished: () -> Void

  @State private var page: String?
  /// The largest insets seen: the tab bar shrinks while the brief scrolls,
  /// and the layout must not move with it.
  @State private var topInset: CGFloat = 0
  @State private var bottomInset: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var index: Int { deck.pages.firstIndex { $0.id == page } ?? 0 }
  private var current: BriefPage { deck.pages[min(index, deck.pages.count - 1)] }

  /// Story and video pages sit on dark artwork; cover and end follow the system.
  private var onArtwork: Bool {
    switch current {
    case .story, .video: true
    case .cover, .end: false
    }
  }

  var body: some View {
    GeometryReader { geo in
      let insets = EdgeInsets(
        top: max(topInset, geo.safeAreaInsets.top), leading: 0,
        bottom: max(bottomInset, geo.safeAreaInsets.bottom), trailing: 0)
      ScrollView(.vertical) {
        LazyVStack(spacing: 0) {
          ForEach(deck.pages) { item in
            pageView(item, insets: insets)
              .containerRelativeFrame([.horizontal, .vertical])
          }
        }
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.paging)
      .scrollPosition(id: $page)
      .scrollIndicators(.hidden)
      .ignoresSafeArea()
      .overlay(alignment: .top) {
        BriefProgressBar(
          fraction: Double(index + 1) / Double(deck.pages.count), onArtwork: onArtwork,
          label: lang == .vi ? "Tiến độ" : "Progress", value: "\(index + 1)/\(deck.pages.count)",
          pageId: current.id
        )
        .padding(.top, insets.top + 4)
      }
      .onChange(of: geo.safeAreaInsets, initial: true) { _, new in
        topInset = max(topInset, new.top)
        bottomInset = max(bottomInset, new.bottom)
      }
    }
    .sensoryFeedback(.selection, trigger: index)
    .onChange(of: page) { _, new in
      if new == "end" { onFinished() }
    }
    .preferredColorScheme(onArtwork ? .dark : nil)
  }

  @ViewBuilder private func pageView(_ item: BriefPage, insets: EdgeInsets) -> some View {
    switch item {
    case .cover(let cover):
      BriefCoverPage(cover: cover, lang: lang, offline: offline, insets: insets)
    case .video(let video):
      BriefVideoPage(video: video, lang: lang, insets: insets)
    case .story(let story):
      BriefStoryPage(story: story, learned: deck.learned, lang: lang, insets: insets)
    case .end:
      BriefEndPage(
        date: deck.date, lang: lang, streak: streak, insets: insets,
        onRestart: {
          withAnimation(reduceMotion ? nil : .smooth) { page = deck.pages.first?.id }
        })
    }
  }
}

/// A thin bar: the share of the brief the reader has reached.
struct BriefProgressBar: View {
  let fraction: Double
  let onArtwork: Bool
  let label: String
  let value: String
  let pageId: String
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let ink = onArtwork ? Color.white : Palette.foreground
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(ink.opacity(0.22))
        Capsule().fill(ink).frame(width: geo.size.width * min(max(fraction, 0), 1))
      }
    }
    .frame(height: 3)
    .padding(.horizontal, Spacing.lg)
    .animation(reduceMotion ? nil : .smooth(duration: 0.3), value: fraction)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label)
    .accessibilityValue(value)
    .accessibilityIdentifier("brief-progress-\(pageId)")
  }
}
