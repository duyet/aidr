/**
 * The fallback-image rule (#684) drops imgur captures and share cards when a
 * story has a better picture. The article's own URL is never story media, so
 * it must be removed before that rule runs. These tests drive the production
 * paths (RSS parse, enrich, D1 bind, Telegram hydrate, public API, story
 * page), never a hand-made manifest, because every path builds the manifest
 * itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicDigest } from "../../src/lib/public-queries.js";
import { getStory } from "../../src/lib/story-queries.js";
import { buildItemBindArgs } from "../d1-bind.js";
import { enrichMissingContent } from "../enrich.js";
import { hydrateStory, type StoryRow } from "../notify/index.js";
import { resolveStoryMedia } from "../notify/telegram.js";
import { parseRssItems } from "../sources/rss.js";
import type { FetchedItem } from "../sources/types.js";

afterEach(() => vi.unstubAllGlobals());

const ARTICLE = "https://example.com/story";
const SOURCE = "https://x.com/someone/status/1";
const IMGUR = "https://i.imgur.com/pWABPKr.png";
const CARD = "https://marketbrief.example.com/og/story-card.png";
const VIDEO = "https://video.example.com/clip.mp4";

const manifestJson = (assets: unknown[]) =>
  JSON.stringify({ version: 1, assets });

function storyRow(over: Partial<StoryRow> = {}): StoryRow {
  return {
    id: "abcdef1234567890",
    url: ARTICLE,
    title: "A story",
    summary: "A summary.",
    image_url: null,
    category: "llm",
    points: 1,
    comments: 0,
    rank_score: 1,
    llm_importance: 9,
    lang: "en",
    ...over,
  };
}

function telegram(row: StoryRow) {
  const story = hydrateStory(row);
  return {
    imageUrl: story.image_url,
    gallery: resolveStoryMedia(story).gallery,
  };
}

function stubFetchHtml(pages: Record<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const html = pages[String(input)];
      return html === undefined
        ? new Response("not found", { status: 404 })
        : new Response(html, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
    })
  );
}

function publicDb(row: Record<string, unknown>): D1Database {
  const bullets = JSON.stringify([{ text: "A story", item_ids: [row.id] }]);
  const tldr = { date: "2026-10-13", bullets_en: bullets, bullets_vi: bullets };
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        all: async () => ({
          results: sql.includes("tldr_snapshots")
            ? [tldr]
            : sql.includes("FROM items")
              ? [row]
              : [],
        }),
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function storyDb(row: Record<string, unknown>) {
  const stmt = (sql: string) => ({
    sql,
    bind() {
      return this;
    },
    async all() {
      return { results: sql.includes("FROM items LIMIT 1") ? [] : [row] };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    async batch(stmts: { sql: string }[]) {
      return stmts.map((s) =>
        s.sql.includes("item_sources") ? { results: [] } : { results: [row] }
      );
    },
  } as unknown as Parameters<typeof getStory>[0];
}

/** `items` row as `upsertItem` writes it. */
function boundRow(item: FetchedItem) {
  const args = buildItemBindArgs({
    id: "abcdef1234567890",
    sourceId: "rss",
    item,
    rank: 1,
    status: "published",
    now: 1_700_000_000,
  });
  return {
    image_url: args[19] as string | null,
    media_manifest: args[21] as string,
  };
}

describe("1. an image at the article URL never costs the story its imgur image", () => {
  const stored = manifestJson([
    { type: "image", url: IMGUR },
    { type: "image", url: ARTICLE },
  ]);

  it("Telegram: hydrateStory into resolveStoryMedia", () => {
    expect(telegram(storyRow({ media_manifest: stored }))).toEqual({
      imageUrl: IMGUR,
      gallery: [IMGUR],
    });
  });

  it("public API: digest story and bullet image", async () => {
    const digest = await getPublicDigest(
      publicDb({
        id: "a",
        source_id: "rss",
        url: ARTICLE,
        title: "A story",
        title_vi: null,
        category: null,
        image_url: null,
        media_manifest: stored,
        published_at: 1_700_000_000,
      })
    );
    expect(digest.stories[0]?.image_url).toBe(IMGUR);
    expect(digest.tldr?.bullets_en[0]?.image_url).toBe(IMGUR);
  });

  it("story page: getStory", async () => {
    const item = await getStory(
      storyDb({
        id: "abcdef12deadbeefabcdef12deadbeefabcdef12deadbeefabcdef12deadbeef",
        url: ARTICLE,
        title: "A story",
        published_at: 1_700_000_000,
        image_url: null,
        media_manifest: stored,
      }),
      "abcdef12"
    );
    expect(item?.image_url).toBe(IMGUR);
  });

  it("ingest: RSS parse, enrich, D1 bind, then Telegram", async () => {
    const [item] = parseRssItems(`<item>
      <title>A story</title>
      <link>${ARTICLE}</link>
      <description>A finished summary.</description>
      <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
      <media:content url="${IMGUR}" medium="image" />
      <media:content url="${ARTICLE}" medium="image" />
    </item>`);
    expect(item.mediaManifest?.assets).toEqual([{ type: "image", url: IMGUR }]);
    expect(item.imageUrl).toBe(IMGUR);

    stubFetchHtml({});
    await enrichMissingContent([item]);
    expect(item.imageUrl).toBe(IMGUR);

    const row = boundRow(item);
    expect(row.image_url).toBe(IMGUR);
    expect(telegram(storyRow(row)).gallery).toEqual([IMGUR]);
  });

  it("enrich: the article page's own og tags (#693)", async () => {
    stubFetchHtml({
      [ARTICLE]: `<meta property="og:image" content="${IMGUR}">
        <meta name="twitter:image" content="${ARTICLE}">
        <meta property="og:description" content="Fetched description">`,
    });
    const item: FetchedItem = {
      url: ARTICLE,
      title: "A story",
      publishedAt: 1_700_000_000,
    };
    await enrichMissingContent([item]);
    expect(item.imageUrl).toBe(IMGUR);
    expect(item.mediaManifest?.assets).toEqual([{ type: "image", url: IMGUR }]);
  });

  it("enrich: an image at the source page URL", async () => {
    stubFetchHtml({});
    const item: FetchedItem = {
      url: ARTICLE,
      title: "A story",
      publishedAt: 1_700_000_000,
      sources: [{ kind: "source", url: SOURCE }],
      media: [
        { type: "image", url: IMGUR },
        { type: "image", url: SOURCE },
      ],
    };
    await enrichMissingContent([item]);
    expect(item.imageUrl).toBe(IMGUR);
    expect(item.mediaManifest?.assets).toEqual([{ type: "image", url: IMGUR }]);
  });
});

describe("2. a video whose poster is the article URL", () => {
  it("keeps imgur as the picture", () => {
    const row = storyRow({
      media_manifest: manifestJson([
        { type: "video", url: VIDEO, poster_url: ARTICLE },
        { type: "image", url: IMGUR },
      ]),
    });
    const story = hydrateStory(row);
    expect(story.image_url).toBe(IMGUR);
    expect(story.media_manifest?.assets).toEqual([
      { type: "video", url: VIDEO },
      { type: "image", url: IMGUR },
    ]);
    expect(resolveStoryMedia(story).gallery).toEqual([IMGUR]);
  });
});

describe("3. a video takes its poster's tier", () => {
  it("Telegram: imgur leads over a video whose poster is a share card", () => {
    const story = hydrateStory(
      storyRow({
        media_manifest: manifestJson([
          { type: "video", url: VIDEO, poster_url: CARD },
          { type: "image", url: IMGUR },
        ]),
      })
    );
    expect(story.image_url).toBe(IMGUR);
    expect(story.media_manifest?.assets).toEqual([
      { type: "image", url: IMGUR },
      { type: "video", url: VIDEO, poster_url: CARD },
    ]);
    expect(resolveStoryMedia(story).gallery[0]).toBe(IMGUR);
  });

  // parseMediaMetadata gives a posterless og:video the page's first image,
  // which here is the share card.
  it("enrich: an og:video with no poster next to the item's imgur image", async () => {
    stubFetchHtml({
      [ARTICLE]: `<meta property="og:image" content="${CARD}">
        <meta property="og:video" content="${VIDEO}">
        <meta property="og:description" content="Fetched description">`,
    });
    const item: FetchedItem = {
      url: ARTICLE,
      title: "A story",
      publishedAt: 1_700_000_000,
      media: [{ type: "image", url: IMGUR }],
    };
    await enrichMissingContent([item]);
    expect(item.imageUrl).toBe(IMGUR);
    expect(item.mediaManifest?.assets).toEqual([
      { type: "image", url: IMGUR },
      { type: "video", url: VIDEO, poster_url: CARD },
    ]);
  });
});

describe("4. resize and http variants of the article URL", () => {
  it.each([`${ARTICLE}?w=600`, "http://example.com/story"])(
    "removes %s before the fallback rule runs",
    (variant) => {
      expect(
        telegram(
          storyRow({
            media_manifest: manifestJson([
              { type: "image", url: IMGUR },
              { type: "image", url: variant },
            ]),
          })
        )
      ).toEqual({ imageUrl: IMGUR, gallery: [IMGUR] });
    }
  );
});
