import AIDRKit
import Foundation
import Testing

/// The story page reads the way the web's story page does. Fixture: a real
/// story with a Vietnamese title and summary, 7 source rows (one a discussion).
struct StoryDetailTests {
  func story() throws -> Item { try APIClient.decode(Item.self, from: Fixtures.data("story")) }

  func item(_ json: String) throws -> Item { try APIClient.decode(Item.self, from: Data(json.utf8)) }

  // MARK: Meta line

  @Test func metaLineReadsTheAudienceDayAndClockNotTheDeviceZone() throws {
    let story = try story()
    // 1795797467 is 2026-11-27 16:37 UTC, which is 23:37 on the 27th in Ho Chi Minh City.
    let vi = StoryDetail.meta(story, lang: .vi)
    #expect(vi.topic == "AGENTS")
    #expect(vi.parts == ["27 THG 11, 2026", "23:37", "6 NGUỒN"])
    let en = StoryDetail.meta(story, lang: .en)
    #expect(en.parts == ["NOV 27, 2026", "23:37", "6 SOURCES"])
    #expect(vi.topicColor == Topic.color(forCategory: "Agents"))
  }

  @Test func discussionThreadsAreNotOutlets() throws {
    let story = try story()
    #expect(story.sources.count == 7)
    #expect(StoryDetail.outlets(story) == 6)
  }

  @Test func oneSourceIsSingular() throws {
    let one = try item(#"{"id":"abcdef123","url":"https://a.b/x","title":"T","sources":[{"kind":"source","url":"https://a.b/x"}]}"#)
    #expect(StoryDetail.meta(one, lang: .en).parts == ["1 SOURCE"])
  }

  // MARK: Headline and summary

  @Test func headlineMarksAnEnglishOriginalOnAVietnameseStory() throws {
    let story = try story()
    let own = try #require(StoryDetail.headline(story, lang: .vi))
    #expect(own.text == story.titleVi)
    #expect(!own.isOriginal)
    let untranslated = try item(#"{"id":"abcdef123","url":"https://a.b","title":"Only English","title_vi":null}"#)
    let original = try #require(StoryDetail.headline(untranslated, lang: .vi))
    #expect(original.text == "Only English")
    #expect(original.isOriginal)
    let english = try #require(StoryDetail.headline(untranslated, lang: .en))
    #expect(english.text == "Only English")
    #expect(!english.isOriginal)
  }

  @Test func englishNeverReceivesVietnamese() throws {
    let onlyVi = try item(#"{"id":"abcdef123","url":"https://a.b","title":"","title_vi":"Chỉ tiếng Việt"}"#)
    #expect(StoryDetail.headline(onlyVi, lang: .en) == nil)
  }

  @Test func wireMarkersAreStrippedButPlainWordsAreNot() {
    #expect(StoryDetail.stripTitleMarker("Update: OpenAI ships a model") == "OpenAI ships a model")
    #expect(StoryDetail.stripTitleMarker("BREAKING NEWS: Nvidia earnings") == "Nvidia earnings")
    #expect(StoryDetail.stripTitleMarker("Cập nhật: Claude mới") == "Claude mới")
    #expect(StoryDetail.stripTitleMarker("Update to Gemini lands") == "Update to Gemini lands")
    #expect(StoryDetail.stripTitleMarker("Update:") == "Update:")
  }

  @Test func summaryNeverFallsBackToTheOtherLanguage() throws {
    let story = try story()
    #expect(!StoryDetail.summary(story, lang: .vi).isEmpty)
    #expect(StoryDetail.summaryText(story, lang: .vi) == story.summaryVi)
    let englishOnly = try item(#"{"id":"abcdef123","url":"https://a.b","title":"T","summary":"English only","summary_vi":null}"#)
    #expect(StoryDetail.summary(englishOnly, lang: .vi).isEmpty)
    #expect(StoryDetail.summary(englishOnly, lang: .en) == ["English only"])
  }

  @Test func paragraphsSplitOnBlankLines() {
    #expect(StoryDetail.paragraphs("One.\n\n\nTwo.\nStill two.\n\n  \n\nThree.") == ["One.", "Two.\nStill two.", "Three."])
    #expect(StoryDetail.paragraphs(nil).isEmpty)
  }

  // MARK: Byline and sources

  @Test func bylineNamesThePublisherHostWithoutWww() throws {
    let story = try story()
    #expect(StoryDetail.byline(story, lang: .vi) == "Từ marketbrief.now")
    #expect(StoryDetail.byline(story, lang: .en) == "From marketbrief.now")
    let signed = try item(
      #"{"id":"abcdef123","url":"https://www.wsj.com/a","title":"T","sources":[{"kind":"source","author":"Berber Jin","url":"https://www.wsj.com/a"}]}"#)
    #expect(StoryDetail.byline(signed, lang: .en) == "By Berber Jin · wsj.com")
    #expect(StoryDetail.byline(signed, lang: .vi) == "Từ Berber Jin · wsj.com")
  }

  @Test func sourcesListTheArticleAndSourceRowsThenFoldTheRest() throws {
    let story = try story()
    let groups = StoryDetail.sources(story)
    #expect(groups.main.map(\.label) == ["marketbrief.now", "@jakozloski", "@jakozloski", "huggingnews", "@hn"])
    #expect(groups.more.map(\.kind) == ["support", "support", "discussion"])
    #expect(groups.more.map(\.label) == ["@mark_k", "@johnennis", "doctoboggan"])
    #expect(groups.main[1].quote?.hasPrefix("Claude silently added rules") == true)
    #expect(groups.main.allSatisfy { $0.url != nil })
    #expect(Set((groups.main + groups.more).map(\.id)).count == groups.main.count + groups.more.count)
  }

  @Test func theSameLinkIsListedOnce() throws {
    let twice = try item(
      #"{"id":"abcdef123","url":"https://a.b/x","title":"T","sources":[{"kind":"source","author":"Ann","url":"https://a.b/x"},{"kind":"source","author":"Ann","url":"https://a.b/x"}]}"#)
    #expect(StoryDetail.sources(twice).main.map(\.label) == ["Ann"])
  }

  @Test func onlyWebLinksCanOpenInSafari() {
    #expect(StoryDetail.safeURL("https://aidr.today/submit") != nil)
    #expect(StoryDetail.safeURL("javascript:alert(1)") == nil)
    #expect(StoryDetail.safeURL("file:///etc/passwd") == nil)
    #expect(StoryDetail.safeURL("  ") == nil)
    #expect(StoryDetail.safeURL(nil) == nil)
    #expect(StoryDetail.publisherHost(URL(string: "https://www.Techmeme.com/x")) == "techmeme.com")
  }

  // MARK: Copy and share

  @Test func copyAIDRMatchesTheWebFormat() throws {
    let story = try story()
    let link = "https://aidr.today/138a03cd?lang=vi&utm_source=share&utm_medium=social&utm_campaign=story&utm_content=aidr-138a03cd"
    #expect(
      StoryShare.copyText(story, lang: .vi)
        == "\(story.titleVi!)\n\nAI;DR: \(story.summaryVi!)\n\n\(link)")
    #expect(StoryShare.copyText(story, lang: .en).hasSuffix("?lang=en&utm_source=share&utm_medium=social&utm_campaign=story&utm_content=aidr-138a03cd"))
  }

  @Test func copyWithoutASummaryIsTitleAndLink() throws {
    let bare = try item(#"{"id":"abcdef123456","url":"https://a.b","title":"Only title","summary":null}"#)
    #expect(
      StoryShare.copyText(bare, lang: .en)
        == "Only title\nhttps://aidr.today/abcdef12?lang=en&utm_source=share&utm_medium=social&utm_campaign=story&utm_content=aidr-abcdef12")
  }

  @Test func shareLinkCarriesItsOwnSlot() throws {
    let story = try story()
    #expect(StoryShare.link(story, lang: .vi, slot: "link").absoluteString.hasSuffix("utm_content=link-138a03cd"))
  }
}
