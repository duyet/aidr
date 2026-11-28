import AIDRKit
import Foundation
import Testing

struct BriefDeckTests {
  @Test func deckRunsCoverStoriesEnd() throws {
    let feed = try Fixtures.feed()
    for lang in [Lang.en, .vi] {
      let deck = BriefDeck.build(feed: feed, lang: lang)
      #expect(deck.pages.map(\.id) == ["cover"] + (1...8).map { "story-\($0)" } + ["end"])
      guard case .cover(let cover) = deck.pages[0] else { Issue.record("no cover"); return }
      #expect(cover.date == "2026-11-28")
      #expect(cover.day == "28")
      #expect(cover.storyCount == 8)
      #expect(cover.minutes >= 1)
      #expect(deck.date == "2026-11-28")
    }
  }

  @Test func storiesAreTheDigestRowsInOrder() throws {
    let feed = try Fixtures.feed()
    let rows = Digest.rows(feed, lang: .vi)
    let deck = BriefDeck.build(feed: feed, lang: .vi)
    let stories: [BriefStory] = deck.pages.compactMap {
      if case .story(let story) = $0 { story } else { nil }
    }
    #expect(stories.map(\.row) == rows)
    #expect(stories.map(\.position) == Array(1...8))
    #expect(stories.allSatisfy { $0.total == 8 })
    #expect(stories.filter { $0.imageURL != nil }.count >= 6)
  }

  @Test func dayVideoSitsRightAfterTheCover() throws {
    let video = BriefVideo(id: "yABZuABIHNU", isShort: true, title: "Day")
    let deck = BriefDeck.build(feed: try Fixtures.feed(), lang: .en, video: video)
    #expect(deck.pages[1] == .video(video))
    #expect(deck.pages.count == 11)
  }

  @Test func withoutImagesEveryPageIsAGradient() throws {
    let deck = BriefDeck.build(feed: try Fixtures.feed(), lang: .en, withImages: false)
    for case .story(let story) in deck.pages { #expect(story.imageURL == nil) }
  }

  @Test func vietnameseNeverShowsTheEnglishDigest() {
    let english = [Bullet(text: "OpenAI ships a model", itemIds: []), Bullet(text: "Nvidia earnings", itemIds: [])]
    let tldr = Tldr(date: "2026-11-28", bulletsEn: english, bulletsVi: english)
    var feed = try! Fixtures.feed()
    feed.tldr = tldr
    #expect(BriefDeck.build(feed: feed, lang: .vi).isEmpty)
    #expect(BriefDeck.build(feed: feed, lang: .en).pages.count == 4)
  }

  @Test func teaserIsTheFirstSentenceCutAtAWord() {
    #expect(BriefDeck.teaser("Nvidia rose 4.6% today. Bloomberg ran a story.") == "Nvidia rose 4.6% today")
    #expect(BriefDeck.teaser("  ") == nil)
    let long = String(repeating: "word ", count: 40)
    let cut = BriefDeck.teaser(long) ?? ""
    #expect(cut.hasSuffix("word…"))
    #expect(cut.count <= 91)
  }

  @Test func shareLinkIsTheDayPageInTheReadersLanguage() {
    #expect(BriefDeck.shareURL(date: "2026-11-28", lang: .vi)?.absoluteString == "https://aidr.today/date/2026-11-28?lang=vi")
    #expect(BriefDeck.shareURL(date: "2026-11-28", lang: .en)?.absoluteString == "https://aidr.today/date/2026-11-28?lang=en")
  }
}
