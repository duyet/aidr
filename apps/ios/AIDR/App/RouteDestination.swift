import AIDRKit
import SwiftUI

struct RouteDestination: View {
  let route: Route
  let lang: Lang

  var body: some View {
    switch route {
    case .story(let id): StoryScreen(id: id, lang: lang)
    case .day(let date): DayScreen(date: date, lang: lang)
    case .week(let id): WeekScreen(week: id, lang: lang)
    }
  }
}

extension View {
  /// Attach once inside each tab's NavigationStack.
  func routeDestinations(lang: Lang) -> some View {
    navigationDestination(for: Route.self) { RouteDestination(route: $0, lang: lang) }
  }
}
