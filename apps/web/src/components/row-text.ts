import { localizedTitle } from "../lib/display-title";
import type { Prefs } from "../lib/prefs";
import type { FeedItem, Lang } from "../lib/types";

export interface RowText {
  lang: Lang;
  text: string;
  /** The Vietnamese view has no translation yet and shows the English title. */
  fallbackFromEnglish?: boolean;
}

type View = Pick<Prefs, "bilingual" | "bilingualFirst">;

function languages(lang: Lang, view: View): Lang[] {
  if (!view.bilingual) return [lang];
  return view.bilingualFirst === "vi" ? ["vi", "en"] : ["en", "vi"];
}

/**
 * The headline in the reader's language, or both languages in bilingual mode
 * (leading one first). A language with no text of its own is left out, so one
 * never stands in for the other. The single-language Vietnamese view keeps its
 * labelled English fallback (localizedTitle).
 */
export function storyTitles(
  item: Pick<FeedItem, "title" | "title_vi">,
  lang: Lang,
  view: View
): RowText[] {
  if (!view.bilingual) {
    const { text, fallbackFromEnglish } = localizedTitle(item, lang);
    return [{ lang, text, fallbackFromEnglish }];
  }
  const vi = localizedTitle(item, "vi");
  const en = localizedTitle(item, "en").text;
  const own: Record<Lang, string | null> = {
    vi: vi.fallbackFromEnglish ? null : vi.text,
    // A title already written in Vietnamese sits in `title`: show it once.
    en: !vi.fallbackFromEnglish && en === vi.text ? null : en,
  };
  return languages(lang, view).flatMap((l) =>
    own[l] ? [{ lang: l, text: own[l] }] : []
  );
}

/** The summary from each language's own column. No fallback between them. */
export function storySummaries(
  item: Pick<FeedItem, "summary" | "summary_vi">,
  lang: Lang,
  view: View
): RowText[] {
  const own: Record<Lang, string | null> = {
    vi: item.summary_vi?.trim() || null,
    en: item.summary?.trim() || null,
  };
  return languages(lang, view).flatMap((l) =>
    own[l] ? [{ lang: l, text: own[l] }] : []
  );
}
