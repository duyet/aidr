import AIDRKit
import Testing

/// Cases from apps/web/src/lib/topic-color.test.ts and highlight tests that
/// state intent, on top of the golden comparison.
struct TopicColorTests {
  @Test func tagColorIgnoresCaseAndSpace() {
    #expect(Topic.color(forTag: " GPT-5 ") == Topic.color(forTag: "gpt-5"))
    #expect(Topic.color(forTag: "ANTHROPIC") == Topic.color(forTag: "anthropic"))
    #expect(Topic.palette.contains(Topic.color(forTag: "robotics")))
  }

  @Test func categoriesShareOnlyTheThreeNamedHues() {
    let shared: Set = ["Frameworks", "Data", "Open Source"]
    let distinct = Set(Topic.categoryNames.filter { !shared.contains($0) }.map { Topic.color(forCategory: $0) })
    #expect(distinct.count == Topic.categoryNames.count - shared.count)
    #expect(Topic.color(forCategory: "Frameworks") == Topic.color(forCategory: "Chips"))
    #expect(Topic.color(forCategory: "Data") == Topic.color(forCategory: "Products"))
    #expect(Topic.color(forCategory: "Open Source") == Topic.color(forCategory: "Releases"))
  }

  @Test func unknownCategoryStaysNeutral() {
    for name in ["", "  ", "uncategorized", "toString", nil] as [String?] {
      #expect(Topic.color(forCategory: name) == Topic.neutral)
    }
    #expect(Topic.isKnownCategory(" research "))
    #expect(!Topic.isKnownCategory("toString"))
  }

  @Test func vietnameseCategoryLabels() {
    #expect(Topic.label("Regulation", lang: .vi) == "Chính sách")
    #expect(Topic.label("Regulation", lang: .en) == "Regulation")
    #expect(Topic.label("Something", lang: .vi) == "Something")
  }

  @Test func highlightKeepsBrandFragmentsPlain() {
    let highlighted = Highlight.title("SpaceXAI Opens Grok Build to All", tags: ["SpaceX", "xAI", "Grok"])
      .filter(\.highlighted).map(\.text)
    #expect(highlighted == ["Grok"])
  }

  @Test func numbersNeedAUnit() {
    let text = "In 2026 GPT-5 raised $11B, up 30%."
    let nums = Highlight.keywords(text).filter { $0.kind == .num }.map(\.text)
    #expect(nums == ["$11B", "30%"])
  }
}
