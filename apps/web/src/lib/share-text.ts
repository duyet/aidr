import { dayArchivePath } from "./day-archive";
import { localizedTitle } from "./display-title";
import { formatDayHeading } from "./lang";
import { absoluteSiteUrl } from "./locale-url";
import { storyPath } from "./slug";
import type { Lang } from "./types";

type ShareItem = { id: string; title: string; title_vi: string | null };

/** Stories a copied day lists; the day page link carries the rest. */
export const DAY_SHARE_LIMIT = 10;

/** Title, then its aidr.today link: what a social post needs. On a phone
 *  the title is a link, so it cannot be selected as text. */
export function storyShareText(item: ShareItem, lang: Lang): string {
  return `${localizedTitle(item, lang).text}\n${absoluteSiteUrl(storyPath(item), lang)}`;
}

export function dayShareText(
  date: string,
  items: readonly ShareItem[],
  lang: Lang
): string {
  const heading =
    lang === "vi"
      ? `Tin AI nổi bật, ${formatDayHeading(date, lang)}`
      : `Top AI stories, ${formatDayHeading(date, lang)}`;
  const stories = items
    .slice(0, DAY_SHARE_LIMIT)
    .map((item, i) => `${i + 1}. ${storyShareText(item, lang)}`);
  const more =
    lang === "vi"
      ? `Xem tất cả: ${absoluteSiteUrl(dayArchivePath(date), lang)}`
      : `All stories: ${absoluteSiteUrl(dayArchivePath(date), lang)}`;
  return [heading, ...stories, more].join("\n\n");
}
