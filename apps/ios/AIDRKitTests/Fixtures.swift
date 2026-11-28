import AIDRKit
import Foundation

/// Production JSON saved on 2026-11-28 (scripts/make-golden.ts reads the same feed).
enum Fixtures {
  final class Token {}

  static func data(_ name: String) throws -> Data {
    let bundle = Bundle(for: Token.self)
    guard let url = bundle.url(forResource: name, withExtension: "json") else {
      throw CocoaError(.fileNoSuchFile, userInfo: [NSFilePathErrorKey: name])
    }
    return try Data(contentsOf: url)
  }

  static func feed() throws -> Feed { try APIClient.decode(Feed.self, from: data("feed")) }
}
