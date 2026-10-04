import { localizedTitle, looksVietnamese } from "./display-title";
import type { Lang } from "./types";

/** 3×2 grid; a thin day falls back to 2×2 or one row. Same rule as the card. */
export function dayCardTileCount(available: number): number {
  if (available >= 6) return 6;
  if (available >= 4) return 4;
  return Math.max(0, Math.min(3, available));
}

/** Aggregator images that are only the headline set in type. They repeat
 *  the tile title, so they do not count as a photo. */
const HEADLINE_CARD_HOSTS = new Set(["huggingnews.com", "marketbrief.now"]);

/**
 * True when the item has a headline in the card's language. No fallback: an
 * English card never shows a Vietnamese source title, and a Vietnamese card
 * never shows an untranslated English one.
 */
export function hasDayOgCopy(
  item: { title: string; title_vi: string | null },
  lang: Lang
): boolean {
  if (lang === "en") return !looksVietnamese(item.title);
  const vi = localizedTitle(item, lang);
  return !vi.fallbackFromEnglish && looksVietnamese(vi.text);
}

export function isDayCardPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (HEADLINE_CARD_HOSTS.has(host) && u.pathname.startsWith("/og/")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The day card's tiles, in the order the grid paints them.
 *
 * Rank order within two groups: stories with a real photo, then the rest.
 * A failed photo download stays in its slot as a text tile. Reordering
 * after the download is what made the Telegram caption (a different list)
 * disagree with the image.
 */
export function pickDayCardItems<T extends { image_url?: string | null }>(
  ranked: readonly T[]
): T[] {
  const photos: T[] = [];
  const rest: T[] = [];
  for (const item of ranked) {
    if (isDayCardPhotoUrl(item.image_url)) photos.push(item);
    else rest.push(item);
  }
  const ordered = [...photos, ...rest];
  return ordered.slice(0, dayCardTileCount(ranked.length));
}
