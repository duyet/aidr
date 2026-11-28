import AIDRKit
import SwiftUI
import UIKit

/// Full-screen vertical paging over the deck, with a thin progress bar on top.
/// The scroll view runs under the status bar and the tab bar, so each page
/// pads itself with BriefInsets.
struct BriefPager: View {
  let deck: BriefDeck
  let lang: Lang
  let offline: Bool
  let streak: BriefStreak
  let onFinished: () -> Void

  @State private var page: String? = BriefResume.pageId
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(AppState.self) private var appState

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
    let insets = BriefInsets.pages
    ZStack(alignment: .top) {
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
      // The chrome sits in the safe area, so it needs no inset math.
      BriefProgressBar(
        fraction: Double(index + 1) / Double(deck.pages.count), onArtwork: onArtwork,
        label: lang == .vi ? "Tiến độ" : "Progress", value: "\(index + 1)/\(deck.pages.count)",
        pageId: current.id
      )
      .padding(.top, 4)
      BriefCustomizeButton(lang: lang, onArtwork: onArtwork) { appState.showSettings = true }
        .padding(.top, 20)
        .padding(.trailing, Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
    }
    .sensoryFeedback(.selection, trigger: index)
    .onChange(of: page) { _, new in
      BriefResume.pageId = new
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
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill((onArtwork ? Color.white : Palette.foreground).opacity(0.22))
        Capsule().fill(Palette.signal).frame(width: geo.size.width * min(max(fraction, 0), 1))
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

/// Opens the Customize sheet (RootView presents it).
struct BriefCustomizeButton: View {
  /// Room a page's top row leaves at its trailing edge for this button.
  static let reserved: CGFloat = 48

  let lang: Lang
  let onArtwork: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text("Aa")
        .font(.inter(15, .semibold))
        .foregroundStyle(onArtwork ? Color.white : Palette.foreground)
        .frame(width: 38, height: 38)
        .glassEffect(.regular.interactive(), in: Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(lang == .vi ? "Tùy chỉnh" : "Customize")
    .accessibilityIdentifier("brief-customize")
  }
}

/// The page the reader was on. A preference change rebuilds the tab tree
/// (RootView), and the brief should come back to the same page.
@MainActor
enum BriefResume {
  static var pageId: String?
}

/// How far a full-bleed page keeps its content from the screen edges. Read from
/// the window, not from layout: the tab bar shrinks while the brief scrolls,
/// and the page layout must not move with it.
@MainActor
enum BriefInsets {
  /// The floating tab bar and the gap above it.
  static let tabBar: CGFloat = 70

  static var pages: EdgeInsets {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }?.safeAreaInsets
    return EdgeInsets(
      top: window?.top ?? 59, leading: 0, bottom: (window?.bottom ?? 34) + tabBar, trailing: 0)
  }
}
