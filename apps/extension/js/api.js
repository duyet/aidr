import "./preview-shim.js";
import { withExtRef } from "./ref.js";
import { normalizeApiBase } from "./settings.js";

const CACHE_KEY = "newsTabFeedCache";

function asChrome() {
  return globalThis.chrome;
}

export function publicUrl(apiBase) {
  return `${normalizeApiBase(apiBase)}/api/public`;
}

export function feedUrl(apiBase) {
  return `${normalizeApiBase(apiBase)}/api/feed`;
}

export function storyUrl(apiBase, id) {
  const key = String(id || "").trim();
  return `${normalizeApiBase(apiBase)}/api/story/${encodeURIComponent(key)}`;
}

/** Single published story for the in-tab dialog. Null on 404/network. */
export async function fetchStory(apiBase, id, fetchImpl = fetch) {
  const key = String(id || "").trim();
  if (!key) return null;
  try {
    const res = await fetchImpl(storyUrl(apiBase, key));
    if (!res.ok) return null;
    const body = await res.json();
    return normalizeStory(body);
  } catch {
    return null;
  }
}

function clipText(value) {
  return typeof value === "string" ? value : "";
}

function normalizeBullet(raw) {
  if (!raw || typeof raw !== "object") {
    return { text: "", item_ids: [], image_url: null };
  }
  const itemIds = Array.isArray(raw.item_ids)
    ? raw.item_ids.filter((id) => typeof id === "string")
    : typeof raw.item_id === "string" && raw.item_id
      ? [raw.item_id]
      : [];
  const image = raw.image_url || raw.imageUrl || null;
  return {
    text: clipText(raw.text),
    item_ids: itemIds,
    image_url: typeof image === "string" ? image : null,
  };
}

function normalizeStory(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = clipText(raw.url);
  const title = clipText(raw.title);
  if (!url && !title) return null;
  const image = raw.image_url || raw.imageUrl || null;
  const sources = Array.isArray(raw.sources)
    ? raw.sources
        .map((s) => {
          if (!s || typeof s !== "object") return null;
          const href = clipText(s.url);
          const name = clipText(s.name || s.source || s.author);
          if (!href && !name) return null;
          return {
            url: href,
            name: name || href,
            author: s.author ? clipText(s.author) : null,
            kind: s.kind ? clipText(s.kind) : null,
          };
        })
        .filter(Boolean)
    : [];
  return {
    id: clipText(raw.id),
    url,
    title,
    title_vi: raw.title_vi ? clipText(raw.title_vi) : null,
    summary: raw.summary ? clipText(raw.summary) : null,
    summary_vi: raw.summary_vi ? clipText(raw.summary_vi) : null,
    category: raw.category ? clipText(raw.category) : null,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag) => typeof tag === "string" && tag)
      : [],
    image_url: typeof image === "string" ? image : null,
    published_at: Number(raw.published_at) || 0,
    points: Number(raw.points) || 0,
    comments: Number(raw.comments) || 0,
    rank_score: Number(raw.rank_score) || 0,
    sources,
  };
}

function utcDateKey(epoch) {
  const sec = epoch > 1e12 ? Math.floor(epoch / 1000) : Math.floor(epoch);
  if (!sec) return "";
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function categoryCountsFor(items) {
  const counts = {};
  for (const item of items) {
    if (!item.category) continue;
    counts[item.category] = (counts[item.category] || 0) + 1;
  }
  return counts;
}

function normalizeDay(raw) {
  if (!raw || typeof raw !== "object") return null;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizeStory)
    .filter(Boolean);
  const date = clipText(raw.date) || utcDateKey(items[0]?.published_at || 0);
  if (!date && items.length === 0) return null;
  const fromFeed =
    raw.categoryCounts && typeof raw.categoryCounts === "object"
      ? Object.fromEntries(
          Object.entries(raw.categoryCounts).map(([k, v]) => [
            clipText(k),
            Number(v) || 0,
          ])
        )
      : null;
  return {
    date,
    items,
    categoryCounts:
      fromFeed && Object.keys(fromFeed).length
        ? fromFeed
        : categoryCountsFor(items),
  };
}

function daysFromStories(stories) {
  const byDate = new Map();
  for (const story of stories) {
    const key = utcDateKey(story.published_at) || "unknown";
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(story);
  }
  return [...byDate.entries()]
    .filter(([date]) => date !== "unknown")
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      items,
      categoryCounts: categoryCountsFor(items),
    }));
}

function categoriesFromStories(stories) {
  const counts = new Map();
  for (const story of stories) {
    if (!story.category) continue;
    counts.set(story.category, (counts.get(story.category) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

function itemIndexFromStories(stories) {
  const items = {};
  for (const story of stories) {
    if (!story.id) continue;
    items[story.id] = {
      tags: story.tags || [],
      category: story.category,
      image_url: story.image_url,
    };
  }
  return items;
}

function itemIndexFromFeed(raw) {
  const items = {};
  const days = Array.isArray(raw?.days) ? raw.days : [];
  for (const day of days) {
    const rows = Array.isArray(day?.items) ? day.items : [];
    for (const row of rows) {
      const story = normalizeStory(row);
      if (!story?.id) continue;
      items[story.id] = {
        tags: story.tags,
        category: story.category,
        image_url: story.image_url,
      };
    }
  }
  return items;
}

export function enrichDigest(digest, feedRaw) {
  if (!feedRaw || typeof feedRaw !== "object") return digest;
  const feedCats = Array.isArray(feedRaw.categories)
    ? feedRaw.categories
        .map((c) => ({
          name: clipText(c.name),
          count: Number(c.count) || 0,
        }))
        .filter((c) => c.name)
    : [];
  const feedTrend = Array.isArray(feedRaw.trending)
    ? feedRaw.trending
        .map((row) => ({
          tag: clipText(row.tag),
          count: Number(row.count) || 0,
        }))
        .filter((row) => row.tag)
    : [];
  const feedDays = Array.isArray(feedRaw.days)
    ? feedRaw.days.map(normalizeDay).filter(Boolean)
    : [];
  const stories = feedDays.length
    ? feedDays.flatMap((day) => day.items)
    : digest.stories;
  return {
    ...digest,
    categories: feedCats.length ? feedCats : digest.categories,
    trending: feedTrend.length ? feedTrend : digest.trending,
    days: feedDays.length ? feedDays : digest.days,
    stories,
    items: { ...digest.items, ...itemIndexFromFeed(feedRaw) },
    totalStories: Number(feedRaw.totalStories) || digest.totalStories,
    lastFetchedAt: Number(feedRaw.lastFetchedAt) || digest.lastFetchedAt,
  };
}

export function normalizeDigest(raw) {
  const tldr =
    raw?.tldr && typeof raw.tldr === "object"
      ? {
          date: clipText(raw.tldr.date),
          bullets_en: (raw.tldr.bullets_en || []).map(normalizeBullet),
          bullets_vi: (raw.tldr.bullets_vi || []).map(normalizeBullet),
        }
      : null;

  let days = [];
  let stories = [];
  if (Array.isArray(raw?.days) && raw.days.length) {
    days = raw.days.map(normalizeDay).filter(Boolean);
    stories = days.flatMap((day) => day.items);
  } else if (Array.isArray(raw?.stories)) {
    stories = raw.stories.map(normalizeStory).filter(Boolean);
    days = daysFromStories(stories);
  }

  const categories = Array.isArray(raw?.categories)
    ? raw.categories
        .map((c) => ({
          name: clipText(c.name),
          count: Number(c.count) || 0,
        }))
        .filter((c) => c.name)
    : categoriesFromStories(stories);

  const trending = Array.isArray(raw?.trending)
    ? raw.trending
        .map((row) => ({
          tag: clipText(row.tag),
          count: Number(row.count) || 0,
        }))
        .filter((row) => row.tag)
    : [];

  const digest = {
    tldr,
    stories,
    days,
    categories,
    trending,
    items: itemIndexFromStories(stories),
    totalStories: Number(raw?.totalStories) || stories.length,
    lastFetchedAt: Number(raw?.lastFetchedAt) || 0,
    updatedAt: Number(raw?.updatedAt) || Date.now(),
  };
  if (raw?.items && typeof raw.items === "object") {
    digest.items = { ...digest.items, ...raw.items };
  }
  return digest;
}

const FETCH_MS = 8000;

function cacheSlot(apiBase) {
  return `${CACHE_KEY}:${normalizeApiBase(apiBase)}`;
}

async function readJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("json")) throw new Error("not json");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function readCachedDigest(apiBase) {
  try {
    const key = cacheSlot(apiBase);
    const bag = await asChrome().storage.local.get(key);
    const cached = bag?.[key];
    if (cached?.digest) return normalizeDigest(cached.digest);
  } catch {
    // ignore
  }
  return null;
}

export async function writeCachedDigest(digest, apiBase) {
  try {
    const base = normalizeApiBase(apiBase);
    await asChrome().storage.local.set({
      [cacheSlot(base)]: { digest, apiBase: base, savedAt: Date.now() },
    });
  } catch {
    // ignore quota
  }
}

/** Stable key so the new tab can skip a no-op live re-paint. */
export function digestPaintKey(digest) {
  if (!digest || typeof digest !== "object") return "";
  const first = digest.stories?.[0]?.id || "";
  const n = Array.isArray(digest.stories) ? digest.stories.length : 0;
  const date = digest.tldr?.date || "";
  return `${Number(digest.updatedAt) || 0}|${Number(digest.lastFetchedAt) || 0}|${date}|${first}|${n}`;
}

function tagged(url, content) {
  return withExtRef(url, content);
}

export async function fetchDigest(apiBase, { campaign } = {}) {
  const base = normalizeApiBase(apiBase);
  const content = campaign || "hydrate";
  try {
    const data = await readJson(tagged(publicUrl(base), content));
    let digest = normalizeDigest(data);
    try {
      const feed = await readJson(
        tagged(`${feedUrl(base)}?days=3`, `${content}_feed`.slice(0, 64))
      );
      digest = enrichDigest(digest, feed);
    } catch {
      // /api/feed has no CORS for web previews; unpacked MV3 host_permissions
      // still succeed. Public digest is enough for AI;DR + stories.
    }
    digest.lastFetchedAt = Date.now();
    await writeCachedDigest(digest, base);
    return { digest, source: "public", stale: false };
  } catch {
    try {
      const data = await readJson(tagged(feedUrl(base), `${content}_feed`));
      const digest = normalizeDigest(data);
      digest.lastFetchedAt = Date.now();
      await writeCachedDigest(digest, base);
      return { digest, source: "feed", stale: false };
    } catch {
      const cached = await readCachedDigest(base);
      if (cached) return { digest: cached, source: "cache", stale: true };
      throw new Error("unavailable");
    }
  }
}

/**
 * Last saved digest first, then a live pull. `onCache` runs before any
 * network so a new tab can paint immediately and refresh in the background.
 */
export async function hydrateDigest(apiBase, { onCache, onLive } = {}) {
  const base = normalizeApiBase(apiBase);
  const cached = await readCachedDigest(base);
  if (cached) onCache?.(cached);
  const campaign = cached ? "hydrate_live" : "hydrate_miss";
  try {
    const live = await fetchDigest(base, { campaign });
    onLive?.(live);
    return live;
  } catch (error) {
    if (cached) {
      const stale = { digest: cached, source: "cache", stale: true };
      onLive?.(stale);
      return stale;
    }
    throw error;
  }
}
