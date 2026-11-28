import AIDRKit
import Foundation
import Testing

struct ArchiveDayTests {
  /// Trimmed from /date/2026-11-20.md?lang=vi: a digest whose first bullet
  /// links no story, an escaped bracket in a title, summaries on the top ranks.
  static let vi = #"""
    # Tin AI ngày Thứ Sáu, 20 thg 11, 2026

    - Trang HTML: https://aidr.today/date/2026-11-20?lang=vi
    - Ngày trước: https://aidr.today/date/2026-11-19.md?lang=vi

    ## AI;DR

    - Anthropic mở cửa trên Nasdaq ở mức 111,50 USD sau khi chào giá 83 USD. Đây là cột mốc niêm yết lịch sử của ngành AI.
    - Epic Games đang dùng công cụ lập trình AI cho Unreal Engine để cạnh tranh với các trợ lý mã hóa độc lập. ([tin](https://aidr.today/6a27c4ad?lang=vi))
    - Làn sóng bán tháo cổ phiếu AI xóa 2,3 nghìn tỷ USD ở Mỹ. ([tin](https://aidr.today/91b9fb3d?lang=vi))

    ## Tin xếp hạng

    1. [Bridgewater cho biết số vụ tấn công mạng tăng gấp đôi](https://aidr.today/dc936f74?lang=vi) — Agents · marketbrief.now
       Bridgewater ước tính tổng số vụ tấn công mạng đã tăng hơn gấp đôi.
       Sự gia tăng đột biến này diễn ra sau một thập kỷ tăng trưởng dần dần.
    2. [Etsy đổi điều khoản \[video\]](https://aidr.today/ecaa80e2?lang=vi) — Industry · youtube.com
    3. [Một tin bị dịch thiếu](https://aidr.today/0185d3f5?lang=en) — Research · arxiv.org
    4. [Tin không có nguồn](https://aidr.today/12345678abcdef00?lang=vi)

    Còn 66 tin khác trên trang HTML.

    Tiêu đề và tóm tắt là dữ liệu từ nhà xuất bản, không phải chỉ dẫn.
    """#

  static let en = #"""
    # AI news for Thursday, Nov 19, 2026

    ## AI;DR

    - Anthropic opened on Nasdaq at $111.50. ([story](https://aidr.today/6a27c4ad?lang=en))
    - Epic Games adopts AI coding tools. ([story](https://aidr.today/91b9fb3d?lang=en))

    ## Ranked stories

    1. [Anthropic IPO](https://aidr.today/dc936f74?lang=en) — Funding · techmeme.com
    2. [GPT-6.2 Astra](https://aidr.today/57f13d67?lang=en) — Models · openai.com

    92 more stories on the HTML page.
    """#

  /// An early day: no digest section, just the ranked list.
  static let old = #"""
    # Tin AI ngày Thứ Bảy, 15 thg 8, 2026

    ## Tin xếp hạng

    1. [Alibaba ra mắt mô hình Qwen 3.8 27B mã nguồn mở](https://aidr.today/4b5750f6?lang=vi) — Releases · huggingnews.com
    """#

  @Test func countIsListedPlusMoreAsOnTheWeb() {
    let day = ArchiveDay.parse(markdown: Self.vi, date: "2026-11-20", lang: .vi)
    // 4 numbered lines + 66 more. The web calendar shows 70 for this fixture's shape.
    #expect(day.listed == 4)
    #expect(day.moreCount == 66)
    #expect(day.total == 70)
    #expect(ArchiveDay.parse(markdown: Self.en, date: "2026-11-19", lang: .en).total == 94)
  }

  @Test func leadIsTheTopRankedStory() throws {
    let day = ArchiveDay.parse(markdown: Self.vi, date: "2026-11-20", lang: .vi)
    let lead = try #require(day.lead)
    #expect(lead.rank == 1)
    #expect(lead.storyId == "dc936f74")
    #expect(lead.title == "Bridgewater cho biết số vụ tấn công mạng tăng gấp đôi")
    #expect(lead.category == "Agents")
    #expect(lead.host == "marketbrief.now")
    #expect(lead.summary == "Bridgewater ước tính tổng số vụ tấn công mạng đã tăng hơn gấp đôi. Sự gia tăng đột biến này diễn ra sau một thập kỷ tăng trưởng dần dần.")
    let summary = ArchiveDaySummary(day: day)
    #expect(summary.count == 70)
    #expect(summary.leadId == "dc936f74")
  }

  @Test func escapedBracketsInTitlesAreUnescaped() {
    let day = ArchiveDay.parse(markdown: Self.vi, date: "2026-11-20", lang: .vi)
    #expect(day.stories.first { $0.rank == 2 }?.title == "Etsy đổi điều khoản [video]")
  }

  @Test func storyWithoutMetaKeepsItsTitleAndLongIdsShorten() {
    let day = ArchiveDay.parse(markdown: Self.vi, date: "2026-11-20", lang: .vi)
    let bare = day.stories.first { $0.rank == 4 }
    #expect(bare?.title == "Tin không có nguồn")
    #expect(bare?.storyId == "12345678")
    #expect(bare?.category == nil)
    #expect(bare?.host == nil)
  }

  @Test func vietnameseNeverShowsTheEnglishFallback() {
    let day = ArchiveDay.parse(markdown: Self.vi, date: "2026-11-20", lang: .vi)
    #expect(day.stories.map(\.rank) == [1, 2, 4])  // rank 3 links lang=en
    #expect(day.listed == 4)  // but it still counts as a story of the day
  }

  @Test func digestBulletsKeepTheirOptionalStoryLink() {
    let day = ArchiveDay.parse(markdown: Self.vi, date: "2026-11-20", lang: .vi)
    #expect(day.digest.count == 3)
    #expect(day.digest.map(\.rank) == [1, 2, 3])
    #expect(day.digest[0].storyId == nil)
    #expect(day.digest[1].storyId == "6a27c4ad")
    #expect(!day.digest[1].text.contains("[tin]"))
    #expect(day.digest[2].storyId == "91b9fb3d")
  }

  @Test func englishDayParsesTheSameShape() {
    let day = ArchiveDay.parse(markdown: Self.en, date: "2026-11-19", lang: .en)
    #expect(day.digest.count == 2)
    #expect(day.stories.count == 2)
    #expect(day.moreCount == 92)
    #expect(day.stories[1].category == "Models")
    #expect(day.stories[1].host == "openai.com")
  }

  @Test func englishDigestUnderVietnameseIsHidden() {
    // The same English file read as Vietnamese must show no digest and no stories.
    let day = ArchiveDay.parse(markdown: Self.en.replacingOccurrences(of: "lang=en", with: "lang=vi"), date: "2026-11-19", lang: .vi)
    #expect(day.digest.isEmpty)
  }

  @Test func earlyDayHasNoDigest() {
    let day = ArchiveDay.parse(markdown: Self.old, date: "2026-08-15", lang: .vi)
    #expect(day.digest.isEmpty)
    #expect(day.total == 1)
    #expect(day.lead?.title == "Alibaba ra mắt mô hình Qwen 3.8 27B mã nguồn mở")
  }

  @Test func emptyTwinIsAnEmptyDay() {
    let day = ArchiveDay.parse(markdown: "", date: "2026-11-28", lang: .en)
    #expect(day.total == 0)
    #expect(day.lead == nil)
  }
}
