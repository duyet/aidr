import SwiftUI

struct RootView: View {
  var body: some View {
    TabView {
      Tab("Today", systemImage: "newspaper") { Text("Today").accessibilityIdentifier("today") }
      Tab("Weeks", systemImage: "calendar.day.timeline.left") { Text("Weeks") }
      Tab("Calendar", systemImage: "calendar") { Text("Calendar") }
      Tab("AI;DR", systemImage: "text.alignleft") { Text("AI;DR") }
    }
  }
}
