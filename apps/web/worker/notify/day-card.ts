import {
  DAY_CARD_CANDIDATES,
  hasDayOgCopy,
  splitDayHighlights,
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
import type { Env } from "../types.js";
import { firstSentence } from "./fit-text.js";
import type { DailyDigest, DigestBullet } from "./types.js";

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
 *  caption fitter drops clauses whole when the tiles do not all fit. */
const HIGHLIGHT_SUMMARY_CAP = 160;

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

/** The headline, and the first sentence of that language's summary when it
 *  fits whole. A long first sentence is left out rather than cut. */
export function highlightParts(
  item: HighlightCopy,
  lang: Lang
): { title: string; extra: string | null } {
  const title = localizedTitle(item, lang).text.replace(/\s+/g, " ").trim();
  const summary = sameLanguageSummary(item, lang);
  if (!summary) return { title, extra: null };
  let extra = summary;
  if (extra.toLowerCase().startsWith(title.toLowerCase())) {
    extra = extra.slice(title.length).replace(/^[\s.:;—–-]+/, "");
  }
  const sentence = extra ? firstSentence(extra) : "";
  if (
    !sentence ||
    sentence.length > HIGHLIGHT_SUMMARY_CAP ||
    sentence.toLowerCase() === title.toLowerCase()
  ) {
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
 *  the caption fitter falls back to. Absent when there is no clause. */
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

function moreHeadline(lang: Lang, date: string): string {
  return lang === "en"
    ? `✨ More highlights — ${date}`
    : `✨ Thêm tin nổi bật — ${date}`;
}

/**
 * The stories painted on the day's card, then the next highlights when
 * the lead grid cannot hold them. Same archive read as the OG card,
 * including the manifest thumbnail, so the caption names those tiles.
 * Calendar day in the audience zone, not the rolling 24h TL;DR.
 */
export async function loadDayCardPages(
  env: Pick<Env, "DB">,
  date: string,
  lang: Lang
): Promise<DayCardPage[] | null> {
  if (!env.DB) return null;
  const archive = await getDayArchive(readSession(env.DB), date);
  const ranked = (archive.day?.items ?? [])
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
