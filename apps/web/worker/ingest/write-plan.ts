/**
 * Pure planning for the `write-d1` step: what each new item's row, VI
 * translation and sources should be, and how an already-published canonical
 * absorbs the items merged into it. No I/O; `write.ts` turns these into D1
 * statements.
 */
import { MAX_SOURCES_PER_ITEM } from "../d1-bind.js";
import {
  type CanonicalUpdate,
  type MergePlanEntry,
  unionSources,
} from "../dedupe.js";
import {
  buildMediaManifest,
  type MediaManifest,
  manifestWithoutArticleUrl,
  mergeMediaManifests,
  parseMediaManifest,
  primaryThumbnailUrl,
} from "../media.js";
import { rankScore, rankSignals } from "../ranking.js";
import type { FetchedItem } from "../sources/types.js";
import { MAX_MERGED_TOPICS, unionTopics } from "../topics.js";
import { RELEVANCE_THRESHOLD } from "./context.js";
import type { ItemScore } from "./score.js";
import type { ItemTranslation } from "./translate.js";

export type ItemStatus = "merged" | "rejected" | "published";

/** Merged wins over everything; otherwise the relevance hide rule decides. */
export function itemStatus(
  mergeEntry: MergePlanEntry | undefined,
  relevance: number
): ItemStatus {
  if (mergeEntry) return "merged";
  return relevance < RELEVANCE_THRESHOLD ? "rejected" : "published";
}

/**
 * The VI title/summary to persist for an item, or null.
 *
 * The translate step can be skipped (empty batch result) or the LLM can omit
 * a field entirely; only persist when the title is usable. Explicit VI source
 * items are stored as title_vi so the homepage does not paint an EN badge; no
 * text heuristic chooses direction. Only published items get a row —
 * rejected/merged rows must not create translations entries (native or LLM).
 */
export function persistedViTranslation(
  status: ItemStatus,
  item: Pick<FetchedItem, "title" | "summary" | "sourceLang">,
  translation: Pick<ItemTranslation, "title" | "summary"> | undefined
): { title: string; summary: string } | null {
  if (status !== "published") return null;
  if (translation?.title) {
    return { title: translation.title, summary: translation.summary ?? "" };
  }
  if (item.sourceLang === "vi") {
    return { title: item.title.trim(), summary: item.summary?.trim() ?? "" };
  }
  return null;
}

export interface NewItemWrite {
  item: FetchedItem;
  score: (ItemScore & { tags: string[] }) | undefined;
  status: ItemStatus;
  rank: number;
  llmTokens: number;
  translation: { title: string; summary: string } | null;
  /** Merged items' sources were already absorbed into their canonical's
   * item_sources rows; only non-merged items with sources rewrite theirs. */
  writeSources: boolean;
}

export function planNewItemWrite(input: {
  sourceId: string;
  item: FetchedItem;
  score: ItemScore | undefined;
  translation: ItemTranslation | undefined;
  mergeEntry: MergePlanEntry | undefined;
  canonicalUpdate: CanonicalUpdate | undefined;
  canonicalTags: string[] | undefined;
  now: number;
}): NewItemWrite {
  const {
    sourceId,
    item,
    score,
    translation,
    mergeEntry,
    canonicalUpdate,
    now,
  } = input;
  const absorbs = canonicalUpdate && !canonicalUpdate.isExisting;

  // A canonical new item absorbs the rest of its cluster's reader
  // points/comments (max) and sources (union, capped) before its own row is
  // written.
  const currentThumbnail = primaryThumbnailUrl(
    item.mediaManifest,
    item.imageUrl,
    item.url
  );
  const extraMedia = absorbs ? (canonicalUpdate.extraMedia ?? []) : [];
  const extraLegacyImages =
    absorbs && !currentThumbnail
      ? (canonicalUpdate.extraImageUrls ?? []).map((url) => ({
          type: "image" as const,
          url,
        }))
      : [];
  const combinedMedia = manifestWithoutArticleUrl(
    mergeMediaManifests(item.mediaManifest, {
      version: 1,
      assets: [...extraMedia, ...extraLegacyImages],
    }),
    item.url
  );
  const effectiveItem: FetchedItem = {
    ...item,
    mediaManifest: combinedMedia,
    imageUrl:
      primaryThumbnailUrl(combinedMedia, item.imageUrl, item.url) ?? undefined,
    ...(absorbs
      ? {
          points: canonicalUpdate.maxPoints,
          comments: canonicalUpdate.maxComments,
          sources: unionSources(
            item.sources ?? [],
            canonicalUpdate.extraSources,
            MAX_SOURCES_PER_ITEM,
            item.url
          ),
        }
      : {}),
  };

  // Canonical topics (rules-normalized + LLM-mapped by normalize-topics),
  // unioned with the rest of the cluster's topics for a new-item canonical so
  // counts don't fragment across near-duplicate stories.
  const canonicalTopics = absorbs
    ? unionTopics(
        input.canonicalTags ?? [],
        canonicalUpdate.extraTopics,
        MAX_MERGED_TOPICS
      )
    : (input.canonicalTags ?? []);

  const status = itemStatus(mergeEntry, score?.relevance ?? 0.5);
  const rank = rankScore({
    importance: score?.importance ?? 5,
    quality: score?.quality ?? 5,
    // item.publishedAt is epoch seconds (normalized at dedupe time);
    // rankScore's decay formula operates in milliseconds.
    publishedAt: effectiveItem.publishedAt * 1000,
    now,
    // Same members RANK_SIGNAL_COLUMNS reads once the batch lands.
    ...rankSignals([
      {
        sourceId,
        points: effectiveItem.points ?? 0,
        comments: effectiveItem.comments ?? 0,
        url: effectiveItem.url,
      },
      ...(absorbs ? (canonicalUpdate.members ?? []) : []),
    ]),
  });

  return {
    item: effectiveItem,
    score: score ? { ...score, tags: canonicalTopics } : undefined,
    status,
    rank,
    llmTokens: (score?.tokens ?? 0) + (translation?.tokens ?? 0),
    translation: persistedViTranslation(status, item, translation),
    writeSources:
      !mergeEntry &&
      effectiveItem.sources !== undefined &&
      effectiveItem.sources.length > 0,
  };
}

/** Stored `items.tags` JSON; malformed or non-array reads as no topics so
 * the union with incoming topics still works. */
export function parseTagsJson(tags: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(tags ?? "[]");
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // malformed existing tags JSON — treat as empty, union still works
  }
  return [];
}

export interface ExistingCanonicalRow {
  tags: string | null;
  url: string;
  image_url: string | null;
  media_manifest: string | null;
}

/** How an already-published canonical absorbs its merged new items' topics
 * and media. Legacy image URLs are only used when neither the canonical nor
 * the incoming media has a thumbnail, so a real thumbnail is never displaced
 * by a weaker fallback. */
export function planExistingCanonicalMedia(
  existing: ExistingCanonicalRow | null | undefined,
  update: CanonicalUpdate
): { topics: string[]; manifest: MediaManifest; imageUrl: string | null } {
  const topics = unionTopics(
    parseTagsJson(existing?.tags),
    update.extraTopics,
    MAX_MERGED_TOPICS
  );

  const existingManifest = manifestWithoutArticleUrl(
    parseMediaManifest(existing?.media_manifest, existing?.image_url),
    existing?.url
  );
  const incomingMedia = buildMediaManifest(update.extraMedia ?? []);
  const hasIncomingThumbnail = Boolean(primaryThumbnailUrl(incomingMedia));
  const existingThumbnail = primaryThumbnailUrl(
    existingManifest,
    existing?.image_url,
    existing?.url
  );
  const extraLegacyImages =
    !existingThumbnail && !hasIncomingThumbnail
      ? (update.extraImageUrls ?? []).map((url) => ({
          type: "image" as const,
          url,
        }))
      : [];
  const manifest = manifestWithoutArticleUrl(
    mergeMediaManifests(existingManifest, {
      version: 1,
      assets: [...(incomingMedia.assets ?? []), ...extraLegacyImages],
    }),
    existing?.url
  );
  const imageUrl = primaryThumbnailUrl(
    manifest,
    existing?.image_url,
    existing?.url
  );
  return { topics, manifest, imageUrl };
}
