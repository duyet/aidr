import AIDRKit
import Foundation
import Testing

struct APIClientTests {
  private let identity = ClientIdentity(version: "0.1.0", build: "12", osVersion: "26.5")

  @Test func everyRequestNamesTheIOSApp() throws {
    let client = APIClient(identity: identity)
    let paths = ["api/feed", "api/public", "api/story/abc", "api/week/2026-W48"]
    for path in paths {
      let request = client.urlRequest(path)
      #expect(request.value(forHTTPHeaderField: "X-AIDR-Client") == "ios/0.1.0+12", "\(path)")
      #expect(
        request.value(forHTTPHeaderField: "User-Agent") == "AIDR-iOS/0.1.0 (build 12; iOS 26.5)",
        "\(path)"
      )
    }
  }

  @Test func theDefaultIdentityStillCarriesTheIOSPrefix() throws {
    let request = APIClient().urlRequest("api/feed", query: [URLQueryItem(name: "days", value: "3")])
    let header = try #require(request.value(forHTTPHeaderField: "X-AIDR-Client"))
    #expect(header.hasPrefix("ios/"))
    #expect(request.url?.absoluteString == "https://aidr.today/api/feed?days=3")
  }

  @Test func aNonNumericBuildIsLeftOutSoTheServerStillCountsTheApp() {
    #expect(ClientIdentity(version: "0.1.0", build: "12a", osVersion: "26.5").header == "ios/0.1.0")
    #expect(ClientIdentity(version: "0.1.0", build: "", osVersion: "26.5").header == "ios/0.1.0")
  }
}
