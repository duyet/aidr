// The cut's language. English is the default; `--lang vi` makes the Vietnamese cut from script.vi.json,
// with its own voice, output, caption and render files next to the English ones.
export function cutOf(argv) {
  const i = argv.indexOf("--lang");
  return cutFor(i > 0 ? argv[i + 1] : "en");
}

export function cutFor(lang) {
  if (!["en", "vi"].includes(lang)) throw new Error(`--lang ${lang}: en | vi`);
  const dot = lang === "en" ? "" : `.${lang}`;
  const dash = lang === "en" ? "" : `-${lang}`;
  return {
    lang,
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

// A weekly edition's directory (and "date" argument) is `week-<YYYY-Www>`, e.g. week-2026-W41.
export const isWeekly = (date) => /^week-\d{4}-W\d{2}$/.test(date);
