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

/** "U.S." and "Ph.D." — a period after a single capital, at a word start
 *  or after another initial, is not the end of the sentence. */
function isInitialismPeriod(value: string, index: number): boolean {
  if (value[index] !== ".") return false;
  const prev = value[index - 1];
  if (!prev || !/^[A-Z]$/.test(prev)) return false;
  const before = value[index - 2];
  return before === undefined || before === "." || /\s/.test(before);
}

/** The first sentence, including its closing mark. A period only counts
 *  when whitespace follows and it is not an initialism. */
function firstSentence(value: string): string {
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
    if (isInitialismPeriod(value, i)) continue;
    if (i + 1 >= value.length || !/\s/.test(value[i + 1] ?? "")) continue;
    return value.slice(0, i + 1);
  }
  return value;
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
  const sentence = firstSentence(extra);
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
