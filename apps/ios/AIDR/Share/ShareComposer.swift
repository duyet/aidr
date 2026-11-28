import AIDRKit
import SwiftUI
import UIKit

/// "Share as image": the story card on a background of your choice, drawn
/// live, and rendered to a 3x PNG for the share sheet (Save Image included).
struct ShareComposer: View {
  let content: ShareCardContent
  let lang: Lang

  @Environment(\.dismiss) private var dismiss
  @State private var style = ShareCardStyle()
  @State private var rendered: ShareCardImage?
  @State private var renderedPreview: UIImage?

  private var backgrounds: [ShareCardBackground] {
    ShareCardPalette.backgrounds(withBlur: content.image != nil)
  }

  var body: some View {
    NavigationStack {
      GeometryReader { proxy in
        preview(in: proxy.size)
      }
      .background(Palette.muted)
      .safeAreaInset(edge: .bottom) { controls }
      .navigationTitle(lang == .vi ? "Chia sẻ ảnh" : "Share as image")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
          }
          .accessibilityLabel(lang == .vi ? "Đóng" : "Close")
          .accessibilityIdentifier("share-close")
        }
        ToolbarItem(placement: .confirmationAction) { shareButton }
      }
    }
    .task(id: style) { await render() }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
  }

  // MARK: Preview

  private func preview(in available: CGSize) -> some View {
    let size = style.aspect.size
    let room = CGSize(width: available.width - 2 * Spacing.xl, height: available.height - 2 * Spacing.lg)
    let scale = max(min(room.width / size.width, room.height / size.height), 0.1)
    return ShareCardView(content: content, style: style)
      .frame(width: size.width, height: size.height)
      .scaleEffect(scale)
      .frame(width: size.width * scale, height: size.height * scale)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .animation(.snappy, value: style.aspect)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(lang == .vi ? "Xem trước thẻ chia sẻ" : "Share card preview")
      .accessibilityIdentifier("share-preview")
  }

  // MARK: Controls

  private var controls: some View {
    VStack(spacing: Spacing.md) {
      Picker(lang == .vi ? "Tỷ lệ" : "Aspect", selection: $style.aspect) {
        ForEach(ShareCardAspect.allCases) { aspect in
          Text(aspect.label).tag(aspect)
        }
      }
      .pickerStyle(.segmented)
      .accessibilityIdentifier("share-aspect")

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 14) {
          ForEach(backgrounds, id: \.self) { background in
            swatch(background)
          }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
      }
      .scrollClipDisabled()

      HStack(spacing: Spacing.lg) {
        slider(lang == .vi ? "Lề" : "Padding", value: $style.padding, range: ShareCardStyle.paddingRange)
        slider(lang == .vi ? "Bo góc" : "Radius", value: $style.cornerRadius, range: ShareCardStyle.radiusRange)
        slider(lang == .vi ? "Bóng" : "Shadow", value: $style.shadow, range: ShareCardStyle.shadowRange)
      }
    }
    .padding(Spacing.lg)
    .glassEffect(.regular, in: .rect(cornerRadius: 28, style: .continuous))
    .padding(.horizontal, Spacing.md)
    .padding(.bottom, Spacing.xs)
  }

  private func swatch(_ background: ShareCardBackground) -> some View {
    let selected = style.background == background
    return Button {
      style.background = background
    } label: {
      swatchFill(background)
        .frame(width: 34, height: 34)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Palette.border, lineWidth: 1))
        .overlay {
          if selected {
            Circle().strokeBorder(Palette.foreground, lineWidth: 2.5).padding(-5)
          }
        }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(ShareCardPalette.name(background, lang: lang))
    .accessibilityAddTraits(selected ? .isSelected : [])
    .accessibilityIdentifier("share-bg-\(ShareCardPalette.identifier(background))")
  }

  @ViewBuilder private func swatchFill(_ background: ShareCardBackground) -> some View {
    switch background {
    case .blur:
      if let image = content.image {
        Image(uiImage: image).resizable().scaledToFill().blur(radius: 5)
      }
    case .gradient(let index):
      ShareCardPalette.gradient(index)
    case .solid(let index):
      ShareCardPalette.solid(index)
    }
  }

  private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title)
        .font(.inter(11.5, .medium, relativeTo: .caption2))
        .foregroundStyle(Palette.mutedForeground)
      Slider(value: value, in: range)
        .tint(Palette.foreground)
    }
    .frame(maxWidth: .infinity)
  }

  // MARK: Render and share

  @ViewBuilder private var shareButton: some View {
    if let rendered, let renderedPreview {
      ShareLink(
        item: rendered,
        preview: SharePreview(content.headline, image: Image(uiImage: renderedPreview))
      ) {
        Text(lang == .vi ? "Chia sẻ" : "Share").fontWeight(.semibold)
      }
      .accessibilityIdentifier("share-image-link")
    } else {
      ProgressView()
    }
  }

  /// Draws the PNG a beat after the last change, so dragging a slider stays smooth.
  private func render() async {
    rendered = nil
    try? await Task.sleep(for: .milliseconds(200))
    guard !Task.isCancelled, let image = ShareCardRenderer.render(content, style: style),
      let png = image.pngData()
    else { return }
    rendered = ShareCardImage(png: png)
    renderedPreview = image
    dumpForUITests(png)
  }

  /// The UI journey cannot read the app's memory. When it passes a path in
  /// AIDR_SHARE_CARD_DUMP, the PNG the share sheet would get is written there
  /// so the CI artifact can show the real output.
  private func dumpForUITests(_ png: Data) {
    guard let path = ProcessInfo.processInfo.environment["AIDR_SHARE_CARD_DUMP"] else { return }
    try? png.write(to: URL(fileURLWithPath: path), options: .atomic)
  }
}
