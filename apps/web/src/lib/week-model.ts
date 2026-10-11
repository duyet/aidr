/**
 * Weekly edition shapes and pure helpers. No D1 or Worker imports: the
 * `/week` page and WeeklyPaper ship this to the browser, so anything that
 * pulls in `feed-queries` (and through it `worker/llm`) must stay in
 * `week-queries.ts`.
 */
import type { FeedItem, Lang } from "./types";

export interface WeekStory {
  rank: number;
  item: FeedItem;
  /** The edition's line for this story; null when that language has none. */
  text_en: string | null;
  text_vi: string | null;
}

export interface WeekEdition {
  week: string;
  issue: number;
  start_date: string;
  end_date: string;
  intro_en: string | null;
  intro_vi: string | null;
  stories: WeekStory[];
  /** Nearest earlier / later week that has an edition. */
  prevWeek: string | null;
  nextWeek: string | null;
  updated_at: number;
}

export interface WeekSummary {
  week: string;
  issue: number;
  start_date: string;
  end_date: string;
  intro_en: string | null;
  intro_vi: string | null;
  stories: number;
}

export function parseJsonArray(raw: unknown): unknown[] {
  if (typeof raw !== "string") return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** `{item_id, text}` lines keyed by item id; anything malformed is skipped. */
export function parseStoryLines(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of parseJsonArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { item_id?: unknown; text?: unknown };
    if (typeof e.item_id === "string" && typeof e.text === "string") {
      const text = e.text.trim();
      if (text) out.set(e.item_id, text);
    }
  }
  return out;
}

/** The text for one language only. A story with no line in that language
 * has no text there: the other language is never a stand-in. */
export function weekStoryText(story: WeekStory, lang: Lang): string | null {
  return lang === "vi" ? story.text_vi : story.text_en;
}

/** Stories that have a line in `lang`, in edition order. */
export function weekStoriesFor(edition: WeekEdition, lang: Lang): WeekStory[] {
  return edition.stories.filter((s) => weekStoryText(s, lang) !== null);
}

export function weekIntro(edition: WeekEdition, lang: Lang): string | null {
  return lang === "vi" ? edition.intro_vi : edition.intro_en;
}

/** True when `lang` has nothing to show: the page 404s in that language
 * rather than printing the other one. */
export function isWeekEmptyIn(edition: WeekEdition, lang: Lang): boolean {
  return weekStoriesFor(edition, lang).length === 0;
}
