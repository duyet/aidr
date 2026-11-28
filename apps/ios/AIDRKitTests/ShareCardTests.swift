import AIDRKit
import SwiftUI
import Testing
import UIKit

/// The share image: 3x pixels for every aspect, a real PNG, and a background
/// that changes what is drawn.
@MainActor
struct ShareCardTests {
  func content(image: UIImage? = nil, summary: String = "A short AI;DR summary of $11B in funding.") -> ShareCardContent {
    ShareCardContent(
      topic: "AGENTS", topicColor: Topic.color(forCategory: "Agents"), dateLine: "27 THG 11, 2026",
      headline: "Anthropic raises $11B for Claude", tags: ["anthropic", "claude"], summary: summary, image: image)
  }

  func solidImage() -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: 120, height: 75)).image { context in
      UIColor.systemTeal.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 120, height: 75))
    }
  }

  @Test func everyAspectRendersAtThreeTimesItsSize() throws {
    let expected: [ShareCardAspect: CGSize] = [
      .portrait: CGSize(width: 1080, height: 1350),
      .square: CGSize(width: 1080, height: 1080),
      .story: CGSize(width: 1080, height: 1920),
    ]
    for aspect in ShareCardAspect.allCases {
      var style = ShareCardStyle()
      style.aspect = aspect
      let image = try #require(ShareCardRenderer.render(content(), style: style), "\(aspect) did not render")
      #expect(CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale) == expected[aspect])
      #expect(aspect.pixelSize == expected[aspect])
    }
  }

  @Test func theOutputIsAPNG() throws {
    let image = try #require(ShareCardRenderer.render(content(), style: ShareCardStyle()))
    let png = try #require(image.pngData())
    #expect(png.prefix(8) == Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
  }

  @Test func theBackgroundChangesThePixels() throws {
    var yellow = ShareCardStyle()
    yellow.background = .gradient(0)
    var ink = ShareCardStyle()
    ink.background = .solid(1)
    let a = try #require(ShareCardRenderer.render(content(), style: yellow)?.pngData())
    let b = try #require(ShareCardRenderer.render(content(), style: ink)?.pngData())
    #expect(a != b)
  }

  @Test func theBlurBackgroundUsesTheStoryImage() throws {
    var style = ShareCardStyle()
    style.background = .blur
    let withImage = try #require(ShareCardRenderer.render(content(image: solidImage()), style: style)?.pngData())
    let without = try #require(ShareCardRenderer.render(content(), style: style)?.pngData())
    #expect(withImage != without, "blur must draw the image, and fall back to a gradient without one")
  }

  @Test func aStoryWithoutASummaryStillRenders() throws {
    #expect(ShareCardRenderer.render(content(summary: ""), style: ShareCardStyle()) != nil)
  }

  @Test func swatchesOfferSixGradientsAndSixSolids() {
    #expect(ShareCardPalette.gradients.count == 6)
    #expect(ShareCardPalette.solids.count == 6)
    #expect(ShareCardPalette.gradients[0].hex.first == "#f5c518", "the first gradient is the AI;DR yellow")
    #expect(ShareCardPalette.backgrounds(withBlur: true).first == .blur)
    #expect(ShareCardPalette.backgrounds(withBlur: false).count == 12)
    let ids = ShareCardPalette.backgrounds(withBlur: true).map(ShareCardPalette.identifier)
    #expect(Set(ids).count == ids.count)
  }

  @Test func defaultsSitInsideTheirSliders() {
    let style = ShareCardStyle()
    #expect(ShareCardStyle.paddingRange.contains(style.padding))
    #expect(ShareCardStyle.radiusRange.contains(style.cornerRadius))
    #expect(ShareCardStyle.shadowRange.contains(style.shadow))
    #expect(style.aspect == .portrait)
  }
}
