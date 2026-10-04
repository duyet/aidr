import { dayBoundsSec } from "../../src/lib/day-archive.js";
import { hasDayOgCopy, pickDayCardItems } from "../../src/lib/day-card-pick.js";
import { localizedTitle } from "../../src/lib/display-title.js";
import { absoluteSiteUrl } from "../../src/lib/locale-url.js";
import { storyPath } from "../../src/lib/slug.js";
import type { FeedItem, Lang } from "../../src/lib/types.js";
import type { Env } from "../types.js";
import type { DailyDigest, DigestBullet } from "./types.js";

/** Same candidate window the day-card renderer fetches photos for. */
const DAY_CARD_CANDIDATES = 18;

interface DayRow {
  id: string;
  title: string;
  title_vi: string | null;
  category: string | null;
  image_url: string | null;
}

export interface DayCardDigest {
  bullets: DigestBullet[];
  /** Stable token for the photo URL, so Telegram refetches when the tiles change. */
  version: string;
}

function asItem(row: DayRow): FeedItem {
  return {
    id: row.id,
    url: "",
    title: row.title,
    title_vi: row.title_vi,
    summary: null,
    summary_vi: null,
    category: row.category,
    published_at: 0,
    points: 0,
    comments: 0,
    rank_score: 0,
    source_id: "",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: row.image_url,
  };
}

/** FNV-1a, base36. Short enough for a query param and an R2 key segment. */
export function dayCardVersion(ids: readonly string[]): string {
  let hash = 2166136261;
  const text = ids.join("\n");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * The stories painted on `/api/og/date/{date}.png` for this language.
 * Calendar day in the audience zone, not the rolling 24h TL;DR, which
 * still leads with yesterday's stories after midnight.
 */
export async function loadDayCardDigest(
  env: Pick<Env, "DB">,
  date: string,
  lang: Lang
): Promise<DayCardDigest | null> {
  if (!env.DB) return null;
  const { start, end } = dayBoundsSec(date);
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, tr.title AS title_vi, i.category, i.image_url
     FROM items i
     LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'
     WHERE i.status = 'published' AND i.published_at >= ? AND i.published_at < ?
     ORDER BY i.rank_score DESC
     LIMIT ${DAY_CARD_CANDIDATES}`
  )
    .bind(start, end)
    .all<DayRow>();
  const ranked = (results ?? [])
    .map(asItem)
    .filter((item) => hasDayOgCopy(item, lang));
  const picked = pickDayCardItems(ranked);
  if (picked.length === 0) return null;
  const bullets: DigestBullet[] = picked.map((item) => ({
    text: localizedTitle(item, lang).text,
    url: absoluteSiteUrl(storyPath(item, lang), lang),
    category: item.category,
  }));
  return { bullets, version: dayCardVersion(picked.map((item) => item.id)) };
}

/** Caption source: the day card when the day has stories, else the edition. */
export async function digestForCard(
  env: Pick<Env, "DB">,
  digest: DailyDigest
): Promise<{ digest: DailyDigest; version?: string }> {
  try {
    const card = await loadDayCardDigest(env, digest.date, digest.lang);
    if (!card) return { digest };
    return {
      digest: { ...digest, bullets: card.bullets },
      version: card.version,
    };
  } catch (error) {
    console.error(
      `telegram day card stories failed for ${digest.date}: ${error instanceof Error ? error.message : "unknown"}`
    );
    return { digest };
  }
}
