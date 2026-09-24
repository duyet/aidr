import { describe, expect, it } from "vitest";
import {
  buildMediaManifest,
  canonicalizeMediaUrl,
  firstImageUrl,
  MAX_MEDIA_ASSETS,
  MAX_MEDIA_URL_LENGTH,
  parseMediaManifest,
  parseMediaMetadata,
  serializeMediaManifest,
} from "../media.js";

describe("canonicalizeMediaUrl", () => {
  it("normalizes host casing, fragments, tracking parameters, and query order", () => {
    expect(
      canonicalizeMediaUrl(
        " HTTPS://IMG.Example.test:443/story.jpg?b=2&amp;utm_source=rss&a=1#hero "
      )
    ).toBe("https://img.example.test/story.jpg?a=1&b=2");
  });

  it("rejects non-http, private, credentialed, and oversized URLs", () => {
    expect(canonicalizeMediaUrl("data:image/png;base64,abc")).toBeNull();
    expect(canonicalizeMediaUrl("http://127.0.0.1/image.jpg")).toBeNull();
    expect(
      canonicalizeMediaUrl("http://user:pass@example.com/image.jpg")
    ).toBeNull();
    expect(
      canonicalizeMediaUrl(
        `https://example.com/${"x".repeat(MAX_MEDIA_URL_LENGTH)}`
      )
    ).toBeNull();
  });
});

describe("buildMediaManifest", () => {
  it("keeps image/video typing and nests a single video poster", () => {
    const manifest = buildMediaManifest([
      { type: "image", url: "https://example.com/hero.jpg", priority: 1 },
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://example.com/poster.jpg",
        priority: 2,
      },
      { type: "image", url: "https://example.com/poster.jpg", priority: 3 },
    ]);

    expect(manifest.assets).toEqual([
      { type: "image", url: "https://example.com/hero.jpg" },
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://example.com/poster.jpg",
      },
    ]);
    expect(
      manifest.assets.filter((asset) => asset.type === "image")
    ).toHaveLength(1);
  });

  it("removes canonical and resized duplicates deterministically", () => {
    const manifest = buildMediaManifest([
      { type: "image", url: "https://img.example/story.jpg?w=1200" },
      { type: "image", url: "https://IMG.example/story.jpg?w=300" },
      { type: "image", url: "https://img.example/story.jpg#fragment" },
    ]);
    expect(manifest.assets).toEqual([
      { type: "image", url: "https://img.example/story.jpg?w=1200" },
    ]);
  });

  it("drops generic logos and caps the ordered asset list", () => {
    const candidates = Array.from({ length: MAX_MEDIA_ASSETS + 4 }, (_, i) => ({
      type: "image" as const,
      url: `https://img.example/story-${i}.jpg`,
    }));
    candidates.push({ type: "image", url: "https://example.com/logo.png" });
    const manifest = buildMediaManifest(candidates);
    expect(manifest.assets).toHaveLength(MAX_MEDIA_ASSETS);
    expect(manifest.assets.some((asset) => asset.url.includes("logo"))).toBe(
      false
    );
  });
});

describe("parseMediaMetadata", () => {
  it("collects OG/Twitter, video, and valid JSON-LD candidates", () => {
    const candidates = parseMediaMetadata(`
      <meta property="og:image" content="https://example.com/hero.jpg">
      <meta name="twitter:image" content="https://example.com/alt.jpg">
      <meta property="og:video" content="https://example.com/story.mp4">
      <script type="application/ld+json">
        {"@type":"VideoObject","contentUrl":"https://example.com/story.mp4",
         "thumbnailUrl":"https://example.com/poster.jpg"}
      </script>
    `);
    const manifest = buildMediaManifest(candidates);
    expect(manifest.assets.map((asset) => asset.type)).toEqual([
      "image",
      "image",
      "video",
    ]);
    expect(
      manifest.assets.find((asset) => asset.type === "video")
    ).toMatchObject({
      type: "video",
      poster_url: "https://example.com/poster.jpg",
    });
    expect(firstImageUrl(manifest)).toBe("https://example.com/hero.jpg");
  });

  it("ignores malformed JSON-LD while retaining valid metadata", () => {
    const candidates = parseMediaMetadata(`
      <meta property="og:image" content="https://example.com/hero.jpg">
      <script type="application/ld+json">{not json}</script>
    `);
    expect(buildMediaManifest(candidates).assets).toEqual([
      { type: "image", url: "https://example.com/hero.jpg" },
    ]);
  });
});

describe("stored media manifests", () => {
  it("treats malformed JSON as empty and falls back to legacy image_url", () => {
    const manifest = parseMediaManifest(
      "{not-json",
      "https://img.example/legacy.jpg?b=2&amp;a=1"
    );
    expect(manifest.assets).toEqual([
      { type: "image", url: "https://img.example/legacy.jpg?a=1&b=2" },
    ]);
  });

  it("uses a legacy image when a valid manifest contains only video", () => {
    const manifest = parseMediaManifest(
      JSON.stringify({
        version: 1,
        assets: [{ type: "video", url: "https://example.com/story.mp4" }],
      }),
      "https://img.example/legacy.jpg"
    );
    expect(manifest.assets).toEqual([
      { type: "image", url: "https://img.example/legacy.jpg" },
      { type: "video", url: "https://example.com/story.mp4" },
    ]);
  });

  it("serializes a bounded normalized shape", () => {
    const serialized = serializeMediaManifest({
      version: 1,
      assets: [
        { type: "image", url: "https://example.com/a.jpg?utm_source=x" },
        { type: "video", url: "https://example.com/v.mp4" },
      ],
    });
    expect(JSON.parse(serialized)).toEqual({
      version: 1,
      assets: [
        { type: "image", url: "https://example.com/a.jpg" },
        { type: "video", url: "https://example.com/v.mp4" },
      ],
    });
  });
});
