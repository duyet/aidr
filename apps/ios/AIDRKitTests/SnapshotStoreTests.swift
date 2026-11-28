import AIDRKit
import Foundation
import Testing

/// Launch paints from the last good feed, so a relaunch offline still shows
/// the edition.
struct SnapshotStoreTests {
  let dir = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)

  @Test func savedFeedComesBack() throws {
    let store = SnapshotStore(directory: dir)
    #expect(store.load() == nil)
    let data = try Fixtures.data("feed")
    try store.save(data)
    let loaded = try #require(SnapshotStore(directory: dir).load())
    #expect(loaded == (try Fixtures.feed()))
  }

  @Test func corruptSnapshotReadsAsEmpty() throws {
    let store = SnapshotStore(directory: dir)
    try store.save(Data("{not json".utf8))
    #expect(store.load() == nil)
  }

  @Test func defaultLocationIsApplicationSupport() {
    #expect(SnapshotStore().fileURL.path().contains("Application Support/AIDR/feed.json"))
  }
}
