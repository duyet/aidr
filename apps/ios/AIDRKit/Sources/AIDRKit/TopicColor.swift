import Foundation

/// A text color pair for one topic: the light-mode and the dark-mode ink, as
/// #rrggbb. Port of apps/web/src/lib/topic-color.ts; the golden test in
/// AIDRKitTests compares it with the web's own output.
public struct TopicColor: Equatable, Hashable, Sendable {
  public let light: String
  public let dark: String

  public init(light: String, dark: String) {
    self.light = light
    self.dark = dark
  }
}

public enum Topic {
  /// 12 hue families. Order is fixed: tag hashes index into it.
  public static let palette: [TopicColor] = [
    TopicColor(light: "#b91c1c", dark: "#f87171"),  // red
    TopicColor(light: "#c2410c", dark: "#fb923c"),  // orange
    TopicColor(light: "#92400e", dark: "#fbbf24"),  // amber
    TopicColor(light: "#15803d", dark: "#4ade80"),  // green
    TopicColor(light: "#0f766e", dark: "#2dd4bf"),  // teal
    TopicColor(light: "#0e7490", dark: "#22d3ee"),  // cyan
    TopicColor(light: "#1d4ed8", dark: "#60a5fa"),  // blue
    TopicColor(light: "#4338ca", dark: "#818cf8"),  // indigo
    TopicColor(light: "#6d28d9", dark: "#a78bfa"),  // violet
    TopicColor(light: "#7e22ce", dark: "#c084fc"),  // purple
    TopicColor(light: "#be185d", dark: "#f472b6"),  // pink
    TopicColor(light: "#be123c", dark: "#fb7185"),  // rose
  ]

  /// Canonical story categories emitted by the scoring pipeline.
  public static let categoryNames = [
    "Models", "Regulation", "Products", "Agents", "Research", "Industry", "Legal", "Infra",
    "Releases", "Chips", "Funding", "Tools", "Frameworks", "Data", "Open Source",
  ]

  /// Unknown or missing categories stay neutral (the muted foreground).
  public static let neutral = TopicColor(light: "#474747", dark: "#a3a3a3")

  static let categorySlot: [String: Int] = [
    "models": 6, "regulation": 0, "products": 5, "agents": 7, "research": 8, "industry": 1,
    "legal": 11, "infra": 4, "releases": 3, "chips": 2, "funding": 9, "tools": 10,
    // Twelve hues, fifteen categories: the rest share with a rarely adjacent neighbour.
    "frameworks": 2, "data": 5, "open source": 3,
  ]

  static let viNames: [String: String] = [
    "models": "Model", "regulation": "Chính sách", "products": "Sản phẩm", "agents": "Tác nhân",
    "research": "Nghiên cứu", "industry": "Ngành", "legal": "Pháp lý", "infra": "Hạ tầng",
    "releases": "Phát hành", "chips": "Chip", "funding": "Gọi vốn", "tools": "Công cụ",
    "frameworks": "Frameworks", "data": "Dữ liệu", "open source": "Mã nguồn mở",
  ]

  static func canonical(_ value: String?) -> String? {
    guard let key = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !key.isEmpty
    else { return nil }
    return key
  }

  public static func isKnownCategory(_ category: String?) -> Bool {
    canonical(category).map { categorySlot[$0] != nil } ?? false
  }

  /// djb2 over UTF-16 code units with 32-bit wraparound, like the web's
  /// `(hash * 33 + charCode) | 0`.
  static func hash(_ input: String) -> UInt32 {
    var hash: Int32 = 5381
    for unit in input.utf16 { hash = hash &* 33 &+ Int32(unit) }
    return UInt32(bitPattern: hash)
  }

  /// A tag's color: "GPT-5", "gpt-5" and " gpt-5 " land on the same slot.
  public static func color(forTag tag: String) -> TopicColor {
    let key = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return palette[Int(hash(key) % UInt32(palette.count))]
  }

  /// A category's color; unknown or missing categories get `neutral`.
  public static func color(forCategory category: String?) -> TopicColor {
    canonical(category).flatMap { categorySlot[$0] }.map { palette[$0] } ?? neutral
  }

  /// A category's display name. Unknown categories pass through unchanged.
  public static func label(_ category: String, lang: Lang) -> String {
    guard lang == .vi, let key = canonical(category) else { return category }
    return viNames[key] ?? category
  }
}
