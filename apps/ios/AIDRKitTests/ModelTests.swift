import AIDRKit
import Foundation
import Testing

/// The app decodes what production serves today; a field the server drops or
/// nulls must not blank the screen.
struct ModelTests {
  @Test func feedDecodes() throws {
    let feed = try Fixtures.feed()
    let tldr = try #require(feed.tldr)
    #expect(tldr.date == "2026-11-28")
    #expect(tldr.bulletsEn.count == 16)
    #expect(tldr.bulletsVi.count == 16)
    #expect(feed.days.count == 4)
    #expect(!feed.categories.isEmpty)
    #expect(!feed.learnedKeywords.isEmpty)
    // updatedAt is milliseconds, published_at is seconds: both land on the edition day.
    let calendar = Calendar(identifier: .gregorian)
    let updated = try #require(feed.updatedDate)
    #expect(calendar.component(.year, from: updated) == 2026)
    let item = try #require(feed.days.first?.items.first)
    #expect(calendar.component(.year, from: try #require(item.publishedDate)) == 2026)
  }

  @Test func publicStoryAndWeekDecode() throws {
    let edition = try APIClient.decode(PublicEdition.self, from: Fixtures.data("public"))
    #expect(!edition.stories.isEmpty)
    let story = try APIClient.decode(Item.self, from: Fixtures.data("story"))
    #expect(story.permalink != nil)
    #expect(!story.sources.isEmpty)
    let week = try APIClient.decode(Week.self, from: Fixtures.data("week"))
    #expect(week.week == "2026-W48")
    #expect(!week.stories.isEmpty)
  }

  @Test func titlesNeverFallBackAcrossLanguages() throws {
    let json = #"{"id":"x","url":"https://a.b","title":"Only English","title_vi":null}"#
    let item = try APIClient.decode(Item.self, from: Data(json.utf8))
    #expect(item.title(in: .en) == "Only English")
    #expect(item.title(in: .vi) == nil)
  }

  @Test func languageFollowsTheSystem() {
    #expect(Lang.preferred(["vi-VN", "en"]) == .vi)
    #expect(Lang.preferred(["vi"]) == .vi)
    #expect(Lang.preferred(["en-US", "vi"]) == .en)
    #expect(Lang.preferred(["fr"]) == .en)
    #expect(Lang.preferred([]) == .en)
  }
}
