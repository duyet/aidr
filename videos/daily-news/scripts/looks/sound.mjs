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
  "impact-bass-2": { peak: 0.045, level: -1.7 },
  "key-press": { peak: 0.075, level: -36.3 },
  notification: { peak: 0.095, level: -15.6 },
  ping: { peak: 0.325, level: -23.6 },
  sparkle: { peak: 0.03, level: -6.3 },
  whoosh: { peak: 0.165, level: -15.2 },
  "whoosh-cinematic": { peak: 2.35, level: -9.5 },
};

/**
 * Each cue's pool. The first file is the cue's reference: it plays at gain 1 and the others are trimmed to its
 * level (`gainFor`), so the mix sits where it always did whichever file the day draws. Pool members share a shape
 * (impact, tonal alert, bright chime, tick), so their hits also agree within about 1 dB over a 50 ms window
 * (sound-measure.mjs prints it); a short pop beside a long sparkle would be 11 dB apart. The whooshes are the one
 * exception the library leaves: the cinematic swell's crest sits 4 dB under the short whoosh at 50 ms.
 */
export const POOLS = {
  open: ["impact-bass-2", "impact-bass-1"],
  storyIn: ["whoosh", "whoosh-cinematic"],
  rankHit: ["impact-bass-1", "impact-bass-2"],
  statHit: ["ping", "notification"],
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
