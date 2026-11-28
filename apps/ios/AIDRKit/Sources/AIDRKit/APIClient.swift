import Foundation

public enum APIError: Error, Equatable {
  case http(status: Int)
}

/// The public, unauthenticated JSON API of aidr.today.
public struct APIClient: Sendable {
  public static let production = URL(string: "https://aidr.today")!

  public let base: URL
  let session: URLSession

  public init(base: URL = APIClient.production, session: URLSession = .shared) {
    self.base = base
    self.session = session
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

  func get(_ path: String, query: [URLQueryItem] = []) async throws -> Data {
    var components = URLComponents(url: base.appending(path: path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { components.queryItems = query }
    var request = URLRequest(url: components.url!)
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.timeoutInterval = 20
    let (data, response) = try await session.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else { throw APIError.http(status: status) }
    return data
  }
}
