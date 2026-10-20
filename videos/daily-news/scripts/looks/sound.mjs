// The daily sound: which effect plays on each cue and where the music bed starts, rotated by date like the look
// (look.mjs `rotate`), so every cue and the bed change every day and each pool member shows once per cycle.
// Effects live in config.sfx.dir (manifest.json names them). The measured tables below come from
// scripts/sound-measure.mjs, which says how peak, level and the bed's phrase starts are measured: rerun it rather
// than editing a number by hand.
import { dayNumber, rotate } from "../look.mjs";

/** Measured per file. `peak`: seconds from the file's start to its hit; `level`: max momentary loudness, LUFS. */
export const SFX = {
  chime: { peak: 0.42, level: -23.9 },
  "click-soft": { peak: 0.055, level: -25.8 },
  "impact-bass-1": { peak: 0.07, level: -4 },
  "impact-bass-2": { peak: 0.085, level: -1.7 },
  "key-press": { peak: 0.07, level: -36.3 },
  ping: { peak: 0.325, level: -23.6 },
  pop: { peak: 0.12, level: -21.2 },
  sparkle: { peak: 0.05, level: -6.3 },
  whoosh: { peak: 0.16, level: -15.2 },
  "whoosh-cinematic": { peak: 2.445, level: -9.5 },
};

/**
 * Each cue's pool. The first file is the cue's reference: it plays at gain 1 and the others are trimmed to its
 * level (`gainFor`), so the mix sits where it always did whichever file the day draws. Pool members share a shape
 * (impact, tonal alert, bright chime, tick), so their hits also agree within about 1 dB over a 50 ms window
 * (sound-measure.mjs prints it); a short pop beside a long sparkle would be 11 dB apart. The library leaves two
 * exceptions: the cinematic swell's crest sits 4 dB under the short whoosh at 50 ms, and pop's hit sits 7 dB over
 * ping's. The library has no second tonal alert: notification's louder second note comes 5 frames after its
 * first, so one of the two always misses the stat.
 */
export const POOLS = {
  open: ["impact-bass-2", "impact-bass-1"],
  storyIn: ["whoosh", "whoosh-cinematic"],
  rankHit: ["impact-bass-1", "impact-bass-2"],
  statHit: ["ping", "pop"],
  tick: ["click-soft", "key-press"],
  outro: ["chime", "sparkle"],
};

/**
 * The bed (config.music.file): its measured length and the phrase starts that open on full music. A start is kept
 * only while its kind's longest cut still ends inside the bed: daily stops at 56 (fits 124 s; the longest edition
 * so far ran 117 s, 2026-10-10), weekly at 24 (fits 156 s; 8 stories, estimated at 150 s, none built yet).
 */
export const BED = {
  duration: 180,
  starts: { daily: [0, 16, 24, 32, 40, 48, 56], weekly: [0, 16, 24] },
};

/**
 * `start` when a `total`-second cut still ends inside the bed from it, else the latest earlier phrase start that
 * does (BED.starts.daily lists every phrase start in use). 0 when none does; build.mjs then fails on the overrun.
 */
export function bedStartFor(start, total) {
  return Math.max(
    0,
    ...BED.starts.daily.filter((s) => s <= start && s + total <= BED.duration)
  );
}

/** The file for each cue and the bed start on `dateKey` ("YYYY-MM-DD" or "week-YYYY-Www"). Every cut of a day gets the same. */
export function soundFor(dateKey) {
  const day = dayNumber(dateKey);
  const kind = dateKey.startsWith("week-") ? "weekly" : "daily";
  return {
    sfx: Object.fromEntries(
      Object.entries(POOLS).map(([cue, pool]) => [
        cue,
        rotate(pool, day, `sfx:${cue}`),
      ])
    ),
    bedStart: rotate(BED.starts[kind], day, "bed"),
  };
}

/** The gain that plays `name` on `cue` at the level of the cue's reference file. */
export function gainFor(cue, name) {
  return 10 ** ((SFX[POOLS[cue][0]].level - SFX[name].level) / 20);
}

/**
 * Every effect of a cut as [cue, at, gain], `at` being when the effect peaks. Each `at` is a hit key: the frame
 * its element is first legible (S.rankAt, S.statAt and O.hit end their fade, choreography.mjs FADE), the wipe's
 * mid-cover (W.hit), or the intro's own cues.
 * `open` is the one cue with no visual: it opens the bed over frame 0, the still thumbnail.
 */
export function cuesFor({ wipes, stories, outro }, introCues) {
  return [
    ["open", 0.25, 1.0],
    ...wipes.map((w) => ["storyIn", w.hit, 0.8]),
    ...stories.map((s) => ["rankHit", s.rankAt, 0.55]),
    ...stories.map((s) => ["statHit", s.statAt, 0.5]),
    ["outro", outro.hit, 0.8],
    ...introCues,
  ];
}
