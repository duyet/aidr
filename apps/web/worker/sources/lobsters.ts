import { isAiRelatedTitle } from "./keywords.js";
import { SourceFetchError } from "./rss.js";
import type { FetchedItem, SourceAdapter } from "./types.js";

interface LobstersStory {
  short_id: string;
  title?: string;
  url?: string;
  created_at?: string;
  score?: number;
  comment_count?: number;
  submitter_user?: string;
  comments_url?: string;
  tags?: string[];
}

const DEFAULT_TAGS = ["ai", "ml", "vibecoding"];

function storyToItem(story: LobstersStory): FetchedItem | null {
  const title = story.title?.trim();
  const url = story.url?.trim() || story.comments_url?.trim();
  if (!title || !url) return null;
  const createdMs = story.created_at
    ? Date.parse(story.created_at)
    : Number.NaN;
  const publishedAt = Number.isFinite(createdMs) ? createdMs : Date.now();
  return {
    externalId: story.short_id,
    url,
    title,
    publishedAt,
    points: story.score ?? 0,
    comments: story.comment_count ?? 0,
    sources: [
      {
        kind: "discussion",
        author: story.submitter_user,
        postedAt: Math.floor(publishedAt / 1000),
        url: story.comments_url ?? `https://lobste.rs/s/${story.short_id}`,
      },
    ],
  };
}

async function fetchTag(tag: string): Promise<LobstersStory[]> {
  const res = await fetch(
    `https://lobste.rs/t/${encodeURIComponent(tag)}.json`,
    {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    }
  );
  if (!res.ok) {
    throw new SourceFetchError(
      "fetch_failed",
      `lobsters feed returned ${res.status}`
    );
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as LobstersStory[]) : [];
}

function cleanTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0
      )
    : [];
}

/**
 * Lobsters AI-adjacent tags (`ai`, `ml`, `vibecoding` by default). Config:
 * `{ "tags": ["ai","ml"], "filteredTags": ["programming"] }`. Stories from
 * `tags` are taken as is; stories from `filteredTags` (broad tags such as
 * `programming`) only pass when the title matches the shared AI keyword
 * list, so a wide tag cannot flood the scorer. A story in both lists is kept.
 * Stories without an external URL fall back to the
 * Lobsters discussion page so we still ingest link-free posts.
 */
export const lobstersAdapter: SourceAdapter = {
  type: "lobsters",

  async fetchItems(config, sinceEpochSec) {
    const configured = cleanTags(config.tags);
    const tagList = configured.length > 0 ? configured : DEFAULT_TAGS;
    const filteredTags = cleanTags(config.filteredTags).filter(
      (tag) => !tagList.includes(tag)
    );

    const [batches, filteredBatches] = await Promise.all([
      Promise.all(tagList.map((tag) => fetchTag(tag))),
      Promise.all(filteredTags.map((tag) => fetchTag(tag))),
    ]);
    const seen = new Map<string, LobstersStory>();
    for (const story of batches.flat()) {
      if (!story.short_id || seen.has(story.short_id)) continue;
      seen.set(story.short_id, story);
    }
    for (const story of filteredBatches.flat()) {
      if (!story.short_id || seen.has(story.short_id)) continue;
      if (!story.title || !isAiRelatedTitle(story.title)) continue;
      seen.set(story.short_id, story);
    }

    const sinceMs = sinceEpochSec * 1000;
    const items: FetchedItem[] = [];
    for (const story of seen.values()) {
      const item = storyToItem(story);
      if (!item) continue;
      if (item.publishedAt < sinceMs) continue;
      items.push(item);
    }
    return items;
  },
};
