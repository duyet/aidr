import SwiftUI

@main
struct AIDRApp: App {
  init() {
    // Thumbnails go through URLCache, so a relaunch paints them offline.
    URLCache.shared = URLCache(memoryCapacity: 50 * 1024 * 1024, diskCapacity: 200 * 1024 * 1024)
  }

  var body: some Scene {
    WindowGroup {
      RootView()
    }
  }
}
