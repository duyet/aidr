import { toEpochSeconds } from "../time.js";
import { resolve } from "./huggingnews.js";
import type { FetchedItem, SourceAdapter } from "./types.js";

const ORIGIN = "https://marketbrief.now";
const DEFAULT_TOPICS = ["ai"];
const MAX_SUMMARY_CHARS = 1200;

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function toEpochMs(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function topicList(config: Record<string, unknown>): string[] {
  const raw = config.topics;
  if (Array.isArray(raw)) {
    const topics = raw.filter(
      (t): t is string => typeof t === "string" && /^[a-z0-9-]+$/i.test(t)
    );
    if (topics.length) return topics;
  }
  return DEFAULT_TOPICS;
}

function imageUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === "object") {
    const url = pick(value as Record<string, unknown>, [
      "url",
      "src",
      "small",
      "href",
    ]);
    if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
  }
  return undefined;
}

export function storyToItem(story: Record<string, unknown>): FetchedItem | null {
  if (story.isSuperseded === true) return null;
  const title = pick(story, ["title", "headline"]);
  const slug = pick(story, ["slug"]);
  const routing = pick(story, ["routingTopicKeys", "primaryRoutingTopic"]);
  const topic =
    typeof routing === "string"
      ? routing
      : Array.isArray(routing) && typeof routing[0] === "string"
        ? routing[0]
        : "ai";
  if (typeof title !== "string" || typeof slug !== "string") return null;
  const url = `${ORIGIN}/${topic}/${slug}`;
  const publishedMs = toEpochMs(
    pick(story, ["publishedAt", "published_at", "eventTimeApprox"])
  );
  if (publishedMs === null) return null;
  const comments = pick(story, ["tweetCount", "comments"]);
  const authors = pick(story, ["authorCount", "points"]);
  const summaryRaw = pick(story, ["summary", "dek", "lede"]);
  const externalId = pick(story, ["storyId", "id"]);
  return {
    externalId: typeof externalId === "string" ? externalId : undefined,
    url,
    title,
    summary:
      typeof summaryRaw === "string"
        ? summaryRaw.slice(0, MAX_SUMMARY_CHARS)
        : undefined,
    publishedAt: toEpochSeconds(publishedMs),
    points: typeof authors === "number" ? Math.round(authors) : 0,
    comments: typeof comments === "number" ? comments : 0,
    imageUrl: imageUrl(pick(story, ["image", "imageUrl", "thumbnail"])),
    sources: [
      {
        kind: "source",
        url,
        postedAt: toEpochSeconds(publishedMs),
      },
    ],
  };
}

export function parseMarketBriefPayload(payload: unknown): FetchedItem[] {
  if (!payload || typeof payload !== "object") return [];
  const nodes = (payload as { nodes?: unknown[] }).nodes ?? [];
  const items: FetchedItem[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const data = (node as { data?: unknown[] }).data;
    if (!Array.isArray(data) || data.length === 0) continue;
    const root = resolve(data, 0);
    if (!root || typeof root !== "object") continue;
    const stories = (root as Record<string, unknown>).stories;
    if (!Array.isArray(stories)) continue;
    for (const story of stories) {
      if (!story || typeof story !== "object") continue;
      const item = storyToItem(story as Record<string, unknown>);
      if (!item || seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
  }
  return items;
}

export const marketBriefAdapter: SourceAdapter = {
  type: "marketbrief",

  async fetchItems(config, sinceEpochSec) {
    const topics = topicList(config);
    const seen = new Set<string>();
    const items: FetchedItem[] = [];
    for (const topic of topics) {
      const res = await fetch(`${ORIGIN}/${topic}/__data.json`, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const payload: unknown = await res.json();
      for (const item of parseMarketBriefPayload(payload)) {
        if (item.publishedAt < sinceEpochSec) continue;
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        items.push(item);
      }
    }
    return items;
  },
};
