import UIKit

/// Downloads a story image. The URLCache keeps it, so a revisit paints the
/// hero from disk, and the share card draws from the same bytes.
@MainActor
enum StoryImageLoader {
  static func load(_ url: URL) async -> UIImage? {
    var request = URLRequest(url: url)
    request.cachePolicy = .returnCacheDataElseLoad
    request.timeoutInterval = 20
    guard let (data, response) = try? await URLSession.shared.data(for: request) else { return nil }
    if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { return nil }
    return UIImage(data: data)
  }
}
