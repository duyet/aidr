import AIDRKit
import Foundation
import Testing

struct TodaySearchTests {
  static let items: [Item] = {
    [
      try! TodayModelTests.item("1", title: "Nvidia unveils a new chip", titleVi: "Nvidia ra mắt chip mới", category: "Chips", tags: ["nvidia"], summary: "Faster inference.", summaryVi: "Suy luận nhanh hơn."),
      try! TodayModelTests.item("2", title: "OpenAI ships a model", titleVi: "OpenAI phát hành mô hình", category: "Models", tags: ["openai"], summary: "Nvidia hardware runs it."),
      try! TodayModelTests.item("3", title: "Người dùng Việt đông hơn", titleVi: "Người dùng Việt đông hơn", category: "Industry"),
      try! TodayModelTests.item("1", title: "Duplicate id", category: "Chips"),
    ]
  }()

  @Test func titleHitsOutrankSummaryHitsAndTiesKeepFeedOrder() {
    let index = SearchIndex(items: Self.items)
    #expect(index.count == 3)
    #expect(index.search("nvidia").map(\.id) == ["1", "2"])
    #expect(index.search("ai").map(\.id).first == "2")
  }

  @Test func caseAndAccentsDoNotMatter() {
    let index = SearchIndex(items: Self.items)
    #expect(index.search("NGUOI DUNG").map(\.id) == ["3"])
    #expect(index.search("dong").map(\.id) == ["3"])
    #expect(index.search("việt").map(\.id) == ["3"])
  }

  @Test func everyWordMustMatchAndTagsAndCategoriesCount() {
    let index = SearchIndex(items: Self.items)
    #expect(index.search("nvidia chip").map(\.id) == ["1"])
    #expect(index.search("nvidia banana").isEmpty)
    #expect(index.search("models").map(\.id) == ["2"])
    #expect(index.search("   ").isEmpty)
  }

  @Test func searchesBothLanguageColumns() {
    let index = SearchIndex(items: Self.items)
    #expect(index.search("suy luan").map(\.id) == ["1"])
    #expect(index.search("inference").map(\.id) == ["1"])
  }

  @Test func coversEveryLoadedDay() throws {
    let feed = try Fixtures.feed()
    let index = SearchIndex(feed: feed)
    #expect(index.count == Set(feed.days.flatMap(\.items).map(\.id)).count)
    let older = try #require(feed.days.last?.items.first)
    #expect(index.search(older.title).map(\.id).contains(older.id))
  }
}
