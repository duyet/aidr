import {
  DAY_CARD_CANDIDATES,
  hasDayOgCopy,
  pickDayCardItems,
} from "../../src/lib/day-card-pick.js";
import { readSession } from "../../src/lib/db.js";
import {
  localizedTitle,
  looksVietnamese,
} from "../../src/lib/display-title.js";
import { getDayArchive } from "../../src/lib/feed-queries.js";
import { absoluteSiteUrl } from "../../src/lib/locale-url.js";
import { storyPath } from "../../src/lib/slug.js";
import type { FeedItem, Lang } from "../../src/lib/types.js";
import { firstSentence } from "../sentences.js";
import { stripEmbeddedChrome } from "../translation-terms.js";
import type { Env } from "../types.js";
import { withoutRestatedHeadline } from "./headline-repeat.js";
import type { DailyDigest, DigestBullet } from "./types.js";

export interface DayCard {
  bullets: DigestBullet[];
  /** Story ids of `bullets`, in order. */
  itemIds: string[];
  /** Stable token for the card URL, so Telegram refetches when the tiles change. */
  version: string;
  /** That language's day video (16:9, else the Short), for the digest's
   *  YouTube button. Never the other language's. */
  youtubeId: string | null;
}

/** FNV-1a, base36. Padded so a short stamp still matches the R2 key
 *  pattern (`^[a-z0-9]{4,16}$`); otherwise those digests share one object. */
export function dayCardVersion(ids: readonly string[]): string {
  let hash = 2166136261;
  const text = ids.join("\n");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(4, "0");
}

/** One extra clause after the headline: a whole sentence or nothing. The
 *  digest is a 4096-char message, so six lines can each carry a full lead
 *  sentence; the fitter drops clauses whole when the six do not all fit. */
const HIGHLIGHT_SUMMARY_CAP = 400;

type HighlightCopy = {
  title: string;
  title_vi: string | null;
  summary?: string | null;
  summary_vi?: string | null;
};

function sameLanguageSummary(item: HighlightCopy, lang: Lang): string | null {
  const text = lang === "vi" ? item.summary_vi : item.summary;
  // Chrome ("← Back to live feed · 1 stories across 1 day") that reached a
  // stored summary would otherwise become the digest line's clause.
  const raw = text ? stripEmbeddedChrome(text.replace(/\s+/g, " ")) : "";
  if (!raw) return null;
  if (/^no summary is available\.?$/i.test(raw)) return null;
  // No cross-language copy: an English line never takes a Vietnamese summary.
  if (lang === "vi" ? !looksVietnamese(raw) : looksVietnamese(raw)) return null;
  return raw;
}

/** The headline, and the first sentence of that language's summary when it
 *  fits whole. A long first sentence is left out rather than cut. Leading
 *  summary text that only repeats the headline is dropped by the same rule
 *  as story captions (`withoutRestatedHeadline`). */
export function highlightParts(
  item: HighlightCopy,
  lang: Lang
): { title: string; extra: string | null } {
  const title = localizedTitle(item, lang).text.replace(/\s+/g, " ").trim();
  const summary = sameLanguageSummary(item, lang);
  const rest = summary ? withoutRestatedHeadline(title, summary) : "";
  const sentence = rest ? firstSentence(rest) : "";
  if (!sentence || sentence.length > HIGHLIGHT_SUMMARY_CAP) {
    return { title, extra: null };
  }
  return { title, extra: sentence };
}

/** Headline, plus the first sentence of that language's summary. */
export function highlightBulletText(item: HighlightCopy, lang: Lang): string {
  const { title, extra } = highlightParts(item, lang);
  return extra ? `${title} — ${extra}` : title;
}

/** `text` is the full line; `lead` is the headline alone, the shorter copy
 *  the digest fitter falls back to. Absent when there is no clause. */
function highlightBullet(
  item: HighlightCopy,
  lang: Lang
): Pick<DigestBullet, "text" | "lead"> {
  const { title, extra } = highlightParts(item, lang);
  return extra ? { text: `${title} — ${extra}`, lead: title } : { text: title };
}

function toBullets(items: FeedItem[], lang: Lang): DigestBullet[] {
  return items.map((item) => ({
    ...highlightBullet(item, lang),
    url: absoluteSiteUrl(storyPath(item, lang), lang),
    category: item.category,
  }));
}

/**
 * The stories painted on the day's card. Same archive read as the OG card,
 * including the manifest thumbnail, so the digest names those tiles.
 * Calendar day in the audience zone, not the rolling 24h TL;DR.
 */
export async function loadDayCard(
  env: Pick<Env, "DB">,
  date: string,
  lang: Lang
): Promise<DayCard | null> {
  if (!env.DB) return null;
  const archive = await getDayArchive(readSession(env.DB), date);
  const ranked = (archive.day?.items ?? [])
    .filter((item) => hasDayOgCopy(item, lang))
    .slice(0, DAY_CARD_CANDIDATES);
  const lead = pickDayCardItems(ranked);
  if (lead.length === 0) return null;
  const itemIds = lead.map((item) => item.id);
  const video = archive.videos[lang];
  return {
    bullets: toBullets(lead, lang),
    itemIds,
    version: dayCardVersion(itemIds),
    youtubeId: video?.youtube_id ?? video?.short_id ?? null,
  };
}

export interface DigestPage {
  digest: DailyDigest;
  /** Card token; absent when the edition stands in for the card. */
  version?: string;
  youtubeId?: string | null;
}

/** The digest's stories: the day card when the day has stories, else the edition. */
export async function digestPage(
  env: Pick<Env, "DB">,
  digest: DailyDigest
): Promise<DigestPage> {
  try {
    const card = await loadDayCard(env, digest.date, digest.lang);
    if (!card) return { digest };
    return {
      digest: { ...digest, bullets: card.bullets },
      version: card.version,
      youtubeId: card.youtubeId,
    };
  } catch (error) {
    console.error(
      `telegram day card stories failed for ${digest.date}: ${error instanceof Error ? error.message : "unknown"}`
    );
    return { digest };
  }
}
