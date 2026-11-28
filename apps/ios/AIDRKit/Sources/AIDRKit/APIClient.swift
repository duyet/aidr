import Foundation

public enum APIError: Error, Equatable {
  case http(status: Int)
}

/// Who is asking, so the server can count requests per client. It sends the
/// app name and version, never a device or user identifier; the server keeps
/// only a per-client request count and the version.
public struct ClientIdentity: Sendable, Equatable {
  public let version: String
  public let build: String
  public let osVersion: String

  public init(version: String, build: String, osVersion: String) {
    self.version = version
    self.build = build
    self.osVersion = osVersion
  }

  public init(bundle: Bundle = .main, processInfo: ProcessInfo = .processInfo) {
    let info = bundle.infoDictionary ?? [:]
    let os = processInfo.operatingSystemVersion
    self.init(
      version: info["CFBundleShortVersionString"] as? String ?? "0.0.0",
      build: info["CFBundleVersion"] as? String ?? "0",
      osVersion: "\(os.majorVersion).\(os.minorVersion)"
    )
  }

  public static let headerName = "X-AIDR-Client"

  /// `ios/0.1.0+12`. The server accepts a numeric build only, so any other
  /// build string is left out rather than sent and rejected.
  public var header: String {
    let numeric = !build.isEmpty && build.allSatisfy { $0.isASCII && $0.isNumber }
    return "ios/\(version)" + (numeric ? "+\(build)" : "")
  }

  /// `AIDR-iOS/0.1.0 (build 12; iOS 26.5)`
  public var userAgent: String { "AIDR-iOS/\(version) (build \(build); iOS \(osVersion))" }
}

/// The public, unauthenticated JSON API of aidr.today.
public struct APIClient: Sendable {
  public static let production = URL(string: "https://aidr.today")!

  public let base: URL
  let session: URLSession
  public let identity: ClientIdentity

  public init(
    base: URL = APIClient.production,
    session: URLSession = .shared,
    identity: ClientIdentity = ClientIdentity()
  ) {
    self.base = base
    self.session = session
    self.identity = identity
  }

  public static func decoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return decoder
  }

  public static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
    try decoder().decode(type, from: data)
  }

  /// The feed and the raw bytes it was decoded from, so a caller can cache
  /// exactly what the server sent.
  public func feed(days: Int = 3) async throws -> (Feed, Data) {
    let data = try await get("api/feed", query: [URLQueryItem(name: "days", value: String(days))])
    return (try Self.decode(Feed.self, from: data), data)
  }

  public func publicEdition() async throws -> PublicEdition {
    try Self.decode(PublicEdition.self, from: await get("api/public"))
  }

  public func story(id: String) async throws -> Item {
    try Self.decode(Item.self, from: await get("api/story/\(id)"))
  }

  /// `week` is an ISO week such as "2026-W48".
  public func week(_ week: String) async throws -> Week {
    try Self.decode(Week.self, from: await get("api/week/\(week)"))
  }

  /// Every call goes through here, so each one names the app.
  public func urlRequest(_ path: String, query: [URLQueryItem] = []) -> URLRequest {
    var components = URLComponents(url: base.appending(path: path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { components.queryItems = query }
    var request = URLRequest(url: components.url!)
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(identity.header, forHTTPHeaderField: ClientIdentity.headerName)
    request.setValue(identity.userAgent, forHTTPHeaderField: "User-Agent")
    request.timeoutInterval = 20
    return request
  }

  func get(_ path: String, query: [URLQueryItem] = []) async throws -> Data {
    let (data, response) = try await session.data(for: urlRequest(path, query: query))
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else { throw APIError.http(status: status) }
    return data
  }
}
