import AIDRKit
import Foundation
import Testing

/// The "## Video" blocks below are copies of the live `/date/D.md?lang=L`
/// answers (2026-10-17 EN, 2026-10-15 VI). No day of the last six weeks has a
/// video, so these copies are the proof the parser reads the real shape.
struct BriefVideoTests {
  static let english = """
    # AI news for Saturday, Oct 17, 2026

    - HTML page: https://aidr.today/date/2026-10-17?lang=en

    ## Video

    Claude Mythos 5 makes circuits more efficient & more — 2026-10-17

    - YouTube: https://www.youtube.com/watch?v=55-XynJImRc
    - YouTube Shorts: https://www.youtube.com/shorts/yABZuABIHNU

    ## AI;DR

    - YouTube: https://www.youtube.com/watch?v=AAAAAAAAAAA
    """

  static let vietnamese = """
    ## Video

    TSMC lập thêm kỷ lục lợi nhuận và nhiều tin khác \\| 15/10/2026

    - YouTube: https://www.youtube.com/watch?v=awZlqVfdbuc

    ## AI;DR
    """

  @Test func aShortWinsOnAPhone() throws {
    let video = try #require(BriefVideo.parse(markdown: Self.english))
    #expect(video.id == "yABZuABIHNU")
    #expect(video.isShort)
    #expect(video.title == "Claude Mythos 5 makes circuits more efficient & more — 2026-10-17")
    #expect(video.watchURL.absoluteString == "https://www.youtube.com/shorts/yABZuABIHNU")
  }

  @Test func theLongVideoIsUsedWhenThereIsNoShort() throws {
    let video = try #require(BriefVideo.parse(markdown: Self.vietnamese))
    #expect(video.id == "awZlqVfdbuc")
    #expect(!video.isShort)
    #expect(video.title == "TSMC lập thêm kỷ lục lợi nhuận và nhiều tin khác | 15/10/2026")
    #expect(video.watchURL.absoluteString == "https://www.youtube.com/watch?v=awZlqVfdbuc")
  }

  @Test func aParsedVideoCarriesNoDayUntilTheClientSetsIt() throws {
    #expect(try #require(BriefVideo.parse(markdown: Self.english)).date == "")
  }

  @Test func aDayWithoutTheSectionHasNoVideo() {
    #expect(BriefVideo.parse(markdown: "# AI news\n\n## AI;DR\n\n- one\n") == nil)
    #expect(BriefVideo.parse(markdown: "") == nil)
  }

  @Test func onlyRealYoutubeIdsPass() {
    #expect(BriefVideo.parse(markdown: "## Video\n\n- YouTube: https://www.youtube.com/watch?v=short\n") == nil)
    #expect(BriefVideo.parse(markdown: "## Video\n\n- YouTube: https://example.com/watch?v=55-XynJImRc\n") == nil, "only youtube.com links count")
    #expect(BriefVideo.parse(markdown: "## Video\n\n- YouTube: https://www.youtube.com/watch?v=55-XynJIm\"><\n") == nil)
    #expect(BriefVideo.isYoutubeId("55-XynJImRc"))
    #expect(!BriefVideo.isYoutubeId("55-XynJImRc1"))
  }

  @Test func theLinkInTheOtherSectionIsIgnored() {
    let md = "## AI;DR\n\n- YouTube: https://www.youtube.com/watch?v=55-XynJImRc\n"
    #expect(BriefVideo.parse(markdown: md) == nil)
  }
}
