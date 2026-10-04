import { dayBoundsSec } from "../../src/lib/day-archive.js";
import {
  hasDayOgCopy,
  splitDayHighlights,
} from "../../src/lib/day-card-pick.js";
import {
  localizedTitle,
  looksVietnamese,
} from "../../src/lib/display-title.js";
import { absoluteSiteUrl } from "../../src/lib/locale-url.js";
import { storyPath } from "../../src/lib/slug.js";
import type { FeedItem, Lang } from "../../src/lib/types.js";
import type { Env } from "../types.js";
import type { DailyDigest, DigestBullet } from "./types.js";

/** Highlight candidates after the language filter. The card renderer
 *  keeps the same slice (`DAY_OG_CANDIDATES`). */
const DAY_CARD_CANDIDATES = 18;

/** Ranked rows read before that filter. A Vietnamese card drops stories
 *  with no Vietnamese title, so the limit has to sit above the slice. */
const DAY_CARD_QUERY_LIMIT = 200;

interface DayRow {
  id: string;
  title: string;
  title_vi: string | null;
  summary: string | null;
  summary_vi: string | null;
  category: string | null;
  image_url: string | null;
}

export interface DayCardPage {
  bullets: DigestBullet[];
  /** Stable token for the photo URL, so Telegram refetches when the tiles change. */
  version: string;
  /** Second highlight grid. Absent on the lead card. */
  part?: 2;
  /** Follow-up heading. The lead card keeps the digest's own headline. */
  headline?: string;
  /** A thin tail is text. Four or more leftovers get their own card. */
  photo: boolean;
}

function asItem(row: DayRow): FeedItem {
  return {
    id: row.id,
    url: "",
    title: row.title,
    title_vi: row.title_vi,
    summary: row.summary,
    summary_vi: row.summary_vi,
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

/** One extra clause after the headline. The caption budget still trims it. */
const HIGHLIGHT_SUMMARY_CAP = 90;

type HighlightCopy = {
  title: string;
  title_vi: string | null;
  summary?: string | null;
  summary_vi?: string | null;
};

function sameLanguageSummary(item: HighlightCopy, lang: Lang): string | null {
  const raw = (lang === "vi" ? item.summary_vi : item.summary)
    ?.replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  if (/^no summary is available\.?$/i.test(raw)) return null;
  // No cross-language copy: an English line never takes a Vietnamese summary.
  if (lang === "vi" ? !looksVietnamese(raw) : looksVietnamese(raw)) return null;
  return raw;
}

function clipExtra(value: string, cap: number): string {
  if (value.length <= cap) return value;
  const slice = value.slice(0, cap);
  const space = slice.lastIndexOf(" ");
  const base = (space > cap * 0.6 ? slice.slice(0, space) : slice).trimEnd();
  return `${base}…`;
}

/** Headline, plus the first sentence of that language's summary. */
export function highlightBulletText(item: HighlightCopy, lang: Lang): string {
  const title = localizedTitle(item, lang).text.replace(/\s+/g, " ").trim();
  const summary = sameLanguageSummary(item, lang);
  if (!summary) return title;
  let extra = summary;
  if (extra.toLowerCase().startsWith(title.toLowerCase())) {
    extra = extra.slice(title.length).replace(/^[\s.:;—–-]+/, "");
  }
  if (!extra) return title;
  const sentence = extra.split(/(?<=[.!?…])\s+/)[0] ?? extra;
  if (!sentence || sentence.toLowerCase() === title.toLowerCase()) return title;
  return `${title} — ${clipExtra(sentence, HIGHLIGHT_SUMMARY_CAP)}`;
}

function toBullets(items: FeedItem[], lang: Lang): DigestBullet[] {
  return items.map((item) => ({
    text: highlightBulletText(item, lang),
    url: absoluteSiteUrl(storyPath(item, lang), lang),
    category: item.category,
  }));
}

function moreHeadline(lang: Lang, date: string): string {
  return lang === "en"
    ? `✨ More highlights — ${date}`
    : `✨ Thêm tin nổi bật — ${date}`;
}

/**
 * The stories painted on the day's card, then the next highlights when
 * the lead grid cannot hold them. Calendar day in the audience zone, not
 * the rolling 24h TL;DR.
 */
export async function loadDayCardPages(
  env: Pick<Env, "DB">,
  date: string,
  lang: Lang
): Promise<DayCardPage[] | null> {
  if (!env.DB) return null;
  const { start, end } = dayBoundsSec(date);
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, tr.title AS title_vi, i.summary,
            tr.summary AS summary_vi, i.category, i.image_url
     FROM items i
     LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'
     WHERE i.status = 'published' AND i.published_at >= ? AND i.published_at < ?
     ORDER BY i.rank_score DESC
     LIMIT ${DAY_CARD_QUERY_LIMIT}`
  )
    .bind(start, end)
    .all<DayRow>();
  const ranked = (results ?? [])
    .map(asItem)
    .filter((item) => hasDayOgCopy(item, lang))
    .slice(0, DAY_CARD_CANDIDATES);
  const { lead, more, moreIsCard } = splitDayHighlights(ranked);
  if (lead.length === 0) return null;
  const pages: DayCardPage[] = [
    {
      bullets: toBullets(lead, lang),
      version: dayCardVersion(lead.map((item) => item.id)),
      photo: true,
    },
  ];
  if (more.length > 0) {
    pages.push({
      bullets: toBullets(more, lang),
      version: dayCardVersion(more.map((item) => item.id)),
      part: 2,
      headline: moreHeadline(lang, date),
      photo: moreIsCard,
    });
  }
  return pages;
}

export interface DigestPage {
  digest: DailyDigest;
  version?: string;
  part?: 2;
  headline?: string;
  photo: boolean;
}

/** Caption pages: the day cards when the day has stories, else the edition. */
export async function digestPages(
  env: Pick<Env, "DB">,
  digest: DailyDigest
): Promise<DigestPage[]> {
  try {
    const pages = await loadDayCardPages(env, digest.date, digest.lang);
    if (!pages) return [{ digest, photo: true }];
    return pages.map((page) => ({
      digest: { ...digest, bullets: page.bullets },
      version: page.version,
      part: page.part,
      headline: page.headline,
      photo: page.photo,
    }));
  } catch (error) {
    console.error(
      `telegram day card stories failed for ${digest.date}: ${error instanceof Error ? error.message : "unknown"}`
    );
    return [{ digest, photo: true }];
  }
}
