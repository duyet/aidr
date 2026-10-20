#!/usr/bin/env node
// Measure the loudest moment of each effect in assets/sfx and write assets/sfx/peaks.json
// ({ name: { peak, duration } } in seconds), so build.mjs can place each effect's peak on its hit.
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(import.meta.dirname, "../assets/sfx");
const SR = 48000;
const out = {};
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".mp3")).sort()) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", join(DIR, file), "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], { maxBuffer: 1e8 });
  const s = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
  // Loudest 5 ms window, so a single spike does not win over the body of the hit.
  const win = SR / 200;
  const energy = [];
  for (let i = 0; i + win <= s.length; i += win / 2) {
    let e = 0;
    for (let j = 0; j < win; j++) e += s[i + j] * s[i + j];
    energy.push([e, i + win / 2]);
  }
  // The hit is where the sound first reaches 70% of its loudest window: for a bass impact with a
  // long swell, that is the transient the eye pairs with the visual, not the later body.
  const max = Math.max(...energy.map(([e]) => e));
  const at = energy.find(([e]) => e >= max * 0.7)[1];
  out[file.replace(/\.mp3$/, "")] = { peak: +(at / SR).toFixed(3), duration: +(s.length / SR).toFixed(3) };
}
writeFileSync(join(DIR, "peaks.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(out);
