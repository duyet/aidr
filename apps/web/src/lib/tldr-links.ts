import type { TldrCount } from "./prefs";
import { storyPath } from "./slug";
import type { Lang, TldrBullet } from "./types";

/**
 * The AI;DR section's own arithmetic, lifted out of the component so the
 * homepage JSON-LD `ItemList` (#224) is derived from the same two answers the
 * paint uses.
 *
 * `TldrSection` shows `bullets.slice(0, tldrShownCount(...))` and anchors each
 * shown bullet to `storyPath({ id: bullet.item_ids[0] }, lang)`. Building the
 * `ItemList` from these functions is what makes "the `ItemList` contains only
 * story URLs that are present as `<a href>` in the same SSR HTML" a structural
 * guarantee instead of a promise: a bullet with no `item_ids[0]` renders no
 * anchor, and `tldrAnchorStoryPaths` drops it for the same reason.
 */

/** The 8 | 12 | 16 picker. With x = bullets.length: x <= 8 hides the selector
 *  (show all, no picker); x > 8 shows 8 | min(x, 12), and if x > 12 also
 *  min(x, 16) when that differs from min(x, 12). The persisted pref keeps its
 *  nominal 8/12/16 value while the effective count is capped at x. */
export function tldrCountOptions(
  bulletCount: number
): { effective: number; nominal: TldrCount }[] {
  const options: { effective: number; nominal: TldrCount }[] = [];
  if (bulletCount > 8) {
    options.push({ effective: 8, nominal: 8 });
    const cap12 = Math.min(bulletCount, 12);
    options.push({ effective: cap12, nominal: 12 });
    if (bulletCount > 12) {
      const cap16 = Math.min(bulletCount, 16);
      if (cap16 !== cap12) options.push({ effective: cap16, nominal: 16 });
    }
  }
  return options;
}

/**
 * How many bullets the section paints for a stored preference. An unknown
 * nominal (or one past the end of the list) falls back to the highest offered
 * option, and to every bullet when the selector is hidden.
 */
export function tldrShownCount(bulletCount: number, count: TldrCount): number {
  const options = tldrCountOptions(bulletCount);
  const selectedOption =
    options.find((option) => option.nominal === count) ??
    options[options.length - 1];
  return selectedOption ? selectedOption.effective : bulletCount;
}

/**
 * Canonical `/{8hex}?lang=` hrefs of the anchors the section paints, in paint
 * order. One entry per bullet that has a primary item id — the same test
 * `TldrBulletList` makes before wrapping the row in an `<a href>`.
 */
export function tldrAnchorStoryPaths(
  bullets: TldrBullet[],
  lang: Lang
): string[] {
  const paths: string[] = [];
  for (const bullet of bullets) {
    const primaryId = bullet.item_ids?.[0];
    if (!primaryId) continue;
    // `index.tsx` builds its `pathByItemId` with the same `storyPath(item,
    // lang)` call and the same `item.id` key, so this is identical to the
    // rendered href rather than an approximation of it.
    paths.push(storyPath({ id: primaryId }, lang));
  }
  return paths;
}
