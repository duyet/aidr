import {
  digestCampaign,
  postContent,
  STORY_CAMPAIGN,
  type UtmTag,
  withUtm,
} from "../../worker/utm.js";
import { dayArchivePath } from "./day-archive";
import { localizedTitle } from "./display-title";
import { formatDayHeading } from "./lang";
import { absoluteSiteUrl } from "./locale-url";
import { storyPath } from "./slug";
import type { Lang } from "./types";

type ShareItem = { id: string; title: string; title_vi: string | null };

/** Stories a copied day lists; the day page link carries the rest. */
export const DAY_SHARE_LIMIT = 10;

/** A reader pastes this anywhere, so the platform is unknown: `share`. */
function shareTag(campaign: string, content: string): UtmTag {
  return { source: "share", medium: "social", campaign, content };
}

function storyLine(item: ShareItem, lang: Lang, tag: UtmTag): string {
  const url = withUtm(absoluteSiteUrl(storyPath(item), lang), tag);
  return `${localizedTitle(item, lang).text}\n${url}`;
}

/** Title, then its aidr.today link: what a social post needs. On a phone
 *  the title is a link, so it cannot be selected as text. */
export function storyShareText(item: ShareItem, lang: Lang): string {
  return storyLine(
    item,
    lang,
    shareTag(STORY_CAMPAIGN, postContent("copy", item.id))
  );
}

export function dayShareText(
  date: string,
  items: readonly ShareItem[],
  lang: Lang
): string {
  const campaign = digestCampaign(date);
  const heading =
    lang === "vi"
      ? `Tin AI nổi bật, ${formatDayHeading(date, lang)}`
      : `Top AI stories, ${formatDayHeading(date, lang)}`;
  const stories = items
    .slice(0, DAY_SHARE_LIMIT)
    .map(
      (item, i) =>
        `${i + 1}. ${storyLine(item, lang, shareTag(campaign, postContent("list", item.id)))}`
    );
  const dayUrl = withUtm(
    absoluteSiteUrl(dayArchivePath(date), lang),
    shareTag(campaign, "all")
  );
  const more =
    lang === "vi" ? `Xem tất cả: ${dayUrl}` : `All stories: ${dayUrl}`;
  return [heading, ...stories, more].join("\n\n");
}
