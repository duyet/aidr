import { describe, expect, it } from "vitest";
import {
  buildMediaManifest,
  canonicalizeMediaUrl,
  decodeUrlEntities,
  firstImageUrl,
  isGeneratedOgCard,
  isGenericImageUrl,
  MAX_MEDIA_ASSETS,
  MAX_MEDIA_URL_LENGTH,
  manifestWithoutArticleUrl,
  mergeMediaManifests,
  parseMediaManifest,
  parseMediaMetadata,
  primaryThumbnailUrl,
  serializeMediaManifest,
} from "../media.js";

describe("decodeUrlEntities", () => {
  it("decodes valid decimal and hex numeric entities", () => {
    expect(decodeUrlEntities("&#65;&#x42;&#x1F600;")).toBe("AB\u{1f600}");
  });

  it("leaves invalid and out-of-range numeric entities literal", () => {
    const invalid = "&#1114112; &#x110000; &#55296; &#xD800; &#x; &#; &#-1;";
    expect(decodeUrlEntities(invalid)).toBe(invalid);
  });
});

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
      canonicalizeMediaUrl("https://example.com:8443/image.jpg")
    ).toBeNull();
    expect(
      canonicalizeMediaUrl(
        `https://example.com/${"x".repeat(MAX_MEDIA_URL_LENGTH)}`
      )
    ).toBeNull();
  });

  it("rejects IPv4-compatible, mapped, translated, NAT64, and special IPv6 literals", () => {
    for (const url of [
      "https://[::127.0.0.1]/image.jpg",
      "https://[::ffff:127.0.0.1]/image.jpg",
      "https://[::ffff:0:127.0.0.1]/image.jpg",
      "https://[64:ff9b::127.0.0.1]/image.jpg",
      "https://[2002:7f00:1::]/image.jpg",
      "https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/image.jpg",
    ]) {
      expect(canonicalizeMediaUrl(url), url).toBeNull();
    }
  });

  it("preserves CDN signature parameters while removing tracking parameters", () => {
    expect(
      canonicalizeMediaUrl(
        "https://cdn.example/image.jpg?utm_source=feed&X-Amz-Signature=abc&X-Amz-Expires=60"
      )
    ).toBe(
      "https://cdn.example/image.jpg?X-Amz-Expires=60&X-Amz-Signature=abc"
    );
  });
});

describe("buildMediaManifest", () => {
  it("removes an article URL accidentally classified as a media asset", () => {
    const articleUrl = "https://example.com/article?utm_source=rss";
    const manifest = manifestWithoutArticleUrl(
      buildMediaManifest([
        { type: "image", url: articleUrl },
        { type: "image", url: "https://img.example/real.jpg" },
      ]),
      articleUrl
    );
    expect(manifest.assets).toEqual([
      { type: "image", url: "https://img.example/real.jpg" },
    ]);
    expect(primaryThumbnailUrl(manifest, articleUrl, articleUrl)).toBe(
      "https://img.example/real.jpg"
    );
  });

  it("merges manifests without erasing a richer existing video poster", () => {
    const existing = buildMediaManifest([
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://img.example/poster.jpg",
      },
    ]);
    const incoming = buildMediaManifest([
      { type: "image", url: "https://img.example/alternate.jpg" },
    ]);
    expect(mergeMediaManifests(existing, incoming).assets).toEqual([
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://img.example/poster.jpg",
      },
      { type: "image", url: "https://img.example/alternate.jpg" },
    ]);
  });

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

  it("keeps two different URLs even if they could serve the same bytes", () => {
    // Identity is the URL (host + path), never a content hash: the Worker does
    // not download media to compare it. A mirror or a renamed copy of the same
    // picture therefore stays as a second asset; only URL variants collapse.
    const manifest = buildMediaManifest([
      { type: "image", url: "https://img.example/story.jpg" },
      { type: "image", url: "https://mirror.example/story.jpg" },
      { type: "image", url: "https://img.example/copy-of-story.jpg" },
      { type: "image", url: "https://img.example/story.jpg?w=300" },
    ]);
    expect(manifest.assets.map((asset) => asset.url)).toEqual([
      "https://img.example/story.jpg",
      "https://mirror.example/story.jpg",
      "https://img.example/copy-of-story.jpg",
    ]);
  });

  it("drops generic logos and caps the ordered asset list", () => {
    const candidates = Array.from({ length: MAX_MEDIA_ASSETS + 4 }, (_, i) => ({
      type: "image" as const,
      url: `https://img.example/story-${i}.jpg`,
    }));
    candidates.push(
      { type: "image", url: "https://example.com/logo.png" },
      { type: "image", url: "https://example.com/favicon.png" },
      { type: "image", url: "https://example.com/site-icon.png" }
    );
    const manifest = buildMediaManifest(candidates);
    expect(manifest.assets).toHaveLength(MAX_MEDIA_ASSETS);
    expect(
      manifest.assets.some((asset) => /logo|favicon|site-icon/i.test(asset.url))
    ).toBe(false);
  });

  it("ignores unavailable/private candidates and keeps a valid legacy fallback", () => {
    const manifest = buildMediaManifest([
      { type: "image", url: "http://127.0.0.1/unavailable.jpg" },
      { type: "video", url: "https://example.com/story.mp4" },
    ]);
    expect(manifest.assets).toEqual([
      { type: "video", url: "https://example.com/story.mp4" },
    ]);
    expect(
      primaryThumbnailUrl(manifest, "https://legacy.example/image.jpg")
    ).toBe("https://legacy.example/image.jpg");
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

  it("keeps a video-only OG candidate and uses its poster as the thumbnail", () => {
    const manifest = buildMediaManifest(
      parseMediaMetadata(`
        <meta property="og:video" content="https://example.com/story.mp4">
        <meta property="og:video:secure_url" content="https://example.com/story.mp4">
      `)
    );
    expect(manifest.assets).toEqual([
      { type: "video", url: "https://example.com/story.mp4" },
    ]);
    expect(
      primaryThumbnailUrl(manifest, "https://legacy.example/old.jpg")
    ).toBe("https://legacy.example/old.jpg");
  });

  it("supports video-only JSON-LD with a nested poster", () => {
    const manifest = buildMediaManifest(
      parseMediaMetadata(`
        <script type="application/ld+json">
          {"@type":"VideoObject","contentUrl":"https://example.com/story.mp4",
           "thumbnailUrl":"https://example.com/poster.jpg"}
        </script>
      `)
    );
    expect(manifest.assets).toEqual([
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://example.com/poster.jpg",
      },
    ]);
    expect(primaryThumbnailUrl(manifest)).toBe(
      "https://example.com/poster.jpg"
    );
  });

  it("normalizes qualified JSON-LD @types and rejects article URLs", () => {
    const manifest = buildMediaManifest(
      parseMediaMetadata(`
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"https://schema.org/NewsArticle",
           "url":"https://example.com/article","image":["https://example.com/article"]}
        </script>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"https://schema.org/ImageObject",
           "contentUrl":"https://img.example/qualified.jpg"}
        </script>
      `)
    );
    expect(manifest.assets).toEqual([
      { type: "image", url: "https://img.example/qualified.jpg" },
    ]);
  });

  it("does not treat a NewsArticle/Article page URL as an image", () => {
    const manifest = buildMediaManifest(
      parseMediaMetadata(`
        <script type="application/ld+json">
          {"@type":"NewsArticle","url":"https://example.com/article",
           "headline":"A story"}
        </script>
      `)
    );
    expect(manifest.assets).toEqual([]);
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

  it("does not use a generic logo as the legacy image fallback", () => {
    const manifest = parseMediaManifest("[]", "https://img.example/logo.png");
    expect(manifest.assets).toEqual([]);
    expect(
      primaryThumbnailUrl(manifest, "https://img.example/logo.png")
    ).toBeNull();
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

  it("does not let stale legacy image_url override a video poster", () => {
    const manifest = parseMediaManifest(
      JSON.stringify({
        version: 1,
        assets: [
          {
            type: "video",
            url: "https://example.com/story.mp4",
            poster_url: "https://img.example/poster.jpg",
          },
        ],
      }),
      "https://img.example/stale.jpg?utm_source=old"
    );
    expect(manifest.assets).toEqual([
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://img.example/poster.jpg",
      },
    ]);
    expect(primaryThumbnailUrl(manifest, "https://img.example/stale.jpg")).toBe(
      "https://img.example/poster.jpg"
    );
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

describe("generated share cards", () => {
  const marketbrief = "https://marketbrief.now/og/prime-agent-rust.png";
  const huggingnews = "https://huggingnews.com/og/story.png";
  const original = "https://primeintellect.ai/images/prime-agent-rust.jpg";

  // A cluster merges every source page's og:image. Aggregators render a
  // headline-on-card image per story, which says nothing the dialog does
  // not already say; only the original article's picture belongs there.
  it("drops aggregator cards when the cluster has a real image", () => {
    const merged = mergeMediaManifests(
      buildMediaManifest([{ type: "image", url: marketbrief }]),
      buildMediaManifest([{ type: "image", url: huggingnews }]),
      buildMediaManifest([{ type: "image", url: original }])
    );
    expect(merged.assets).toEqual([{ type: "image", url: original }]);
  });

  it("keeps cards as the fallback when nothing else exists", () => {
    const merged = mergeMediaManifests(
      buildMediaManifest([{ type: "image", url: marketbrief }]),
      buildMediaManifest([{ type: "image", url: huggingnews }])
    );
    expect(merged.assets.map((asset) => asset.url)).toEqual([
      marketbrief,
      huggingnews,
    ]);
  });

  it("treats a video as better media than a card", () => {
    const manifest = buildMediaManifest([
      { type: "image", url: "https://example.com/api/og?title=x" },
      { type: "video", url: "https://example.com/demo.mp4" },
    ]);
    expect(manifest.assets).toEqual([
      { type: "video", url: "https://example.com/demo.mp4" },
    ]);
  });

  it("recognises generator paths, not ordinary article images", () => {
    expect(isGeneratedOgCard(marketbrief)).toBe(true);
    expect(isGeneratedOgCard("https://example.com/api/og?title=x")).toBe(true);
    expect(isGeneratedOgCard("https://example.com/og-card-launch.png")).toBe(
      true
    );
    expect(isGeneratedOgCard(original)).toBe(false);
    expect(isGeneratedOgCard("https://example.com/blog/logo-design.png")).toBe(
      false
    );
  });
});

describe("image-host uploads", () => {
  const wired =
    "https://media.wired.com/photos/6accff96fccc4c5244b94f14/master/pass/Muse-Wonder-Puts-Meta-Back-at-the-AI-Frontier-Business-2296209266.jpg";
  const verge =
    "https://platform.theverge.com/wp-content/uploads/sites/2/2026/10/STKB394_MUSE_AI_CVIRGINIA_D.png?crop=0%2C9.9676601489831%2C100%2C80.064679702034&quality=90&strip=all&w=1200";
  const imgur = "https://i.imgur.com/pWABPKr.png";

  // 2026-10-13 story 1: a Techmeme duplicate merged a desktop screenshot with
  // a browser tooltip baked in, and the video showed it as the third image.
  it("drops an imgur screenshot from a stored manifest that has article images", () => {
    const stored = JSON.stringify({
      version: 1,
      assets: [
        { type: "image", url: wired },
        { type: "image", url: verge },
        { type: "image", url: imgur },
        {
          type: "image",
          url: "https://pbs.twimg.com/amplify_video_thumb/2109669234620186624/img/I0IcBVeH6IpRclrm?format=webp&name=large",
        },
      ],
    });
    const manifest = parseMediaManifest(stored, wired);
    expect(manifest.assets.map((asset) => asset.url)).toEqual([
      wired,
      verge,
      "https://pbs.twimg.com/amplify_video_thumb/2109669234620186624/img/I0IcBVeH6IpRclrm?format=webp&name=large",
    ]);
    expect(primaryThumbnailUrl(manifest, wired)).toBe(wired);
  });

  it("keeps an imgur image when the story has nothing else", () => {
    const manifest = parseMediaManifest(
      JSON.stringify({ version: 1, assets: [{ type: "image", url: imgur }] }),
      imgur
    );
    expect(manifest.assets).toEqual([{ type: "image", url: imgur }]);
    expect(primaryThumbnailUrl(manifest, imgur)).toBe(imgur);
  });

  it("matches the imgur host, not lookalike hosts", () => {
    const lookalikes = [
      "https://notimgur.com/a.png",
      "https://imgur.com.example.net/a.png",
    ];
    const manifest = buildMediaManifest(
      [wired, ...lookalikes].map((url) => ({ type: "image" as const, url }))
    );
    expect(manifest.assets.map((asset) => asset.url)).toEqual([
      wired,
      ...lookalikes,
    ]);
  });
});

describe("media dedup identity", () => {
  const urls = (candidates: Array<{ type: "image" | "video"; url: string }>) =>
    buildMediaManifest(candidates).assets.map((a) => a.url);

  it("rewrites bare marketbrief story-media paths when canonicalizing stored rows", () => {
    expect(
      canonicalizeMediaUrl("https://static.marketbrief.now/story-media/9/ab12")
    ).toBe("https://static.marketbrief.now/story-media/9/ab12-large.jpg");
  });

  it("dedupes story-media shared by marketbrief and huggingnews", () => {
    expect(
      urls([
        {
          type: "image",
          url: "https://static.marketbrief.now/story-media/9/ab12",
        },
        {
          type: "image",
          url: "https://static.huggingnews.com/story-media/9/ab12",
        },
      ])
    ).toHaveLength(1);
  });

  it("treats http and https of the same file as one asset", () => {
    expect(
      urls([
        { type: "image", url: "http://img.example/a/photo.jpg" },
        { type: "image", url: "https://img.example/a/photo.jpg" },
      ])
    ).toHaveLength(1);
    expect(
      urls([
        { type: "video", url: "http://cdn.example/clip.mp4" },
        { type: "video", url: "https://cdn.example/clip.mp4" },
      ])
    ).toHaveLength(1);
  });

  it("ignores tracking query parameters", () => {
    expect(
      urls([
        {
          type: "image",
          url: "https://img.example/p.jpg?utm_source=x&fbclid=1",
        },
        { type: "image", url: "https://img.example/p.jpg?ref=rss" },
        { type: "image", url: "https://img.example/p.jpg" },
      ])
    ).toHaveLength(1);
  });

  it("collapses WordPress size variants to the base file", () => {
    expect(
      urls([
        {
          type: "image",
          url: "https://site.example/wp-content/uploads/2030/10/hero-1024x576.jpg",
        },
        {
          type: "image",
          url: "https://site.example/wp-content/uploads/2030/10/hero-300x169.jpg",
        },
        {
          type: "image",
          url: "https://site.example/wp-content/uploads/2030/10/hero-scaled.jpg",
        },
        {
          type: "image",
          url: "https://site.example/wp-content/uploads/2030/10/hero.jpg",
        },
      ])
    ).toHaveLength(1);
  });

  it("collapses CDN resize parameters and Jetpack Photon proxies", () => {
    expect(
      urls([
        {
          type: "image",
          url: "https://cdn.example/p.jpg?w=1200&q=80&auto=format",
        },
        { type: "image", url: "https://cdn.example/p.jpg?width=300" },
        {
          type: "image",
          url: "https://i0.wp.com/cdn.example/p.jpg?resize=640,360",
        },
      ])
    ).toHaveLength(1);
  });

  it("keeps genuinely distinct files", () => {
    expect(
      urls([
        { type: "image", url: "https://img.example/hero-1.jpg" },
        { type: "image", url: "https://img.example/hero-2.jpg" },
        { type: "image", url: "https://img.example/hero-1024x576-b.jpg" },
        { type: "image", url: "https://other.example/hero-1.jpg" },
        { type: "image", url: "https://img.example/p.jpg?id=1" },
        { type: "image", url: "https://img.example/p.jpg?id=2" },
      ])
    ).toHaveLength(6);
  });

  it("drops an image that is a video poster", () => {
    const manifest = buildMediaManifest([
      { type: "image", url: "http://img.example/wp/poster-1024x576.jpg" },
      {
        type: "video",
        url: "https://cdn.example/v.mp4",
        poster_url: "https://img.example/wp/poster.jpg?utm_medium=x",
      },
    ]);
    expect(manifest.assets.map((a) => a.type)).toEqual(["video"]);
  });

  it("dedupes media merged from clustered duplicate items", () => {
    const a = buildMediaManifest([
      { type: "image", url: "https://a.example/wp/hero-1024x576.jpg" },
      { type: "video", url: "http://a.example/v/demo.mp4" },
    ]);
    const b = buildMediaManifest([
      { type: "image", url: "http://a.example/wp/hero.jpg?utm_source=feed" },
      { type: "video", url: "https://a.example/v/demo.mp4" },
      { type: "image", url: "https://b.example/other.jpg" },
    ]);
    const merged = mergeMediaManifests(a, b).assets;
    expect(merged.map((x) => x.type).sort()).toEqual([
      "image",
      "image",
      "video",
    ]);
    expect(merged.filter((x) => x.url.includes("b.example"))).toHaveLength(1);
  });
});

describe("isGenericImageUrl avatars", () => {
  it("rejects Twitter profile images and banners", () => {
    expect(
      isGenericImageUrl(
        "https://pbs.twimg.com/profile_images/123/abc_400x400.jpg"
      )
    ).toBe(true);
    expect(
      isGenericImageUrl("https://pbs.twimg.com/profile_banners/123/1700000000")
    ).toBe(true);
  });

  it("rejects avatar directories before the filename", () => {
    expect(isGenericImageUrl("https://cdn.example/avatars/u/9f3a.jpg")).toBe(
      true
    );
    expect(isGenericImageUrl("https://cdn.example/a/avatar/9f3a.png")).toBe(
      true
    );
  });

  it("keeps real tweet media and card images", () => {
    expect(
      isGenericImageUrl(
        "https://pbs.twimg.com/media/HUbZ91pWoAAH9MC?format=jpg&name=large"
      )
    ).toBe(false);
    expect(
      isGenericImageUrl("https://pbs.twimg.com/card_img/123/abc?format=jpg")
    ).toBe(false);
  });
});
