import AIDRKit
import Foundation
import Testing

/// A story the reader opened once opens again with no network.
struct StoryCacheTests {
  let dir = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
  let id = "138a03cde6a5655d284787a812f1aee86afbc3cdfbacf15b361c0c50ea8a18c2"

  @Test func savedStoryComesBack() throws {
    let cache = StoryCache(directory: dir)
    #expect(cache.load(id: id) == nil)
    try cache.save(Fixtures.data("story"), id: id)
    let loaded = try #require(StoryCache(directory: dir).load(id: id))
    #expect(loaded == (try APIClient.decode(Item.self, from: Fixtures.data("story"))))
    #expect(loaded.summaryVi?.isEmpty == false)
  }

  @Test func eachStoryHasItsOwnFile() throws {
    let cache = StoryCache(directory: dir)
    try cache.save(Fixtures.data("story"), id: id)
    #expect(cache.load(id: "someotherstory") == nil)
  }

  @Test func corruptFileReadsAsEmpty() throws {
    let cache = StoryCache(directory: dir)
    try cache.save(Data("{not json".utf8), id: id)
    #expect(cache.load(id: id) == nil)
  }

  @Test func idsThatCouldLeaveTheFolderAreRefused() throws {
    let cache = StoryCache(directory: dir)
    for bad in ["../escape", "a/b", "", "a.b"] {
      #expect(throws: CocoaError.self) { try cache.save(Fixtures.data("story"), id: bad) }
      #expect(cache.load(id: bad) == nil)
    }
  }

  @Test func storiesLiveInCaches() {
    #expect(StoryCache().directory.path(percentEncoded: false).contains("Library/Caches/AIDR/stories"))
  }
}
