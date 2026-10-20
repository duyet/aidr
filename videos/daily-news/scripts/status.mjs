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

/** A cut renders unless its video and cover exist or, without renderPublished, it is already on the day page. */
export function needsRender(r, { renderPublished = false, exists }) {
  if (!renderPublished && r.youtube?.id) return false;
  return !exists(r.path) || !exists(r.cover);
}

/** Cuts the telegram step still posts: the requested languages' `fmt` cut without a channel post (`telegram`; a
 *  staging or --chat send is `telegramTest` and does not count). The Vietnamese channel takes one video a day, so
 *  visub is skipped once the Vietnamese-voice cut is there. */
export function telegramTodo(rows, langs, fmt) {
  const viPosted = rows.some((r) => r.lang === "vi" && r.telegram);
  return rows.filter(
    (r) =>
      langs.includes(r.lang) &&
      r.fmt === fmt &&
      !r.telegram &&
      !(r.lang === "visub" && viPosted)
  );
}

/** Which cut the Vietnamese day page shows: "vi", "visub" or null. `pages` holds the live day pages' ids,
 *  { en: { "16x9", "9x16" }, vi: { ... } }. A STATUS row with the same id decides; else the shape does: attach sets
 *  the Vietnamese-voice cut's 16:9 and Short together, and the subtitled cut has a 16:9 only. A Worker without
 *  per-language videos serves the English ids on ?lang=vi, which is no Vietnamese video. */
export function viPageCut(pages, rows) {
  const vi = pages.vi ?? {};
  const en = pages.en ?? {};
  const ids = [vi["16x9"], vi["9x16"]].filter(Boolean);
  if (!ids.length || ids.some((id) => id === en["16x9"] || id === en["9x16"]))
    return null;
  const known = rows.find(
    (r) => r.lang !== "en" && ids.includes(r.youtube?.id)
  );
  if (known) return known.lang;
  return vi["9x16"] ? "vi" : "visub";
}

/** The day-page ids a cut's rows may take as already uploaded: its page's ids when that page shows this cut. */
export function seedIds(lang, pages, rows) {
  if (cutFor(lang).page === "en") return pages.en ?? {};
  return viPageCut(pages, rows) === lang ? (pages.vi ?? {}) : {};
}

/** The Vietnamese page shows one video a day and the Vietnamese-voice cut takes precedence: the subtitled cut is
 *  not uploaded or attached once the voice cut has a video (STATUS, or the live page: `viPage`) or is in this run. */
export const voiceFirst = (rows, langs, viPage) =>
  viPage === "vi" ||
  langs.includes("vi") ||
  rows.some((r) => r.lang === "vi" && r.youtube?.id);

/** Cuts the upload step still uploads: no YouTube id yet (YouTube cannot replace a file). */
export function uploadTodo(rows, langs, viPage = null) {
  const skipSubs = voiceFirst(rows, langs, viPage);
  return rows.filter(
    (r) =>
      langs.includes(r.lang) &&
      !r.youtube?.id &&
      !(r.lang === "visub" && skipSubs)
  );
}

/** Languages the attach step still attaches: a cut with an id (any, on a dry run) that is not attached yet. */
export function attachTodo(rows, langs, { viPage = null, dry = false } = {}) {
  const skipSubs = voiceFirst(rows, langs, viPage);
  return langs.filter(
    (l) =>
      !(l === "visub" && skipSubs) &&
      rows.some((r) => r.lang === l && (dry || r.youtube?.id) && !r.attached)
  );
}

/** `agent day-video` args for a language's cuts: its page language, and a flag per format it has. visub has no
 *  Short, so the stored one is kept. */
export function dayVideoArgs({ date, lang, rows, title }) {
  const cuts = rows.filter((r) => r.lang === lang);
  const id = (fmt) =>
    cuts.find((r) => r.fmt === fmt)?.youtube?.id ?? `<${fmt} id>`;
  const args = ["day-video", date, "--lang", cutFor(lang).page];
  if (cuts.some((r) => r.fmt === "16x9")) args.push("--video", id("16x9"));
  if (cuts.some((r) => r.fmt === "9x16")) args.push("--short", id("9x16"));
  if (title) args.push("--title", title);
  return args;
}

/** `agent day-video-posted` args for a cut's channel post: the channel of its page language (visub posts to the
 *  Vietnamese channel). The day video watchdog reads this record; Telegram cannot be read back. */
export function dayVideoPostedArgs(date, r) {
  return [
    "day-video-posted",
    date,
    "--channel",
    `telegram-${cutFor(r.lang).page}`,
    "--ref",
    `${r.telegram.chat_id}/${r.telegram.message_id}`,
  ];
}

/** Uploader args for a row (bin/yt-upload and bin/yt-upload-api.mjs). Metadata: posts.md, or visub's own JSON
 *  (Vietnamese title and description over English audio). */
export function uploadArgs(r, dir) {
  const c = cutFor(r.lang);
  const kind = r.fmt === "9x16" ? "short" : "long";
  const meta = join(dir, c.subs?.youtube ?? "posts.md");
  const args = [
    r.path,
    "--meta",
    meta,
    "--lang",
    c.page,
    "--audio-lang",
    c.audio,
    "--kind",
    kind,
  ];
  if (kind === "long") args.push("--cover", r.cover);
  return args;
}

/** What an uploader printed: ID= comes before the thumbnail, playlist and oEmbed steps, so a failed run can still
 *  have made the video. DONE=<step> is printed as each of those steps completes. */
export function parseUpload(out) {
  const line = (k) =>
    out.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() || undefined;
  return {
    id: line("ID"),
    url: line("URL"),
    oembed: line("OEMBED"),
    done: [...out.matchAll(/^DONE=(\w+)$/gm)].map((m) => m[1]),
    fail: out.match(/^FAIL: (.*)$/m)?.[1],
  };
}

/** The steps after the upload that a cut needs: a thumbnail for the 16:9 (Shorts get none), the AI;DR playlist, and
 *  the public oEmbed check. */
export const finishSteps = (r, privacy) => [
  ...(r.fmt === "16x9" ? ["thumb"] : []),
  "playlist",
  ...(privacy === "public" ? ["oembed"] : []),
];

/** The steps in `needed` that the uploader did not report done. */
export const pendingSteps = (needed, up) =>
  needed.filter((s) => !up.done.includes(s));

/** Cuts already on YouTube whose thumbnail, playlist or oEmbed step failed: the upload step finishes them. */
export const finishTodo = (rows, langs) =>
  rows.filter((r) => langs.includes(r.lang) && r.youtube?.pending?.length);
