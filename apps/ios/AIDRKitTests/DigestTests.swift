import AIDRKit
import Foundation
import Testing

struct DigestTests {
  @Test func todayShowsEightRowsWithTopicsAndThumbnails() throws {
    let feed = try Fixtures.feed()
    for lang in [Lang.en, .vi] {
      let rows = Digest.rows(feed, lang: lang)
      #expect(rows.count == 8)
      #expect(rows.map(\.rank) == Array(1...8))
      #expect(rows.allSatisfy { $0.topic != nil && $0.topicColor != nil })
      #expect(rows.filter { $0.thumbnail != nil }.count >= 6)
    }
  }

  @Test func vietnameseRowsUseTheVietnameseBullets() throws {
    let feed = try Fixtures.feed()
    let tldr = try #require(feed.tldr)
    #expect(Digest.rows(feed, lang: .vi).map(\.text) == tldr.bulletsVi.prefix(8).map(\.text))
    #expect(Digest.rows(feed, lang: .en).map(\.text) == tldr.bulletsEn.prefix(8).map(\.text))
  }

  @Test func englishOnlyVietnameseColumnShowsNothing() {
    let english = [Bullet(text: "OpenAI ships a model", itemIds: []), Bullet(text: "Nvidia earnings", itemIds: [])]
    let tldr = Tldr(date: "2026-11-28", bulletsEn: english, bulletsVi: english)
    #expect(Digest.bullets(tldr, lang: .vi).isEmpty)
    #expect(Digest.bullets(tldr, lang: .en).count == 2)
    let thin = Tldr(date: "2026-11-28", bulletsEn: english, bulletsVi: [Bullet(text: "Một tin", itemIds: [])])
    #expect(Digest.bullets(thin, lang: .vi).isEmpty)
  }

  @Test func untaggedStoryTakesItsCategoryColor() throws {
    let feed = try Fixtures.feed()
    let items = feed.itemsById
    for row in Digest.rows(feed, lang: .en) {
      let item = try #require(row.itemId.flatMap { items[$0] })
      if item.tags.isEmpty {
        #expect(row.topicColor == Topic.color(forCategory: item.category))
      } else {
        #expect(row.topic == item.tags[0])
        #expect(row.topicColor == Topic.color(forTag: item.tags[0]))
      }
    }
  }

  @Test func dayBlockReadsLikeTheWeb() throws {
    let en = try #require(EditionDate.parts("2026-11-28", lang: .en))
    #expect(en.day == "28")
    #expect(en.line == "SATURDAY · NOVEMBER 2026")
    let vi = try #require(EditionDate.parts("2026-11-28", lang: .vi))
    #expect(vi.day == "28")
    #expect(vi.line.hasPrefix("THỨ BẢY · "))
    #expect(vi.line.hasSuffix("11 2026"))
    #expect(EditionDate.parts("not a date", lang: .en) == nil)
  }
}
