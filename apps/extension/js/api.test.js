import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  digestPaintKey,
  enrichDigest,
  feedUrl,
  fetchDigest,
  fetchStory,
  CACHE_FRESH_MS,
  hydrateDigest,
  isCacheFresh,
  normalizeDigest,
  prefetchDigest,
  publicUrl,
  readCachedDigest,
  storyUrl,
  writeCachedDigest,
} from "./api.js";
import { resetPreviewStores } from "./preview-shim.js";

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetPreviewStores();
});

const originalFetch = globalThis.fetch;

/** Save a digest as if it had been fetched past the freshness window. */
async function writeStaleDigest(digest, apiBase, lang) {
  const realNow = Date.now;
  Date.now = () => realNow() - CACHE_FRESH_MS - 1000;
  try {
    await writeCachedDigest(digest, apiBase, lang);
  } finally {
    Date.now = realNow;
  }
}

function jsonResponse(body) {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => body,
  };
}

test("publicUrl and feedUrl use normalized base plus explicit locale", () => {
  assert.equal(
    publicUrl("https://aidr.today/"),
    "https://aidr.today/api/public?lang=vi"
  );
  assert.equal(
    feedUrl("https://aidr.today", "en"),
    "https://aidr.today/api/feed?lang=en"
  );
  assert.equal(
    storyUrl("https://aidr.today/", "abcdef12", "en"),
    "https://aidr.today/api/story/abcdef12?lang=en"
  );
});

test("fetchStory returns a normalized story or null", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "abc",
        url: "https://example.com/x",
        title: "Hello",
        summary: "Body",
        sources: [
          { url: "https://hn.example", author: "alice", kind: "source" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const story = await fetchStory("https://aidr.today", "abc");
  assert.equal(story.id, "abc");
  assert.equal(story.summary, "Body");
  assert.equal(story.sources[0].author, "alice");

  globalThis.fetch = async () => new Response("nope", { status: 404 });
  assert.equal(await fetchStory("https://aidr.today", "missing"), null);
});

test("normalizeDigest maps public payload and image aliases", () => {
  const digest = normalizeDigest({
    tldr: {
      date: "2026-08-28",
      bullets_en: [
        { text: "Hello", item_ids: ["a"], imageUrl: "https://img/a" },
      ],
      bullets_vi: [{ text: "Xin chào", item_id: "b" }],
    },
    stories: [
      {
        id: "1",
        url: "https://example.com",
        title: "Title",
        title_vi: "Tiêu đề",
        category: "Chips",
        imageUrl: "https://img/s",
        published_at: 100,
      },
    ],
    updatedAt: 50,
  });

  assert.equal(digest.tldr.date, "2026-08-28");
  assert.equal(digest.tldr.bullets_en[0].image_url, "https://img/a");
  assert.deepEqual(digest.tldr.bullets_vi[0].item_ids, ["b"]);
  assert.equal(digest.stories[0].image_url, "https://img/s");
  assert.deepEqual(digest.categories, [{ name: "Chips", count: 1 }]);
  assert.equal(digest.updatedAt, 50);
});

test("normalizeDigest keeps /api/feed days and flattens stories", () => {
  const digest = normalizeDigest({
    tldr: null,
    days: [
      {
        date: "2026-09-05",
        items: [
          {
            id: "x",
            url: "https://x",
            title: "X",
            points: 12,
            comments: 3,
            vote_net: 4,
            category: "Infra",
          },
        ],
        categoryCounts: { Infra: 1 },
      },
    ],
    categories: [{ name: "Infra", count: 2 }],
    trending: [{ tag: "gpu", count: 3 }],
  });
  assert.equal(digest.stories[0].id, "x");
  assert.equal(digest.stories[0].points, 12);
  assert.equal(digest.stories[0].vote_net, 4);
  assert.equal(digest.days.length, 1);
  assert.equal(digest.days[0].date, "2026-09-05");
  assert.equal(digest.categories[0].name, "Infra");
  assert.equal(digest.trending[0].tag, "gpu");
});

test("fetchDigest prefers /api/public then caches", async () => {
  const calls = [];
  const opts = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    opts.push(init);
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        tldr: { date: "d", bullets_en: [], bullets_vi: [] },
        stories: [{ id: "1", url: "https://x", title: "T" }],
        updatedAt: 1,
      }),
    };
  };

  const before = Date.now();
  const first = await fetchDigest("https://aidr.today", {
    campaign: "refresh",
  });
  assert.equal(first.source, "public");
  assert.equal(first.stale, false);
  assert.equal(first.digest.stories[0].title, "T");
  assert.ok(first.digest.lastFetchedAt >= before);
  // HTTP cache stays on so the API's Cache-Control max-age is honoured.
  assert.equal(opts[0].cache, "default");
  assert.equal(new URL(calls[0]).pathname, "/api/public");
  assert.equal(new URL(calls[0]).searchParams.get("lang"), "vi");
  assert.equal(new URL(calls[0]).searchParams.get("utm_content"), "refresh");
  assert.equal(new URL(calls[1]).pathname, "/api/feed");
  assert.equal(new URL(calls[1]).searchParams.get("days"), "3");
});

test("fetchDigest sends and caches English separately", async () => {
  await writeCachedDigest(
    { tldr: null, stories: [{ id: "vi", url: "https://vi" }] },
    "https://aidr.today",
    "vi"
  );
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        tldr: null,
        stories: [{ id: "en", url: "https://en" }],
      }),
    };
  };
  const result = await fetchDigest("https://aidr.today", {
    campaign: "refresh",
    lang: "en",
  });
  assert.equal(result.digest.stories[0].id, "en");
  assert.equal(new URL(calls[0]).searchParams.get("lang"), "en");
  assert.equal(
    (await readCachedDigest("https://aidr.today", "en")).stories[0].id,
    "en"
  );
  assert.equal(
    (await readCachedDigest("https://aidr.today", "vi")).stories[0].id,
    "vi"
  );
});

test("fetchDigest falls back to /api/feed", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (new URL(url).pathname.endsWith("/api/public")) {
      throw new Error("public down");
    }
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        tldr: null,
        days: [{ items: [{ id: "f", url: "https://f", title: "Feed" }] }],
      }),
    };
  };

  const result = await fetchDigest("https://aidr.today");
  assert.equal(result.source, "feed");
  assert.equal(result.digest.stories[0].id, "f");
  assert.equal(new URL(calls[0]).pathname, "/api/public");
  assert.equal(new URL(calls[1]).pathname, "/api/feed");
});

test("fetchDigest falls back to last-good cache", async () => {
  await writeCachedDigest(
    {
      tldr: null,
      stories: [{ id: "cached", url: "https://c", title: "Cached" }],
      categories: [],
      trending: [],
      updatedAt: 9,
    },
    "https://aidr.today"
  );

  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const result = await fetchDigest("https://aidr.today");
  assert.equal(result.source, "cache");
  assert.equal(result.stale, true);
  assert.equal(result.digest.stories[0].id, "cached");
});

test("hydrateDigest paints a stale cache before the live fetch", async () => {
  await writeStaleDigest(
    {
      tldr: null,
      stories: [{ id: "cached", url: "https://c", title: "Cached" }],
      categories: [],
      trending: [],
      updatedAt: 1,
    },
    "https://aidr.today"
  );

  let releaseLive;
  const liveGate = new Promise((resolve) => {
    releaseLive = resolve;
  });
  globalThis.fetch = async () => {
    await liveGate;
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        tldr: null,
        stories: [{ id: "fresh", url: "https://f", title: "Fresh" }],
        updatedAt: 2,
      }),
    };
  };

  const order = [];
  const pending = hydrateDigest("https://aidr.today", {
    onCache: (digest) => {
      order.push(`cache:${digest.stories[0].id}`);
    },
    onLive: (result) => {
      order.push(`live:${result.digest.stories[0].id}`);
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["cache:cached"]);
  releaseLive();
  const live = await pending;
  assert.equal(live.digest.stories[0].id, "fresh");
  assert.deepEqual(order, ["cache:cached", "live:fresh"]);
});

test("hydrateDigest live fetch is tagged cache-hit vs miss", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error("offline");
  };
  await writeStaleDigest(
    {
      tldr: null,
      stories: [{ id: "cached", url: "https://c", title: "Cached" }],
      categories: [],
      trending: [],
      updatedAt: 1,
    },
    "https://aidr.today"
  );
  const result = await hydrateDigest("https://aidr.today");
  assert.equal(result.source, "cache");
  assert.equal(
    new URL(calls[0]).searchParams.get("utm_content"),
    "hydrate_live"
  );
});

test("digestPaintKey is stable for the same digest", () => {
  const a = {
    updatedAt: 9,
    lastFetchedAt: 8,
    tldr: { date: "2026-09-09" },
    stories: [{ id: "x" }, { id: "y" }],
  };
  assert.equal(
    digestPaintKey(a),
    digestPaintKey({ ...a, stories: [...a.stories] })
  );
  assert.notEqual(digestPaintKey(a), digestPaintKey({ ...a, updatedAt: 10 }));
});

test("fetchDigest does not reuse another API base cache", async () => {
  await writeCachedDigest(
    {
      tldr: null,
      stories: [{ id: "other", url: "https://o", title: "Other" }],
      categories: [],
      trending: [],
      updatedAt: 1,
    },
    "https://other.example"
  );
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  await assert.rejects(() => fetchDigest("https://aidr.today"), /unavailable/);
});

test("enrichDigest copies categories, trending, and item tags from feed", () => {
  const digest = normalizeDigest({
    tldr: { date: "d", bullets_en: [], bullets_vi: [] },
    stories: [{ id: "1", url: "https://x", title: "T" }],
  });
  const next = enrichDigest(digest, {
    categories: [{ name: "Industry", count: 37 }],
    trending: [{ tag: "agent", count: 15 }],
    totalStories: 163,
    lastFetchedAt: 99,
    days: [
      {
        items: [
          {
            id: "abc",
            url: "https://x",
            title: "OpenAI news",
            tags: ["openai", "agent"],
            category: "Industry",
          },
        ],
      },
    ],
  });
  assert.deepEqual(next.categories, [{ name: "Industry", count: 37 }]);
  assert.deepEqual(next.trending, [{ tag: "agent", count: 15 }]);
  assert.equal(next.totalStories, 163);
  assert.equal(next.days.length, 1);
  assert.equal(next.days[0].items[0].id, "abc");
  assert.deepEqual(next.items.abc.tags, ["openai", "agent"]);
});

test("hydrateDigest serves a fresh cache with no network call", async () => {
  // Every new tab used to pull ~570 KB. Inside the freshness window the
  // saved digest is the answer, so opening a tab must not touch the API.
  await writeCachedDigest(
    { tldr: null, stories: [{ id: "cached", url: "https://c" }], updatedAt: 1 },
    "https://aidr.today"
  );
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse({ tldr: null, stories: [] });
  };
  const painted = [];
  const result = await hydrateDigest("https://aidr.today", {
    onCache: (digest) => painted.push(digest.stories[0].id),
    onLive: () => painted.push("live"),
  });
  assert.equal(calls, 0);
  assert.deepEqual(painted, ["cached"]);
  assert.equal(result.source, "cache");
  assert.equal(result.stale, false);
});

test("isCacheFresh expires at CACHE_FRESH_MS and rejects future stamps", () => {
  const now = 1_000_000_000;
  assert.equal(isCacheFresh({ savedAt: now - 1000 }, now), true);
  assert.equal(isCacheFresh({ savedAt: now - CACHE_FRESH_MS }, now), false);
  assert.equal(isCacheFresh({ savedAt: now + 60_000 }, now), false);
  assert.equal(isCacheFresh(null, now), false);
});

test("fetchDigest force bypasses the HTTP cache for the reload button", async () => {
  const opts = [];
  globalThis.fetch = async (_url, init) => {
    opts.push(init);
    return jsonResponse({ tldr: null, stories: [{ id: "1", url: "https://x" }] });
  };
  await fetchDigest("https://aidr.today", { campaign: "refresh", force: true });
  assert.ok(opts.length > 0);
  assert.ok(opts.every((o) => o.cache === "no-cache"));
});

test("prefetchDigest only fetches when the cache is stale", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse({ tldr: null, stories: [{ id: "p", url: "https://p" }] });
  };
  assert.equal(await prefetchDigest("https://aidr.today", "en"), true);
  assert.equal(
    new URL(calls[0]).searchParams.get("utm_content"),
    "prefetch"
  );
  const fetched = calls.length;
  // The alarm fires again right away: the saved copy is fresh, no traffic.
  assert.equal(await prefetchDigest("https://aidr.today", "en"), false);
  assert.equal(calls.length, fetched);
  assert.equal(
    (await readCachedDigest("https://aidr.today", "en")).stories[0].id,
    "p"
  );
});
