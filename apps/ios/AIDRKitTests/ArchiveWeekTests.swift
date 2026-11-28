import AIDRKit
import Foundation
import Testing

struct ArchiveWeekTests {
  static let json = #"""
    {"week":"2026-W46","issue":7,"start_date":"2026-11-09","end_date":"2026-11-15",
     "intro_en":"A busy week.","intro_vi":"  ","created_at":1794763853204,
     "stories":[
       {"rank":2,"item_id":"b2","text_en":"Second.","text_vi":null,"title":"Second","title_vi":null,"category":"Tools","source":"x.com","image_url":null,"votes":0},
       {"rank":1,"item_id":"a1","text_en":"First.","text_vi":"Thứ nhất.","title":"First","title_vi":"Một","category":"Models","source":"deepmind.google","image_url":"https://img.example/a.jpg","media_images":[],"days":[1],"votes":3}
     ]}
    """#

  @Test func decodesTheFieldsTheWeeklyPageNeeds() throws {
    let edition = try APIClient.decode(ArchiveWeekEdition.self, from: Data(Self.json.utf8))
    #expect(edition.week == "2026-W46")
    #expect(edition.issue == 7)
    #expect(edition.startDate == "2026-11-09")
    #expect(edition.updatedDate == Date(timeIntervalSince1970: 1794763853.204))
    #expect(!edition.isProvisional)
    #expect(edition.stories.count == 2)
    #expect(edition.stories.first { $0.rank == 1 }?.imageUrl == "https://img.example/a.jpg")
  }

  @Test func vietnameseSkipsWhatIsNotTranslated() throws {
    let edition = try APIClient.decode(ArchiveWeekEdition.self, from: Data(Self.json.utf8))
    #expect(edition.stories(in: .vi).map(\.itemId) == ["a1"])
    #expect(edition.stories(in: .en).map(\.itemId) == ["a1", "b2"])  // rank order, not file order
    #expect(edition.lead(in: .vi)?.title(in: .vi) == "Một")
    #expect(edition.lead(in: .en)?.title(in: .en) == "First")
    #expect(edition.intro(in: .en) == "A busy week.")
    #expect(edition.intro(in: .vi) == nil)  // blank, and never the English intro
  }

  @Test func provisionalFlagReads() throws {
    let open = Self.json.replacingOccurrences(of: "\"created_at\"", with: "\"provisional\":true,\"created_at\"")
    #expect(try APIClient.decode(ArchiveWeekEdition.self, from: Data(open.utf8)).isProvisional)
  }

  @Test func productionWeekAgreesWithTheCalendarRules() throws {
    let edition = try APIClient.decode(ArchiveWeekEdition.self, from: Fixtures.data("week"))
    #expect(edition.issue == ArchiveCalendar.issue(edition.week))
    let bounds = try #require(ArchiveCalendar.weekBounds(edition.week))
    #expect(edition.startDate == bounds.start)
    #expect(edition.endDate == bounds.end)
    #expect(!edition.stories.isEmpty)
    #expect(edition.lead(in: .en) != nil)
  }

  @Test func thumbnailAsksForTheStoryOwnImage() {
    let url = ArchiveClient().thumbURL(itemId: "abc", image: "https://x.com/a.jpg?w=1&h=2")
    #expect(url?.absoluteString == "https://aidr.today/api/thumb/abc?u=https%3A%2F%2Fx.com%2Fa.jpg%3Fw%3D1%26h%3D2")
    #expect(ArchiveClient().thumbURL(itemId: "abc", image: nil) == nil)
    #expect(ArchiveClient().thumbURL(itemId: "abc", image: "") == nil)
  }

  @Test func cacheKeepsADayForNextTime() throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: "archive-test-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cache = ArchiveDiskCache(directory: directory)
    let client = ArchiveClient(cache: cache)
    #expect(client.cachedDay("2026-11-20", lang: .vi) == nil)
    cache.write(Data(ArchiveDayTests.vi.utf8), name: "day-vi-2026-11-20.md")
    let day = try #require(client.cachedDay("2026-11-20", lang: .vi))
    #expect(day.total == 70)
    // The write time is kept beside the file, for the "Updated Xm ago" line.
    let savedAt = try #require(cache.fetchedAt("day-vi-2026-11-20.md"))
    #expect(abs(savedAt.timeIntervalSinceNow) < 60)
    #expect(client.dayFetchedAt("2026-11-20", lang: .vi) == savedAt)
    #expect(client.dayFetchedAt("2026-11-20", lang: .en) == nil)
    // The other language has its own file; nothing falls back.
    #expect(client.cachedDay("2026-11-20", lang: .en) == nil)
  }
}
