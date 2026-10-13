// STATUS.json rows (one per cut, `<date>-<lang>-<fmt>`) and which cuts a step still has to do.
// Pure helpers; publish.mjs reads and writes the file.
import { join } from "node:path";
import { cutFor, formatsOf } from "./lang.mjs";

export const cutName = (date, lang, fmt) => `${date}-${lang}-${fmt}`;

/** Add a queued row for every cut of `langs` that `rows` does not have yet (visub: 16:9 only). */
export function addRows(rows, { date, langs, config, dir }) {
  for (const lang of langs) {
    const c = cutFor(lang);
    for (const fmt of formatsOf(c, config)) {
      const cut = cutName(date, lang, fmt);
      if (rows.some((r) => r.cut === cut)) continue;
      rows.push({
        cut,
        lang,
        fmt,
        path: join(dir, "renders", c.video(date, fmt)),
        cover: join(dir, "renders", c.cover(date, fmt)),
        state: "queued",
      });
    }
  }
  return rows;
}

/** Whether a cut goes to YouTube and the day page. visub does not: its YouTube button links the English video. */
export const onYouTube = (lang) => !cutFor(lang).subs;

/** A cut renders unless its files exist (a visub cover is the English one, made by the English render) or,
 *  without renderPublished, it is already on the day page. */
export function needsRender(r, { renderPublished = false, exists }) {
  if (!renderPublished && r.youtube?.id) return false;
  return !exists(r.path) || (onYouTube(r.lang) && !exists(r.cover));
}

/** Cuts the telegram step still posts: the requested languages' `fmt` cut without a channel post (`telegram`; a
 *  staging or --chat send is `telegramTest` and does not count). The Vietnamese channel takes one video a day, so
 *  visub is skipped once the Vietnamese-voice cut is there. */
export function telegramTodo(rows, langs, fmt) {
  const viPosted = rows.some((r) => r.lang === "vi" && r.telegram);
  return rows.filter((r) => langs.includes(r.lang) && r.fmt === fmt && !r.telegram && !(r.lang === "visub" && viPosted));
}
