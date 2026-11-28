import Foundation

/// The day's YouTube video for one language, read from the day page's public
/// Markdown twin (`/date/YYYY-MM-DD.md?lang=vi`, its "## Video" section).
/// There is no JSON field for it yet.
public struct BriefVideo: Equatable, Sendable {
  public var id: String
  /// A 9:16 Short rather than the 16:9 briefing.
  public var isShort: Bool
  public var title: String?

  public init(id: String, isShort: Bool, title: String? = nil) {
    self.id = id
    self.isShort = isShort
    self.title = title
  }

  public var watchURL: URL {
    URL(string: isShort ? "https://www.youtube.com/shorts/\(id)" : "https://www.youtube.com/watch?v=\(id)")!
  }

  /// A frame that exists for every upload (480x360, bars baked in; fill crops them).
  public var posterURL: URL { URL(string: "https://i.ytimg.com/vi/\(id)/hqdefault.jpg")! }

  /// The same rule as isYoutubeId in apps/web/src/lib/day-video.ts.
  public static func isYoutubeId(_ value: String) -> Bool {
    value.count == 11 && value.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }
  }

  /// Reads the "## Video" section. A phone is portrait, so like the web's
  /// mobile layout a Short wins over the 16:9 video when both exist.
  public static func parse(markdown: String) -> BriefVideo? {
    var inSection = false
    var title: String?
    var long: String?
    var short: String?
    for raw in markdown.split(separator: "\n", omittingEmptySubsequences: false) {
      let line = raw.trimmingCharacters(in: .whitespaces)
      if line.hasPrefix("## ") {
        if inSection { break }
        inSection = line == "## Video"
        continue
      }
      guard inSection, !line.isEmpty else { continue }
      if line.hasPrefix("- YouTube Shorts:") {
        short = id(fromLink: String(line.dropFirst("- YouTube Shorts:".count)))
      } else if line.hasPrefix("- YouTube:") {
        long = id(fromLink: String(line.dropFirst("- YouTube:".count)))
      } else if !line.hasPrefix("-"), title == nil {
        title = unescape(line)
      }
    }
    if let short { return BriefVideo(id: short, isShort: true, title: title) }
    if let long { return BriefVideo(id: long, isShort: false, title: title) }
    return nil
  }

  /// watch?v=ID or /shorts/ID. Anything else is not a video.
  static func id(fromLink link: String) -> String? {
    guard let components = URLComponents(string: link.trimmingCharacters(in: .whitespaces)),
      components.scheme == "https", ["www.youtube.com", "youtube.com"].contains(components.host ?? "")
    else { return nil }
    let parts = components.path.split(separator: "/").map(String.init)
    let candidate: String?
    if parts.count == 2, parts[0] == "shorts" {
      candidate = parts[1]
    } else if parts == ["watch"] {
      candidate = components.queryItems?.first { $0.name == "v" }?.value
    } else {
      candidate = nil
    }
    return candidate.flatMap { isYoutubeId($0) ? $0 : nil }
  }

  /// The server escapes Markdown punctuation in titles (`\|`, `\*`).
  static func unescape(_ text: String) -> String {
    text.replacingOccurrences(of: #"\\([!-/:-@\[-`{-~])"#, with: "$1", options: .regularExpression)
  }
}

extension APIClient {
  /// The day's video in `lang`, or nil when that language has none. VI and
  /// EN never fall back to each other.
  public func dayVideo(date: String, lang: Lang) async throws -> BriefVideo? {
    guard date.count == 10, date.allSatisfy({ $0.isASCII && ($0.isNumber || $0 == "-") }) else { return nil }
    let data = try await get("date/\(date).md", query: [URLQueryItem(name: "lang", value: lang.rawValue)])
    guard let text = String(data: data, encoding: .utf8) else { return nil }
    return BriefVideo.parse(markdown: text)
  }
}
