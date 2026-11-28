import AIDRKit
import Foundation
import Testing

struct TodayModelTests {
  static func item(_ id: String, title: String, titleVi: String? = nil, category: String? = nil, tags: [String] = [], summary: String? = nil, summaryVi: String? = nil) throws -> Item {
    var object: [String: Any] = ["id": id, "url": "https://www.example.com/\(id)", "title": title, "tags": tags]
    if let titleVi { object["title_vi"] = titleVi }
    if let category { object["category"] = category }
    if let summary { object["summary"] = summary }
    if let summaryVi { object["summary_vi"] = summaryVi }
    let data = try JSONSerialization.data(withJSONObject: object)
    return try APIClient.decode(Item.self, from: data)
  }

  @Test func dayHeadingReadsLikeTheWeb() throws {
    #expect(TodayFormat.dayHeading("2026-11-28", lang: .en) == "Saturday, Nov 28, 2026")
    let vi = try #require(TodayFormat.dayHeading("2026-11-28", lang: .vi))
    #expect(vi == "Thứ Bảy, 28 thg 11, 2026")
    #expect(TodayFormat.dayHeading("nope", lang: .en) == nil)
  }

  @Test func agoPortsTheWebsTimeAgo() {
    let now = Date(timeIntervalSince1970: 1_000_000)
    func ago(_ seconds: Double, _ lang: Lang, short: Bool = false) -> String {
      TodayFormat.ago(now.addingTimeInterval(-seconds), now: now, lang: lang, short: short)
    }
    #expect(ago(5, .en) == "1m ago")
    #expect(ago(9 * 60, .vi) == "9 phút trước")
    #expect(ago(9 * 3600, .en) == "9h ago")
    #expect(ago(9 * 3600, .vi, short: true) == "9 giờ")
    #expect(ago(9 * 3600, .en, short: true) == "9h")
    #expect(ago(3 * 86400, .vi) == "3 ngày trước")
    #expect(ago(-60, .en) == "1m ago")
  }

  @Test func summaryLine() {
    let now = Date(timeIntervalSince1970: 1_000_000)
    let updated = now.addingTimeInterval(-9 * 60)
    #expect(TodayFormat.summary(count: 30, updatedAt: updated, now: now, lang: .vi) == "30 tin · cập nhật 9 phút trước")
    #expect(TodayFormat.summary(count: 30, updatedAt: updated, now: now, lang: .en) == "30 stories · updated 9m ago")
    #expect(TodayFormat.summary(count: 30, updatedAt: nil, now: now, lang: .en) == "30 stories")
  }

  @Test func offlineNoteSaysWhenTheCopyWasSaved() {
    let saved = Date(timeIntervalSince1970: 1_000_000)
    let vi = TodayFormat.offlineNote(savedAt: saved, lang: .vi)
    #expect(vi.hasPrefix("Ngoại tuyến · bản lưu lúc "))
    #expect(vi.contains(":"))
    #expect(TodayFormat.offlineNote(savedAt: saved, lang: .en).hasPrefix("Offline · saved "))
    #expect(TodayFormat.offlineNote(savedAt: nil, lang: .en) == "Offline")
  }

  @Test func hostDropsWww() {
    #expect(TodayFormat.host("https://www.marktechpost.com/2026/11/28/x/") == "marktechpost.com")
    #expect(TodayFormat.host("https://the-decoder.com/a") == "the-decoder.com")
    #expect(TodayFormat.host("") == nil)
  }

  @Test func aStoryWithoutATitleInTheReadersLanguageIsLeftOut() throws {
    let items = [
      try Self.item("a", title: "English only"),
      try Self.item("b", title: "Both", titleVi: "Cả hai"),
    ]
    #expect(TodayStories.visible(items, lang: .en).map(\.id) == ["a", "b"])
    let vi = TodayStories.visible(items, lang: .vi)
    #expect(vi.map(\.id) == ["b"])
    #expect(vi.first?.title == "Cả hai")
  }

  @Test func chipsCountTodaysStoriesAndFilterTheList() throws {
    let feed = try Fixtures.feed()
    for lang in [Lang.en, .vi] {
      let today = TodayStories.today(feed, lang: lang)
      #expect(today.date == "2026-11-28")
      let chips = TodayStories.chips(today.stories)
      #expect(!chips.isEmpty)
      #expect(chips.map(\.count) == chips.map(\.count).sorted(by: >))
      #expect(chips.reduce(0) { $0 + $1.count } == today.stories.filter { !($0.item.category ?? "").isEmpty }.count)
      let first = try #require(chips.first)
      let filtered = TodayStories.filter(today.stories, category: first.name.uppercased())
      #expect(filtered.count == first.count)
      #expect(TodayStories.filter(today.stories, category: nil).count == today.stories.count)
    }
  }

  @Test func digestShowMoreStepsEightTwelveSixteen() throws {
    #expect(TodayDigest.steps == [8, 12, 16])
    #expect(TodayDigest.next(after: 8) == 12)
    #expect(TodayDigest.next(after: 12) == 16)
    #expect(TodayDigest.next(after: 16) == 16)
    let feed = try Fixtures.feed()
    #expect(TodayDigest.rows(feed, lang: .en, category: nil).count == 16)
  }

  @Test func digestFilterKeepsEachRowsOwnRank() throws {
    let feed = try Fixtures.feed()
    let items = feed.itemsById
    let all = TodayDigest.rows(feed, lang: .en, category: nil)
    var found: String?
    for row in all where found == nil {
      if let id = row.itemId, let category = items[id]?.category { found = category }
    }
    let category = try #require(found)
    let rows = TodayDigest.rows(feed, lang: .en, category: category)
    #expect(!rows.isEmpty)
    for row in rows {
      let item = try #require(row.itemId.flatMap { items[$0] })
      #expect(item.category == category)
      #expect(all.first { $0.rank == row.rank }?.text == row.text)
    }
  }

  @Test func summaryAndSecondTitleComeFromTheirOwnColumns() throws {
    let item = try Self.item("a", title: "Hello", titleVi: "Xin chào", summary: "English summary", summaryVi: "Tóm tắt")
    let vi = try #require(TodayStories.visible([item], lang: .vi, bilingual: true).first)
    #expect(vi.summary == "Tóm tắt")
    #expect(vi.secondTitle == "Hello")
    let en = try #require(TodayStories.visible([item], lang: .en).first)
    #expect(en.summary == "English summary")
    #expect(en.secondTitle == nil)
    let same = try Self.item("b", title: "Same", titleVi: "Same")
    #expect(TodayStories.visible([same], lang: .vi, bilingual: true).first?.secondTitle == nil)
  }

  @Test func tagFilterMatchesTagsAndTitlesAndCombinesWithCategory() throws {
    let a = try Self.item("a", title: "Nvidia earnings", category: "Chips", tags: ["nvidia"])
    let b = try Self.item("b", title: "Nvidia sues", titleVi: "Nvidia kiện", category: "Legal")
    let c = try Self.item("c", title: "Other", category: "Chips", tags: ["amd"])
    let stories = TodayStories.visible([a, b, c], lang: .en)
    #expect(TodayStories.filter(stories, category: nil, tag: "NVIDIA").map(\.id) == ["a", "b"])
    #expect(TodayStories.filter(stories, category: "chips", tag: "nvidia").map(\.id) == ["a"])
    #expect(TodayStories.filter(stories, category: "chips").map(\.id) == ["a", "c"])
    let json = #"[{"tag":"nvidia","count":40},{"tag":"Nvidia","count":3},{"tag":"zzz","count":9}]"#
    let trending = try APIClient.decode([TrendingTag].self, from: Data(json.utf8))
    #expect(TodayStories.tagChips(trending, stories: stories) == [TodayChip(name: "nvidia", count: 2)])
  }
}
