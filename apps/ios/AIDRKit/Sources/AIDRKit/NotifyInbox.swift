import Observation

/// The story a tapped notification asked for. The notification delegate sets it;
/// the app shell shows the story and clears it.
@MainActor
@Observable
public final class NotifyInbox {
  public static let shared = NotifyInbox()

  public var storyID: String?

  public init() {}

  public func open(_ id: String) { storyID = id }
}
