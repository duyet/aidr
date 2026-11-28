import SafariServices
import SwiftUI

/// A link to show in SFSafariViewController.
struct StoryLink: Identifiable {
  let url: URL
  var id: URL { url }
}

struct StorySafariView: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    SFSafariViewController(url: url)
  }

  func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

enum StoryLinks {
  /// The web's own submit page: no account needed, no new endpoint.
  static let submit = URL(string: "https://aidr.today/submit")!
}
