// The cut's language. English is the default; `--lang vi` makes the Vietnamese cut from script.vi.json,
// with its own voice, output, caption and render files next to the English ones.
// `--lang visub` is the English cut with Vietnamese subtitles: the English script, voice, mix, timing and
// 16:9 cover, with only the burned-in captions swapped (captions.visub.json, written by visub.mjs). It renders
// 16:9 at 1080p for the Vietnamese Telegram channel and never goes to YouTube or Facebook.
export const LANGS = ["en", "vi", "visub"];

export function cutOf(argv) {
  const i = argv.indexOf("--lang");
  return cutFor(i > 0 ? argv[i + 1] : "en");
}

export function cutFor(lang) {
  if (!LANGS.includes(lang)) throw new Error(`--lang ${lang}: ${LANGS.join(" | ")}`);
  if (lang === "visub") return subsCut();
  const dot = lang === "en" ? "" : `.${lang}`;
  const dash = lang === "en" ? "" : `-${lang}`;
  return {
    lang,
    // Language of the screen text and labels.
    screen: lang,
    // Translated captions over another cut's voice (visub only).
    subs: null,
    // null = every format in config.json.
    formats: null,
    args: lang === "en" ? [] : ["--lang", lang],
    script: `script${dot}.json`,
    voice: `voice${dash}`,
    out: `out${dash}`,
    captions: `captions${dot}.srt`,
    timeline: `timeline${dot}.json`,
    snap: (fmt) => `snap${dash}-${fmt}`,
    video: (date, fmt) =>
      isWeekly(date)
        ? `aidr-weekly-${date.slice(5)}${dash}-${fmt}-4k.mp4`
        : `aidr-daily-${date}${dash}-${fmt}-4k.mp4`,
    cover: (date, fmt) =>
      isWeekly(date)
        ? `cover-weekly-${date.slice(5)}${dash}-${fmt}.png`
        : `cover-${date}${dash}-${fmt}.png`,
  };
}

function subsCut() {
  const en = cutFor("en");
  return {
    ...en,
    lang: "visub",
    screen: "en",
    subs: { lang: "vi", json: "captions.visub.json", srt: "captions.visub.srt" },
    formats: ["16x9"],
    // Telegram gets a 1080p copy anyway, so the extra render is 1080p, not 4K.
    resolution: { "16x9": "landscape" },
    args: ["--lang", "visub"],
    out: "out-visub",
    captions: "captions.visub.srt",
    snap: (fmt) => `snap-visub-${fmt}`,
    video: (date, fmt) => `aidr-daily-${date}-visub-${fmt}-1080p.mp4`,
    // Same screen as the English cut, so the English cover.
    cover: en.cover,
  };
}

/** The formats a cut renders: its own list, else every format in config.json. */
export const formatsOf = (cut, config) => cut.formats ?? Object.keys(config.formats);

// A weekly edition's directory (and "date" argument) is `week-<YYYY-Www>`, e.g. week-2026-W41.
export const isWeekly = (date) => /^week-\d{4}-W\d{2}$/.test(date);
