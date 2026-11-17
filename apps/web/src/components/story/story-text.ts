import { localizedTitle } from "../../lib/display-title";
import { stripTitleMarker } from "../../lib/plain-text";
import type { FeedItem, Lang } from "../../lib/types";

/** One language's copy of a field. `second` marks the smaller muted text
 * under the leading language in bilingual mode. */
export interface StoryTextPart {
  lang: Lang;
  text: string;
  second: boolean;
}

export interface BilingualView {
  bilingual: boolean;
  first: Lang;
}

const present = (text: string | null | undefined): text is string =>
  Boolean(text?.trim());

/** Both columns, the leading language first. A missing column is left out;
 * the other language never fills in for it. */
function columns(text: Record<Lang, string | null | undefined>, first: Lang) {
  const order: Lang[] = first === "vi" ? ["vi", "en"] : ["en", "vi"];
  const shown = order.filter((lang) => present(text[lang]));
  return shown.map<StoryTextPart>((lang, i) => ({
    lang,
    text: text[lang] as string,
    second: i > 0,
  }));
}

/** The suggest-a-correction target of a summary: the only text on screen, or
 * the Vietnamese column when both languages show. */
export function summaryField(
  part: StoryTextPart,
  bilingual: boolean
): "summary" | undefined {
  return bilingual && part.lang !== "vi" ? undefined : "summary";
}

/** The headline in every language the page shows. Alone, a Vietnamese page
 * without a translation shows the English title, marked `en`. */
export function titleParts(
  item: Pick<FeedItem, "title" | "title_vi">,
  lang: Lang,
  view: BilingualView
): StoryTextPart[] {
  if (view.bilingual) {
    return columns(
      {
        vi: stripTitleMarker(item.title_vi ?? ""),
        en: stripTitleMarker(item.title),
      },
      view.first
    );
  }
  const { text, fallbackFromEnglish } = localizedTitle(item, lang);
  return [{ lang: fallbackFromEnglish ? "en" : lang, text, second: false }];
}

/** The AI;DR text in every language the page shows. Alone, a Vietnamese page
 * without a translation shows the English summary, marked `en`. */
export function summaryParts(
  item: Pick<FeedItem, "summary" | "summary_vi">,
  lang: Lang,
  view: BilingualView
): StoryTextPart[] {
  if (view.bilingual) {
    return columns({ vi: item.summary_vi, en: item.summary }, view.first);
  }
  if (lang === "vi" && present(item.summary_vi)) {
    return [{ lang: "vi", text: item.summary_vi, second: false }];
  }
  return present(item.summary)
    ? [{ lang: "en", text: item.summary, second: false }]
    : [];
}
