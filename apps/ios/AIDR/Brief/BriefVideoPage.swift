import AIDRKit
import SwiftUI
import WebKit

/// The day's video. A poster until tapped, then the privacy-enhanced YouTube
/// player in a WKWebView. Nothing from YouTube's player loads before the tap,
/// and a web view never sits in the paging scroll until the reader asks.
struct BriefVideoPage: View {
  let video: BriefVideo
  let lang: Lang
  let insets: EdgeInsets
  @State private var playing = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text(lang == .vi ? "BẢN TIN VIDEO" : "VIDEO BRIEFING")
          .font(.mono(11, weight: .semibold))
          .tracking(1)
          .foregroundStyle(BriefInk.text)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .glassEffect(.regular, in: Capsule())
        Spacer()
      }
      .padding(.top, insets.top + 28)
      player
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.vertical, Spacing.lg)
      if let title = video.title {
        Text(title)
          .font(.inter(20, .semibold, relativeTo: .title3))
          .lineLimit(3)
          .minimumScaleFactor(0.8)
          .foregroundStyle(BriefInk.text)
      }
      HStack(spacing: Spacing.lg) {
        if !playing {
          Button {
            playing = true
          } label: {
            Label(lang == .vi ? "Xem video" : "Watch", systemImage: "play.fill")
              .font(.inter(16, .semibold, relativeTo: .body))
              .foregroundStyle(Palette.signalInk)
              .padding(.horizontal, Spacing.xs)
          }
          .buttonStyle(.glassProminent)
          .tint(Palette.signal)
          .controlSize(.large)
        }
        Link(destination: video.watchURL) {
          Text(lang == .vi ? "Xem trên YouTube" : "Watch on YouTube")
            .font(.inter(14, .medium, relativeTo: .subheadline))
            .foregroundStyle(BriefInk.text.opacity(0.8))
        }
      }
      .padding(.top, Spacing.lg)
    }
    .padding(.horizontal, Spacing.xl)
    .padding(.bottom, insets.bottom + Spacing.lg)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background {
      ZStack {
        Color(hex: "#161513")
        BriefPoster(url: video.posterURL).blur(radius: 50).opacity(0.55)
        Color.black.opacity(0.35)
      }
      .ignoresSafeArea()
      .accessibilityHidden(true)
    }
    .environment(\.colorScheme, .dark)
    .onDisappear { playing = false }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("brief-video")
  }

  private var player: some View {
    Rectangle()
      .fill(.black)
      .aspectRatio(video.isShort ? 9.0 / 16.0 : 16.0 / 9.0, contentMode: .fit)
      .overlay {
        if playing {
          BriefYouTubePlayer(id: video.id)
        } else {
          Button {
            playing = true
          } label: {
            ZStack {
              BriefPoster(url: video.posterURL)
              Color.black.opacity(0.2)
              Image(systemName: "play.fill")
                .font(.system(size: 26))
                .foregroundStyle(BriefInk.text)
                .frame(width: 68, height: 68)
                .glassEffect(.regular.interactive(), in: Circle())
            }
          }
          .buttonStyle(.plain)
          .accessibilityLabel(lang == .vi ? "Phát video" : "Play video")
          .accessibilityIdentifier("brief-video-play")
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      .shadow(color: .black.opacity(0.35), radius: 18, y: 8)
  }
}

private struct BriefPoster: View {
  let url: URL

  var body: some View {
    Color.clear.overlay {
      AsyncImage(url: url) { phase in
        if let image = phase.image {
          image.resizable().scaledToFill()
        } else {
          Color.black
        }
      }
    }
    .clipped()
  }
}

/// youtube-nocookie in an iframe, loaded with an aidr.today base URL so the
/// embed gets a referrer (a bare embed URL can fail with a player error).
/// `id` has passed BriefVideo.isYoutubeId, so it is safe in the markup.
struct BriefYouTubePlayer: UIViewRepresentable {
  let id: String

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.isOpaque = false
    view.backgroundColor = .black
    view.scrollView.backgroundColor = .black
    view.scrollView.isScrollEnabled = false
    view.loadHTMLString(html, baseURL: URL(string: "https://aidr.today"))
    return view
  }

  func updateUIView(_ view: WKWebView, context: Context) {}

  private var html: String {
    """
    <!doctype html><html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
    </head><body>
    <iframe src="https://www.youtube-nocookie.com/embed/\(id)?autoplay=1&playsinline=1&rel=0"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
    </body></html>
    """
  }
}
