// Measures the sound library and the music bed, and prints the tables scripts/looks/sound.mjs holds. Rerun it after
// adding a file to a pool or changing config.music.file, and paste the printed SFX / BED values.
//
// Effects (every file in config.sfx.dir/manifest.json), decoded by ffmpeg to mono 48 kHz like the mix:
//   peak   seconds from the file's start to its hit: on the 10 ms RMS envelope (5 ms hop), the first window within
//          6 dB of the loudest one, moved to the loudest window in the 30 ms after it. That lands on a swell's crest,
//          an impact's attack or a chime's strike, never on a later louder note or a sustained tail.
//   level  max momentary loudness (EBU R128 M, 400 ms, K-weighted, ffmpeg ebur128) with 0.5 s of silence appended
//          so a short click fills a whole window. sound.mjs plays every pool member at its reference file's level.
//   hit    max 50 ms RMS, printed per pool after gain: a level check with a window short enough to see the hit.
//   same   files whose decoded audio is identical (whoosh-short is whoosh): one of them can never be a second
//          pool member, because rotating between them changes nothing anyone hears.
// Bed (config.music.file), from the 10 ms energy envelope:
//   grid     the autocorrelation peak of the onset envelope (positive energy rises) between 0.2 s and 1 s, its
//            phase the fold of the envelope at that period. The bed's grid is 0.25 s: eighth notes at 120 BPM
//            (`hyperframes beats` reports the same grid as "240 bpm").
//   phrase   4 bars of 4/4, 32 grid steps (8 s). The bed's sections enter on phrase starts: the `attack` column (the
//            steepest 30 ms energy rise at the start) is about 14 dB at 16, 80 and 112 s, against a grid median of 3.
//   starts   phrase starts whose first 2 s stay full (no 0.25 s bin more than 12 dB under the bed's median):
//            8 s is out, it opens on the break at 8.5-9.75 s. Each prints the longest cut it fits.
// Usage: node scripts/sound-measure.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { POOLS } from "./looks/sound.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const r3 = (n) => Math.round(n * 1000) / 1000;
const db = (v) => 20 * Math.log10(v + 1e-12);

function decode(file, rate) {
  const buf = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-ac",
      "1",
      "-ar",
      String(rate),
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 1 << 30 }
  );
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

function rmsEnvelope(x, rate, win, hop) {
  const [w, h] = [Math.round(rate * win), Math.round(rate * hop)];
  const env = [];
  for (let i = 0; i + w <= x.length; i += h) {
    let s = 0;
    for (let j = i; j < i + w; j++) s += x[j] * x[j];
    env.push(Math.sqrt(s / w));
  }
  return env;
}

function peakOf(x) {
  const [rate, win, hop] = [48000, 0.01, 0.005];
  const env = rmsEnvelope(x, rate, win, hop);
  const loudest = Math.max(...env);
  const first = env.findIndex((v) => v >= loudest / 2);
  const near = env.slice(first, first + Math.round(0.03 / hop) + 1);
  return r3((first + near.indexOf(Math.max(...near))) * hop + win / 2);
}

function levelOf(file) {
  const out = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-af",
      "apad=pad_dur=0.5,ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-",
      "-f",
      "null",
      "-",
    ],
    { maxBuffer: 1 << 26 }
  ).toString();
  const m = [...out.matchAll(/lavfi\.r128\.M=(-?[\d.]+)/g)].map((x) =>
    Number(x[1])
  );
  return Math.round(Math.max(...m) * 10) / 10;
}

const sfxDir = resolve(ROOT, config.sfx.dir);
const manifest = JSON.parse(
  readFileSync(join(sfxDir, "manifest.json"), "utf8")
);
const rows = Object.entries(manifest).map(([name, { file }]) => {
  const x = decode(join(sfxDir, file), 48000);
  return {
    name,
    peak: peakOf(x),
    level: levelOf(join(sfxDir, file)),
    hit: db(Math.max(...rmsEnvelope(x, 48000, 0.05, 0.005))),
    hash: createHash("sha1")
      .update(Buffer.from(x.buffer, x.byteOffset, x.byteLength))
      .digest("hex"),
  };
});
console.log("effect               peak s   level LUFS   same audio as");
for (const r of rows) {
  const same = rows
    .filter((o) => o !== r && o.hash === r.hash)
    .map((o) => o.name);
  console.log(
    `${r.name.padEnd(20)} ${r.peak.toFixed(3).padStart(6)}   ${r.level.toFixed(1).padStart(10)}   ${same.join(", ")}`
  );
}
const pooled = new Set(Object.values(POOLS).flat());
console.log("\nexport const SFX = {");
for (const r of rows
  .filter((r) => pooled.has(r.name))
  .sort((a, b) => a.name.localeCompare(b.name)))
  console.log(
    `  ${JSON.stringify(r.name)}: { peak: ${r.peak}, level: ${r.level} },`
  );
console.log("};");
const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
console.log(
  "\nhit level after gain (max 50 ms RMS, dB): a check on `level` with another window"
);
for (const [cue, pool] of Object.entries(POOLS)) {
  const hits = pool.map(
    (n) => byName[n].hit + byName[pool[0]].level - byName[n].level
  );
  const spread = Math.max(...hits) - Math.min(...hits);
  console.log(
    `${cue.padEnd(8)} ${pool.map((n, i) => `${n} ${hits[i].toFixed(1)}`).join(", ")} · spread ${spread.toFixed(1)}`
  );
}

const RATE = 24000;
const HOP = 0.01;
const bedFile = resolve(ROOT, config.music.file);
const bed = decode(bedFile, RATE);
const duration = r3(bed.length / RATE);
const energy = rmsEnvelope(bed, RATE, HOP, HOP).map((v) => db(v));
const onset = energy.map((v, i) => (i ? Math.max(0, v - energy[i - 1]) : 0));
let lag = 0;
let best = -1;
for (let l = Math.round(0.2 / HOP); l <= Math.round(1 / HOP); l++) {
  let s = 0;
  for (let i = l; i < onset.length; i++) s += onset[i] * onset[i - l];
  if (s > best) [best, lag] = [s, l];
}
const fold = new Array(lag).fill(0);
onset.forEach((v, i) => {
  fold[i % lag] += v;
});
const phase = fold.indexOf(Math.max(...fold));
const grid = lag * HOP;
const mean = (a, b) => {
  const s = energy.slice(Math.max(0, Math.round(a / HOP)), Math.round(b / HOP));
  return s.reduce((p, c) => p + c, 0) / s.length;
};
const PHRASE = 32 * grid;
const attack = (t) => {
  const i = Math.round(t / HOP);
  return Math.max(
    ...[0, 1, 2, 3, 4].map((k) => energy[i + k] - energy[i + k - 3])
  );
};
const gridAttacks = [];
for (let t = phase * HOP; t < duration - 1; t += grid)
  gridAttacks.push(attack(t));
const typical = [...gridAttacks].sort((a, b) => a - b)[gridAttacks.length >> 1];
const bins = [];
for (let t = 0; t + 0.25 <= duration; t += 0.25) bins.push(mean(t, t + 0.25));
const median = [...bins].sort((a, b) => a - b)[bins.length >> 1];
const full = (s) =>
  bins.slice(s / 0.25, (s + 2) / 0.25).every((b) => b >= median - 12);
console.log(
  `\nbed ${duration} s · grid ${r3(grid)} s (${Math.round(60 / grid / 2)} BPM eighths), phase ${r3(phase * HOP)} s · phrase ${r3(PHRASE)} s · median grid attack ${typical.toFixed(1)} dB`
);
console.log("phrase start   attack dB   opens full   longest cut that fits");
for (let s = 0; s + 60 <= duration; s += Math.round(PHRASE)) {
  const rise = s ? attack(s).toFixed(1) : "-";
  console.log(
    `${String(s).padStart(12)}   ${rise.padStart(9)}   ${full(s) ? "yes" : "no "}          ${r3(duration - s)} s`
  );
}
