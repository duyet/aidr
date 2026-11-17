import {
  digestCampaign,
  postContent,
  STORY_CAMPAIGN,
  type UtmTag,
  withUtm,
} from "../../worker/utm.js";
import { splitParagraphs } from "../components/story/lib";
import { dayArchivePath } from "./day-archive";
import { localizedTitle } from "./display-title";
import { formatDayHeading } from "./lang";
import { absoluteSiteUrl } from "./locale-url";
import { storyPath } from "./slug";
import type { Lang } from "./types";

type ShareItem = { id: string; title: string; title_vi: string | null };

/** Reader style overrides carried on shared story links (`?font=&fs=`). */
export type StoryStyle = { font?: "sans" | "serif"; fontSize?: number };

function styleQuery(style?: StoryStyle): string {
  const parts: string[] = [];
  if (style?.font && style.font !== "sans") parts.push(`font=${style.font}`);
  if (style?.fontSize != null && style.fontSize !== 1) {
    parts.push(`fs=${String(Math.round(style.fontSize * 100) / 100)}`);
  }
  return parts.length > 0 ? `&${parts.join("&")}` : "";
}

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

/** Copy formats on the story page's "Copy for social" sheet. Each tags its
 *  link with its own `utm_content` slot, so a landing names the format that
 *  was pasted: `aidr-`, `copy-` (the same link as `storyShareText`) and
 *  `x-`, plus `link-` for "Copy link". */
export const STORY_POST_FORMATS = ["aidr", "title", "x"] as const;
export type StoryPostFormat = (typeof STORY_POST_FORMATS)[number];

type PostItem = ShareItem & {
  summary: string | null;
  summary_vi: string | null;
};

/** X counts a link as 23 characters and Threads allows 500. Counting the
 *  real link length keeps the post inside 280 on every platform. */
export const X_POST_LIMIT = 280;

function storyLink(
  item: ShareItem,
  lang: Lang,
  slot: string,
  style?: StoryStyle
): string {
  return (
    withUtm(
      absoluteSiteUrl(storyPath(item), lang),
      shareTag(STORY_CAMPAIGN, postContent(slot, item.id))
    ) + styleQuery(style)
  );
}

/** The bare story link for "Copy link". */
export function storyShareLink(
  item: ShareItem,
  lang: Lang,
  style?: StoryStyle
): string {
  return storyLink(item, lang, "link", style);
}

/** The summary the story page shows for `lang`: the Vietnamese text when
 *  there is one, else the English summary the page falls back to. */
export function storySummaryFor(item: PostItem, lang: Lang): string {
  const text =
    lang === "vi" && item.summary_vi?.trim() ? item.summary_vi : item.summary;
  return splitParagraphs(text).join(" ");
}

/** Cut `text` to at most `max` characters on a word boundary, ending "…". */
export function trimToLength(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  if (max < 2) return "";
  const cut = chars.slice(0, max - 1).join("");
  const space = cut.lastIndexOf(" ");
  const head = space > cut.length / 2 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s,.;:-]+$/u, "")}…`;
}

/**
 * Post text for one copy format:
 * - `aidr`: title, blank line, "AI;DR: " and the summary, blank line, link.
 *   A story with no summary gets the title and the link.
 * - `title`: title, then link: exactly `storyShareText`.
 * - `x`: the title trimmed so title, newline and link fit in 280 characters.
 */
export function storyPostText(
  item: PostItem,
  lang: Lang,
  format: StoryPostFormat,
  style?: StoryStyle
): string {
  if (format === "title") return storyShareText(item, lang);
  const title = localizedTitle(item, lang).text;
  if (format === "x") {
    const url = storyLink(item, lang, "x", style);
    const room = X_POST_LIMIT - Array.from(url).length - 1;
    return `${trimToLength(title, room)}\n${url}`;
  }
  const url = storyLink(item, lang, "aidr", style);
  const summary = storySummaryFor(item, lang);
  return summary
    ? `${title}\n\nAI;DR: ${summary}\n\n${url}`
    : `${title}\n${url}`;
}
