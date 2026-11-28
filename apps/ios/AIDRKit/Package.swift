// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "AIDRKit",
  platforms: [.iOS(.v26)],
  products: [.library(name: "AIDRKit", targets: ["AIDRKit"])],
  targets: [.target(name: "AIDRKit")]
)
