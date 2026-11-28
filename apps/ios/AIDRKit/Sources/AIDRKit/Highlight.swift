import Foundation

/// Port of apps/web/src/lib/highlight.ts and keyword-highlight.ts. Offsets are
/// UTF-16, as in JavaScript, so the segments match the web's character for
/// character (golden test in AIDRKitTests).
public enum Highlight {
  public struct TitleSegment: Equatable, Sendable {
    public var text: String
    public var highlighted: Bool
    /// The input tag that produced a highlighted segment.
    public var tag: String?
  }

  public enum Kind: String, Equatable, Sendable { case num, entity }

  public struct Segment: Equatable, Sendable {
    public var text: String
    public var kind: Kind?
  }

  static let maxHighlights = 3
  static let maxNumbers = 4

  /// Names that deserve a highlight even when the item has no tags.
  public static let titleKeywords = [
    "Hugging Face", "OpenRouter", "Anthropic", "DeepMind", "DeepSeek", "Microsoft", "OpenAI",
    "Nvidia", "Alibaba", "Mistral", "Stability", "Perplexity", "Together", "Fireworks", "SpaceX",
    "Stripe", "Amazon", "Apple", "Claude", "Gemini", "Google", "Codex", "Copilot", "Cursor",
    "Windsurf", "Composer", "Ollama", "vLLM", "Llama", "Qwen", "Grok", "Kimi", "Gemma", "Phi",
    "GLM", "Fable", "Astra", "Meta", "xAI", "GPT", "MCP", "RAG",
  ]

  /// The item's tags, then the keyword list, then the feed's learned
  /// keywords, de-duplicated case-insensitively.
  public static func tagsForHighlight(_ itemTags: [String], learned: [String] = []) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    let learnedClean = learned.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    for tag in itemTags + titleKeywords + learnedClean {
      let key = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if key.isEmpty || seen.contains(key) { continue }
      seen.insert(key)
      out.append(tag)
    }
    return out
  }

  // MARK: Title highlights

  /// Splits `title` wherever one of `tags` appears as a whole word, case
  /// insensitive, at most 3 distinct tags, longest tag first.
  public static func title(_ title: String, tags: [String]) -> [TitleSegment] {
    if title.isEmpty || tags.isEmpty { return [TitleSegment(text: title, highlighted: false)] }

    var needleOrder: [String] = []
    var needleTag: [String: String] = [:]
    for tag in tags {
      let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.isEmpty { continue }
      if needleTag[trimmed] == nil {
        needleTag[trimmed] = trimmed
        needleOrder.append(trimmed)
      }
      let spaced = trimmed.replacingOccurrences(of: "[-_]+", with: " ", options: .regularExpression)
      if spaced != trimmed && needleTag[spaced] == nil {
        needleTag[spaced] = trimmed
        needleOrder.append(spaced)
      }
    }
    let sorted = needleOrder.enumerated()
      .sorted { a, b in
        let la = a.element.utf16.count
        let lb = b.element.utf16.count
        return la != lb ? la > lb : a.offset < b.offset
      }
      .map(\.element)

    let original = title as NSString
    let lower = title.lowercased() as NSString
    var ranges: [(start: Int, end: Int, tag: String)] = []
    var matched = Set<String>()

    for needle in sorted {
      if matched.count >= maxHighlights { break }
      let lowerNeedle = needle.lowercased()
      if lowerNeedle.isEmpty { continue }
      var from = 0
      while matched.count < maxHighlights {
        guard from <= lower.length else { break }
        let found = lower.range(
          of: lowerNeedle, options: .literal, range: NSRange(location: from, length: lower.length - from))
        if found.location == NSNotFound { break }
        let start = found.location
        let end = start + found.length
        let bordered =
          (start > 0 && isLetter(lower.character(at: start - 1)))
          || (end < lower.length && isLetter(lower.character(at: end)))
        let overlaps = ranges.contains { start < $0.end && end > $0.start }
        if !bordered && !overlaps {
          ranges.append((start, end, needleTag[needle] ?? needle))
          matched.insert(lowerNeedle)
          break
        }
        from = start + 1
      }
    }

    if ranges.isEmpty { return [TitleSegment(text: title, highlighted: false)] }
    ranges.sort { $0.start < $1.start }
    var out: [TitleSegment] = []
    var cursor = 0
    for r in ranges {
      if r.start > cursor { out.append(TitleSegment(text: slice(original, cursor, r.start), highlighted: false)) }
      out.append(TitleSegment(text: slice(original, r.start, r.end), highlighted: true, tag: r.tag))
      cursor = r.end
    }
    if cursor < original.length {
      out.append(TitleSegment(text: slice(original, cursor, original.length), highlighted: false))
    }
    return out
  }

  // MARK: Keyword highlights (numbers and entities)

  nonisolated(unsafe) static let urlPattern = try! NSRegularExpression(
    pattern: #"\b(?:https?://|www\.)[^\s<>"']+"#, options: [.caseInsensitive])

  nonisolated(unsafe) static let numberPattern: NSRegularExpression = {
    let num = #"[0-9]+(?:[.,][0-9]+)*"#
    let approx = #"[~≈]\s?"#
    let curPrefix = #"(?:US\$|\$|€|£|¥)\s?"#
    let scaleLetter = #"[kmbt](?![\p{L}\p{N}])"#
    let scaleWord =
      #"(?:nghìn tỷ|ngàn tỷ|nghìn tỉ|ngàn tỉ|nghìn|ngàn|triệu|tỷ|tỉ|thousand|million|billion|trillion|bn|mn)(?![\p{L}\p{N}])"#
    let curWord = #"(?:USD|VND|EUR|đô la(?: Mỹ)?|đô|đồng)(?![\p{L}\p{N}])"#
    let percent = #"(?:\s?%|\s(?:phần trăm|percent)(?![\p{L}\p{N}]))"#
    let multiplier = #"[x×](?![\p{L}\p{N}])"#
    let lookbehind = #"(?<![\p{L}\p{N}_\-./:@#])"#
    let end = #"(?![\p{L}\p{N}])"#
    let pattern =
      "\(lookbehind)(?<approx>\(approx))?(?<cur>\(curPrefix))?\(num)(?:(?<letter>\(scaleLetter))|(?<mult>\(multiplier)))?(?:\\s(?<scale>\(scaleWord)))?(?:\\s(?<curword>\(curWord)))?(?<pct>\(percent))?\(end)"
    return try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
  }()

  static let markerGroups = ["approx", "cur", "letter", "mult", "scale", "curword", "pct"]

  static func urlRanges(_ text: NSString) -> [NSRange] {
    urlPattern.matches(in: text as String, range: NSRange(location: 0, length: text.length)).map(\.range)
  }

  static func overlaps(_ a: NSRange, _ list: [NSRange]) -> Bool {
    list.contains { a.location < NSMaxRange($0) && NSMaxRange(a) > $0.location }
  }

  /// Money, percentages and scaled or approximate numbers. A bare number
  /// (a year, a count, a version digit) stays plain.
  public static func numberRanges(_ text: String) -> [NSRange] {
    let ns = text as NSString
    let urls = urlRanges(ns)
    var out: [NSRange] = []
    for m in numberPattern.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
      if out.count >= maxNumbers { break }
      let marked = markerGroups.contains { m.range(withName: $0).location != NSNotFound }
      if !marked || overlaps(m.range, urls) { continue }
      out.append(m.range)
    }
    return out
  }

  /// Whole word, case insensitive: is `needle` written in `text` with a
  /// capital letter? Lowercase topic tags ("funding") are not names.
  static func appearsAsName(_ text: NSString, _ needle: String) -> Bool {
    let lower = (text as String).lowercased() as NSString
    let n = needle.lowercased()
    if n.isEmpty { return false }
    var from = 0
    while from <= lower.length {
      let found = lower.range(of: n, options: .literal, range: NSRange(location: from, length: lower.length - from))
      if found.location == NSNotFound { return false }
      let at = found.location
      let end = at + found.length
      let glued =
        (at > 0 && at - 1 < text.length && isLetter(text.character(at: at - 1)))
        || (end < text.length && isLetter(text.character(at: end)))
      if !glued && end <= text.length && hasUppercase(slice(text, at, end)) { return true }
      from = at + 1
    }
    return false
  }

  static func entityRanges(_ text: String, tags: [String], learned: [String]) -> [NSRange] {
    let masked = NSMutableString(string: text)
    for u in urlRanges(text as NSString).reversed() {
      masked.replaceCharacters(in: u, with: String(repeating: " ", count: u.length))
    }
    let maskedNS = masked as NSString
    let candidates = tagsForHighlight(tags, learned: learned).filter {
      appearsAsName(maskedNS, $0.trimmingCharacters(in: .whitespacesAndNewlines))
    }
    var out: [NSRange] = []
    var cursor = 0
    for seg in title(maskedNS as String, tags: candidates) {
      let start = cursor
      cursor += seg.text.utf16.count
      if seg.highlighted && hasUppercase(seg.text) { out.append(NSRange(location: start, length: cursor - start)) }
    }
    return out
  }

  /// Splits `text` into plain, number and entity segments. Numbers win an
  /// overlap, URLs are never highlighted, the segments join back to `text`.
  public static func keywords(_ text: String, tags: [String] = [], learned: [String] = []) -> [Segment] {
    if text.isEmpty { return [Segment(text: text, kind: nil)] }
    var ranges: [(range: NSRange, kind: Kind)] = numberRanges(text).map { ($0, Kind.num) }
    for r in entityRanges(text, tags: tags, learned: learned) where !overlaps(r, ranges.map(\.range)) {
      ranges.append((r, Kind.entity))
    }
    if ranges.isEmpty { return [Segment(text: text, kind: nil)] }
    ranges.sort { $0.range.location < $1.range.location }
    let ns = text as NSString
    var out: [Segment] = []
    var cursor = 0
    for r in ranges {
      if r.range.location > cursor { out.append(Segment(text: slice(ns, cursor, r.range.location), kind: nil)) }
      out.append(Segment(text: ns.substring(with: r.range), kind: r.kind))
      cursor = NSMaxRange(r.range)
    }
    if cursor < ns.length { out.append(Segment(text: slice(ns, cursor, ns.length), kind: nil)) }
    return out
  }

  // MARK: Helpers

  static func slice(_ s: NSString, _ start: Int, _ end: Int) -> String {
    let lo = min(max(start, 0), s.length)
    let hi = min(max(end, lo), s.length)
    return s.substring(with: NSRange(location: lo, length: hi - lo))
  }

  /// JavaScript's /\p{L}/u on one UTF-16 code unit: a lone surrogate is not a letter.
  static func isLetter(_ unit: unichar) -> Bool {
    guard let scalar = Unicode.Scalar(unit) else { return false }
    switch scalar.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: return true
    default: return false
    }
  }

  static func hasUppercase(_ s: String) -> Bool {
    s.unicodeScalars.contains { $0.properties.generalCategory == .uppercaseLetter }
  }
}
