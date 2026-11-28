import Foundation

/// Every screen a NavigationStack can push. Feature folders own the views;
/// RouteDestination maps each case to one.
enum Route: Hashable {
  case story(id: String)
  /// YYYY-MM-DD
  case day(date: String)
  /// ISO week, e.g. 2026-W48
  case week(id: String)
}
