import AIDRKit
import SwiftUI
import UIKit

/// The story page: headline, image, AI;DR summary, actions, sources.
/// Loads from the disk cache first, so a revisit works offline.
struct StoryScreen: View {
  let id: String
  let lang: Lang

  @State private var store: StoryStore
  @Environment(AppState.self) private var appState

  init(id: String, lang: Lang) {
    self.id = id
    self.lang = lang
    _store = State(initialValue: StoryStore(id: id))
  }

  var body: some View {
    content
      .background(Palette.background)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button {
            appState.showSettings = true
          } label: {
            Text("Aa").font(.inter(16, .semibold, relativeTo: .body))
          }
          .accessibilityLabel(lang == .vi ? "Cỡ chữ và giao diện" : "Text size and look")
          .accessibilityIdentifier("story-aa")
        }
      }
      .task { await store.load() }
  }

  @ViewBuilder private var content: some View {
    if let item = store.item {
      StoryContent(item: item, isComplete: store.isComplete, lang: lang)
    } else if store.failed {
      ContentUnavailableView {
        Label(lang == .vi ? "Không tải được tin" : "Couldn't load the story", systemImage: "wifi.slash")
      } description: {
        Text(lang == .vi ? "Kiểm tra kết nối rồi thử lại." : "Check your connection and try again.")
      } actions: {
        Button(lang == .vi ? "Thử lại" : "Try again") { Task { await store.retry() } }
          .buttonStyle(.glassProminent)
      }
    } else {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

private struct StoryContent: View {
  let item: Item
  let isComplete: Bool
  let lang: Lang

  @State private var hero: UIImage?
  @State private var heroFailed = false
  @State private var copied = false
  @State private var web: StoryLink?
  @State private var composing = false

  private var headline: StoryHeadline? { StoryDetail.headline(item, lang: lang) }
  private var summary: [String] { StoryDetail.summary(item, lang: lang) }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        metaLine
        headlineBlock
        heroBlock
        summaryBlock
        actions
        sourcesBlock
        tags
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.top, Spacing.sm)
      .padding(.bottom, Spacing.xxl)
    }
    .accessibilityIdentifier("story-screen")
    .task(id: item.imageUrl) { await loadHero() }
    .fullScreenCover(item: $web) { link in
      StorySafariView(url: link.url).ignoresSafeArea()
    }
    .sheet(isPresented: $composing) {
      ShareComposer(content: cardContent, lang: lang)
    }
  }

  // MARK: Header

  private var metaLine: some View {
    let meta = StoryDetail.meta(item, lang: lang)
    var out = AttributedString()
    if let topic = meta.topic {
      var dot = AttributedString("● ")
      dot.swiftUI.font = .system(size: 8)
      dot.swiftUI.foregroundColor = Palette.topic(meta.topicColor)
      dot.swiftUI.baselineOffset = 1.5
      var name = AttributedString(topic)
      name.swiftUI.font = .inter(11.5, .bold, relativeTo: .caption)
      name.swiftUI.foregroundColor = Palette.foreground
      name.swiftUI.kern = 0.7
      out += dot + name
    }
    if !meta.parts.isEmpty {
      var rest = AttributedString((meta.topic == nil ? "" : "  ·  ") + meta.parts.joined(separator: "  ·  "))
      rest.swiftUI.font = .inter(11.5, .bold, relativeTo: .caption)
      rest.swiftUI.kern = 0.7
      out += rest
    }
    return Text(out)
      .foregroundStyle(Palette.mutedForeground)
      .padding(.bottom, Spacing.md)
      .accessibilityIdentifier("story-meta")
  }

  @ViewBuilder private var headlineBlock: some View {
    if let headline {
      Text(
        StoryKeywordText.attributed(
          headline.text, tags: item.tags, size: 29, base: .semibold, ink: Palette.foreground, style: .title,
          headline: true)
      )
      .tracking(-0.6)
      .lineSpacing(2)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
      .accessibilityIdentifier("story-headline")
      .padding(.bottom, Spacing.md)
    }
    if let byline = StoryDetail.byline(item, lang: lang) {
      Text(byline)
        .font(.inter(13, relativeTo: .footnote))
        .foregroundStyle(Palette.mutedForeground)
        .padding(.bottom, headline?.isOriginal == true ? 2 : Spacing.lg)
    }
    if headline?.isOriginal == true {
      Text("Tiêu đề gốc tiếng Anh, chưa có bản dịch")
        .font(.inter(12.5, relativeTo: .caption))
        .foregroundStyle(Palette.quietForeground)
        .padding(.bottom, Spacing.lg)
    }
  }

  // MARK: Image

  @ViewBuilder private var heroBlock: some View {
    if item.imageUrl != nil, !heroFailed {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        Palette.muted
          .aspectRatio(1.6, contentMode: .fit)
          .overlay {
            if let hero {
              Image(uiImage: hero).resizable().scaledToFill()
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .accessibilityHidden(true)
        if let host = StoryDetail.publisherHost(StoryDetail.safeURL(item.url)) {
          Text(lang == .vi ? "Ảnh: \(host)" : "Image: \(host)")
            .font(.inter(12.5, relativeTo: .caption))
            .foregroundStyle(Palette.mutedForeground)
        }
      }
      .padding(.bottom, Spacing.xl)
      .accessibilityIdentifier("story-hero")
    }
  }

  private func loadHero() async {
    hero = nil
    heroFailed = false
    guard let url = StoryDetail.safeURL(item.imageUrl) else { return }
    if let image = await StoryImageLoader.load(url) {
      hero = image
    } else {
      heroFailed = true
    }
  }

  // MARK: Summary

  private var summaryBlock: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: 6) {
        Circle().fill(Palette.signal).frame(width: 6, height: 6)
        Text("AI;DR")
          .font(.mono(11.5, weight: .bold))
          .tracking(1.1)
          .foregroundStyle(Palette.accent)
      }
      if !summary.isEmpty {
        ForEach(Array(summary.enumerated()), id: \.offset) { entry in
          Text(
            StoryKeywordText.attributed(
              entry.element, tags: item.tags, size: 17, base: .regular, ink: Palette.body, style: .body)
          )
          .lineSpacing(6)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
        }
      } else if !isComplete {
        ProgressView()
      } else {
        Text(
          lang == .vi
            ? "Chưa có bản tóm tắt AI;DR tiếng Việt cho tin này." : "No English AI;DR for this story yet."
        )
        .font(.inter(15, relativeTo: .callout))
        .foregroundStyle(Palette.mutedForeground)
      }
    }
    .padding(.bottom, Spacing.xl)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("story-aidr")
  }

  // MARK: Actions

  private var actions: some View {
    VStack(spacing: Spacing.sm) {
      if let source = StoryDetail.safeURL(item.url) {
        Button {
          web = StoryLink(url: source)
        } label: {
          HStack(spacing: 8) {
            Text(lang == .vi ? "Đọc bài gốc" : "Read the source")
            Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .bold))
          }
          .font(.inter(15.5, .semibold, relativeTo: .body))
          .foregroundStyle(Palette.primaryForeground)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 15)
          .background(Palette.primary, in: Capsule())
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("story-read-source")
      }
      LazyVGrid(
        columns: [GridItem(.flexible(), spacing: Spacing.sm), GridItem(.flexible())], spacing: Spacing.sm
      ) {
        Button {
          UIPasteboard.general.string = StoryShare.copyText(item, lang: lang)
          copied = true
        } label: {
          actionLabel(
            copied ? (lang == .vi ? "Đã chép" : "Copied") : (lang == .vi ? "Chép AI;DR" : "Copy AI;DR"),
            copied ? "checkmark" : "doc.on.doc")
        }
        .task(id: copied) {
          guard copied else { return }
          try? await Task.sleep(for: .seconds(1.6))
          copied = false
        }
        .sensoryFeedback(.success, trigger: copied) { _, now in now }
        .accessibilityIdentifier("story-copy")

        ShareLink(
          item: StoryShare.link(item, lang: lang, slot: "link"),
          preview: SharePreview(headline?.text ?? item.title)
        ) {
          actionLabel(lang == .vi ? "Chia sẻ" : "Share", "square.and.arrow.up")
        }
        .accessibilityIdentifier("story-share")

        Button {
          composing = true
        } label: {
          actionLabel(lang == .vi ? "Chia sẻ ảnh" : "Share as image", "photo.on.rectangle.angled")
        }
        .accessibilityIdentifier("story-share-image")

        Button {
          web = StoryLink(url: StoryLinks.submit)
        } label: {
          actionLabel(lang == .vi ? "Đề xuất tin" : "Suggest a story", "plus.bubble")
        }
        .accessibilityIdentifier("story-suggest")
      }
      .buttonStyle(.glass)
      .controlSize(.large)
    }
    .padding(.bottom, Spacing.xl)
  }

  private func actionLabel(_ title: String, _ systemImage: String) -> some View {
    Label(title, systemImage: systemImage)
      .font(.inter(14, .semibold, relativeTo: .subheadline))
      .foregroundStyle(Palette.foreground)
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .frame(maxWidth: .infinity)
  }

  // MARK: Sources and tags

  @ViewBuilder private var sourcesBlock: some View {
    let groups = StoryDetail.sources(item)
    if !groups.main.isEmpty || !groups.more.isEmpty {
      StorySourcesView(main: groups.main, more: groups.more, lang: lang) { web = StoryLink(url: $0) }
        .padding(.bottom, Spacing.xl)
    }
  }

  @ViewBuilder private var tags: some View {
    if !item.tags.isEmpty {
      Text(item.tags.map { "#\($0)" }.joined(separator: "   "))
        .font(.inter(13, relativeTo: .footnote))
        .foregroundStyle(Palette.mutedForeground)
        .accessibilityIdentifier("story-tags")
    }
  }

  // MARK: Share card

  private var cardContent: ShareCardContent {
    let meta = StoryDetail.meta(item, lang: lang)
    return ShareCardContent(
      topic: meta.topic, topicColor: meta.topicColor,
      dateLine: StoryDetail.dateLine(item, lang: lang) ?? "",
      headline: headline?.text ?? item.title, tags: item.tags,
      summary: StoryDetail.summaryText(item, lang: lang), image: hero)
  }
}
