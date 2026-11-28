import Observation

/// App-wide UI state that outlives a preference rebuild of the tab tree.
@MainActor
@Observable
final class AppState {
  /// Set to show the Customize/Settings sheet from anywhere.
  var showSettings = false
  /// A story to open, e.g. from a notification tap. The Today tab pushes it
  /// and clears it.
  var pendingStoryID: String?
}
