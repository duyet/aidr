import AIDRKit
import Foundation
import Testing

/// golden.json holds what the web's topic-color.ts, highlight.ts and
/// keyword-highlight.ts return for the web test inputs and for every AI;DR
/// bullet in the feed fixture (scripts/make-golden.ts). The app must color and
/// highlight exactly like aidr.today.
struct GoldenTests {
  struct Golden: Decodable {
    struct Color: Decodable { var tag: String?; var name: String?; var light: String; var dark: String }
    struct TitleSegment: Decodable { var text: String; var highlighted: Bool; var tag: String? }
    struct TitleCase: Decodable {
      var title: String; var tags: [String]; var learned: [String]; var useFallback: Bool
      var segments: [TitleSegment]
    }
    struct KeywordSegment: Decodable { var text: String; var kind: String? }
    struct KeywordCase: Decodable {
      var text: String; var tags: [String]; var learned: [String]; var segments: [KeywordSegment]
    }
    var topicColor: [Color]
    var categoryColor: [Color]
    var highlightTitle: [TitleCase]
    var highlightKeywords: [KeywordCase]
  }

  let golden: Golden

  init() throws {
    golden = try JSONDecoder().decode(Golden.self, from: Fixtures.data("golden"))
  }

  @Test func topicColorsMatchTheWeb() {
    for c in golden.topicColor {
      #expect(Topic.color(forTag: c.tag ?? "") == TopicColor(light: c.light, dark: c.dark), "tag \(c.tag ?? "")")
    }
  }

  @Test func categoryColorsMatchTheWeb() {
    for c in golden.categoryColor {
      #expect(
        Topic.color(forCategory: c.name) == TopicColor(light: c.light, dark: c.dark), "category \(c.name ?? "")")
    }
  }

  @Test func titleHighlightsMatchTheWeb() {
    for c in golden.highlightTitle {
      let tags = c.useFallback ? Highlight.tagsForHighlight(c.tags, learned: c.learned) : c.tags
      let got = Highlight.title(c.title, tags: tags).map { "\($0.highlighted ? "[" : "")\($0.text)|\($0.tag ?? "")" }
      let want = c.segments.map { "\($0.highlighted ? "[" : "")\($0.text)|\($0.tag ?? "")" }
      #expect(got == want, "title: \(c.title)")
    }
  }

  @Test func keywordHighlightsMatchTheWeb() {
    #expect(golden.highlightKeywords.count >= 40)
    for c in golden.highlightKeywords {
      let got = Highlight.keywords(c.text, tags: c.tags, learned: c.learned).map { "\($0.kind?.rawValue ?? "-"):\($0.text)" }
      let want = c.segments.map { "\($0.kind ?? "-"):\($0.text)" }
      #expect(got == want, "text: \(c.text)")
    }
  }
}
