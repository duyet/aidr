import AIDRKit
import SwiftUI

/// The sections that mirror the website's Customize panel. Each choice writes
/// to the shared ReaderPrefsStore, so the app behind the sheet changes at once.
struct CustomizeSections: View {
  @Bindable var store: ReaderPrefsStore
  let lang: Lang

  var body: some View {
    appearance
    text
    accent
    highlight
    layout
  }

  private func t(_ vi: String, _ en: String) -> String { lang.pick(vi, en) }

  // MARK: Appearance

  private struct Look {
    let value: ReaderAppearance
    let vi: String
    let en: String
    let fill: Color
    let ink: Color
  }

  private static let looks: [Look] = [
    Look(value: .system, vi: "Theo máy", en: "System", fill: Color(hex: "#ffffff"), ink: Color(hex: "#1f1e1d")),
    Look(value: .light, vi: "Sáng", en: "Light", fill: Color(hex: "#ffffff"), ink: Color(hex: "#1f1e1d")),
    Look(value: .cream, vi: "Kem", en: "Cream", fill: Color(hex: "#faf6ec"), ink: Color(hex: "#2b2620")),
    Look(value: .gray, vi: "Xám", en: "Gray", fill: Color(hex: "#e4e4df"), ink: Color(hex: "#1f1e1d")),
    Look(value: .dark, vi: "Tối", en: "Dark", fill: Color(hex: "#1f1e1d"), ink: Color(hex: "#f5f4ee")),
    Look(value: .black, vi: "Đen", en: "Black", fill: Color(hex: "#000000"), ink: Color(hex: "#f5f4ee")),
  ]

  private var appearance: some View {
    Section {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.md), count: 3), spacing: Spacing.lg) {
        ForEach(Self.looks, id: \.value) { look in
          let selected = store.prefs.appearance == look.value
          Button {
            store.prefs.appearance = look.value
          } label: {
            VStack(spacing: 6) {
              ZStack {
                if look.value == .system {
                  LinearGradient(
                    stops: [
                      .init(color: Color(hex: "#ffffff"), location: 0.5),
                      .init(color: Color(hex: "#1f1e1d"), location: 0.5),
                    ], startPoint: .topLeading, endPoint: .bottomTrailing)
                } else {
                  look.fill
                }
                Text("Aa")
                  .font(.inter(17, .semibold))
                  .foregroundStyle(look.value == .system ? Color(hex: "#8a8880") : look.ink)
              }
              .frame(height: 54)
              .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
              .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                  .strokeBorder(selected ? Palette.accent : Palette.border, lineWidth: selected ? 2.5 : 1)
              }
              Text(t(look.vi, look.en))
                .font(.inter(12.5, selected ? .semibold : .medium, relativeTo: .caption))
                .foregroundStyle(selected ? Palette.foreground : Palette.mutedForeground)
            }
          }
          .buttonStyle(.plain)
          .accessibilityLabel(t(look.vi, look.en))
          .accessibilityAddTraits(selected ? .isSelected : [])
          .accessibilityIdentifier("settings-appearance-\(look.value.rawValue)")
        }
      }
      .padding(.vertical, Spacing.xs)
    } header: {
      SettingsHeader(text: t("Giao diện", "Appearance"), lang: lang)
    }
    .listRowBackground(Palette.muted)
  }

  // MARK: Text

  private static let sizeNames: [ReaderTextSize: (vi: String, en: String)] = [
    .system: ("Theo máy", "System"), .small: ("Nhỏ", "Small"), .medium: ("Vừa", "Medium"),
    .large: ("Lớn", "Large"), .xLarge: ("Rất lớn", "Extra large"), .xxLarge: ("Cực lớn", "XX large"),
    .xxxLarge: ("Lớn nhất", "XXX large"),
  ]

  private var sizeIndex: Binding<Double> {
    Binding(
      get: { Double(ReaderTextSize.allCases.firstIndex(of: store.prefs.textSize) ?? 0) },
      set: { store.prefs.textSize = ReaderTextSize.allCases[min(max(Int($0.rounded()), 0), ReaderTextSize.allCases.count - 1)] })
  }

  private var text: some View {
    Section {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        HStack {
          Text(t("Cỡ chữ", "Size"))
          Spacer()
          let name = Self.sizeNames[store.prefs.textSize] ?? ("", "")
          Text(t(name.vi, name.en))
            .font(.inter(14, relativeTo: .callout))
            .foregroundStyle(Palette.mutedForeground)
        }
        HStack(spacing: Spacing.md) {
          Text("A").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.mutedForeground)
          Slider(value: sizeIndex, in: 0...Double(ReaderTextSize.allCases.count - 1), step: 1)
            .tint(Palette.accent)
            .accessibilityLabel(t("Cỡ chữ", "Text size"))
            .accessibilityIdentifier("settings-text-size")
          Text("A").font(.system(size: 24, weight: .semibold)).foregroundStyle(Palette.mutedForeground)
        }
      }
      fontPicker(t("Chữ nội dung", "Body font"), selection: $store.prefs.bodyFont, id: "settings-body-font")
      fontPicker(t("Chữ tiêu đề", "Headline font"), selection: $store.prefs.headFont, id: "settings-head-font")
      VStack(alignment: .leading, spacing: Spacing.xs) {
        Text(t("Nvidia tăng 4,6% sau báo cáo của Bloomberg về chip Blackwell", "Nvidia rebounds 4.6% after Bloomberg's report on Blackwell chips"))
          .font(.headline(20, .semibold, relativeTo: .title3))
          .foregroundStyle(Palette.foreground)
        Text(t("Cổ phiếu hồi phục sau khi 200 tỷ USD vốn hóa từng bốc hơi.", "Shares recovered after $200 billion in value vanished."))
          .font(.inter(15, relativeTo: .body))
          .foregroundStyle(Palette.body)
      }
      .padding(.vertical, Spacing.xs)
      .accessibilityIdentifier("settings-text-preview")
    } header: {
      SettingsHeader(text: t("Chữ", "Text"), lang: lang)
    }
    .listRowBackground(Palette.muted)
  }

  private func fontPicker(_ title: String, selection: Binding<ReaderFontFamily>, id: String) -> some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      Text(title)
      Picker(title, selection: selection) {
        Text("Sans").tag(ReaderFontFamily.sans)
        Text("Serif").tag(ReaderFontFamily.serif)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .accessibilityIdentifier(id)
    }
  }

  // MARK: Accent

  private static let accents: [(value: ReaderAccent, vi: String, en: String, fill: String, ink: String)] = [
    (.yellow, "Vàng", "Yellow", "#f5c518", "#0a0a0a"),
    (.blue, "Xanh dương", "Blue", "#4c8dff", "#ffffff"),
    (.green, "Xanh lá", "Green", "#2bb673", "#04140c"),
    (.rose, "Hồng", "Rose", "#f0527a", "#ffffff"),
    (.violet, "Tím", "Violet", "#8b5cf6", "#ffffff"),
  ]

  private var accent: some View {
    Section {
      HStack {
        ForEach(Self.accents, id: \.value) { item in
          let selected = store.prefs.accent == item.value
          Button {
            store.prefs.accent = item.value
          } label: {
            Circle()
              .fill(Color(hex: item.fill))
              .frame(width: 40, height: 40)
              .overlay {
                if selected {
                  Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color(hex: item.ink))
                }
              }
              .overlay { Circle().strokeBorder(Palette.border, lineWidth: 1) }
              .padding(3)
              .overlay {
                if selected { Circle().strokeBorder(Color(hex: item.fill), lineWidth: 2) }
              }
          }
          .buttonStyle(.plain)
          .frame(maxWidth: .infinity)
          .accessibilityLabel(t(item.vi, item.en))
          .accessibilityAddTraits(selected ? .isSelected : [])
          .accessibilityIdentifier("settings-accent-\(item.value.rawValue)")
        }
      }
    } header: {
      SettingsHeader(text: t("Màu nhấn", "Accent"), lang: lang)
    }
    .listRowBackground(Palette.muted)
  }

  // MARK: Highlight

  private var highlight: some View {
    Section {
      Picker(t("Tô sáng", "Highlight"), selection: $store.prefs.highlight) {
        Text(t("Theo chủ đề", "By topic")).tag(ReaderHighlight.topic)
        Text(t("Một màu", "One color")).tag(ReaderHighlight.one)
        Text(t("Tắt", "Off")).tag(ReaderHighlight.none)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .accessibilityIdentifier("settings-highlight")
      highlightPreview
    } header: {
      SettingsHeader(text: t("Tô sáng", "Highlight"), lang: lang)
    }
    .listRowBackground(Palette.muted)
  }

  /// A digest row's look: topic dot and label, then keywords in their colors.
  private var highlightPreview: some View {
    let sample = t("Nvidia tăng 4,6% sau báo cáo của Bloomberg về chip Blackwell", "Nvidia rebounds 4.6% after Bloomberg's report on Blackwell chips")
    var out = AttributedString()
    var dot = AttributedString("● ")
    dot.swiftUI.font = .system(size: 8)
    dot.swiftUI.foregroundColor = Palette.topic(Topic.color(forTag: "Nvidia"))
    dot.swiftUI.baselineOffset = 1.5
    var label = AttributedString("NVIDIA  ")
    label.swiftUI.font = .mono(11, weight: .medium)
    label.swiftUI.foregroundColor = Palette.mutedForeground
    label.swiftUI.kern = 0.8
    out += dot + label
    for segment in Highlight.keywords(sample, tags: ["Nvidia", "Bloomberg", "Blackwell"]) {
      var piece = AttributedString(segment.text)
      switch segment.kind {
      case .num:
        piece.swiftUI.font = .inter(15, .semibold)
        piece.swiftUI.foregroundColor = Palette.keywordNumber
      case .entity:
        piece.swiftUI.font = .inter(15, .semibold)
        piece.swiftUI.foregroundColor = Palette.keywordEntity
      case nil:
        piece.swiftUI.font = .inter(15)
        piece.swiftUI.foregroundColor = Palette.foreground
      }
      out += piece
    }
    return Text(out)
      .lineSpacing(2)
      .padding(.vertical, Spacing.xs)
      .accessibilityIdentifier("settings-highlight-preview")
  }

  // MARK: Layout

  private var layout: some View {
    Section {
      Picker(t("Bố cục", "Layout"), selection: $store.prefs.layout) {
        Text(t("Gọn", "Compact")).tag(ReaderLayout.compact)
        Text(t("Thoáng", "Comfortable")).tag(ReaderLayout.comfortable)
        Text(t("Báo", "Newspaper")).tag(ReaderLayout.newspaper)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .accessibilityIdentifier("settings-layout")

      Picker(t("Kiểu AI;DR", "Digest view"), selection: $store.prefs.digestView) {
        Text(t("Ảnh", "Image")).tag(ReaderDigestView.image)
        Text(t("2 dòng", "2 lines")).tag(ReaderDigestView.rows2)
        Text(t("3 dòng", "3 lines")).tag(ReaderDigestView.rows3)
      }
      .pickerStyle(.menu)
      .accessibilityIdentifier("settings-digest-view")

      VStack(alignment: .leading, spacing: Spacing.sm) {
        Text(t("Số tin trong AI;DR", "Stories in the digest"))
        Picker(t("Số tin", "Count"), selection: $store.prefs.digestCount) {
          ForEach(ReaderPrefs.digestCounts, id: \.self) { Text("\($0)").tag($0) }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .accessibilityIdentifier("settings-digest-count")
      }

      Toggle(t("Ảnh thu nhỏ", "Thumbnails"), isOn: $store.prefs.thumbnails)
        .tint(Palette.signal)
        .accessibilityIdentifier("settings-thumbnails")
      Toggle(t("Tóm tắt", "Summaries"), isOn: $store.prefs.summaries)
        .tint(Palette.signal)
        .accessibilityIdentifier("settings-summaries")
      Toggle(t("Hai ngôn ngữ", "Both languages"), isOn: $store.prefs.bilingual)
        .tint(Palette.signal)
        .accessibilityIdentifier("settings-bilingual")
    } header: {
      SettingsHeader(text: t("Bố cục", "Layout"), lang: lang)
    }
    .listRowBackground(Palette.muted)
  }
}
