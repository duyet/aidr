#!/usr/bin/env node
// Build one release film from its film.json, in one language: the 16:9 and 9:16 compositions,
// the voice-over when the language has one, captions, and the sound (one mix at -14 LUFS).
//
//   node scripts/build.mjs v0.1.12                       English: v0.1.12/ and v0.1.12-9x16/
//   node scripts/build.mjs v0.1.12 --lang vi             Vietnamese: v0.1.12-vi/ and v0.1.12-vi-9x16/
//   node scripts/build.mjs v0.1.12 --lang vi --capture   capture that language's pages first
//
// English copy is film.json's top level; film.json "vi" overrides it field by field (scenes by
// index). Each language has its own captures (capture/ for en, capture-<lang>/ otherwise).
//
// Run from videos/releases/. Needs ffmpeg; --capture needs agent-browser; a voice-over needs
// HeyGen auth (`npx hyperframes auth refresh`). Times are seconds. Effects are placed so their
// peak lands on the visual hit.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RELEASES = join(HERE, "..");
const VIDEOS = join(RELEASES, "..");
const BRAND = join(VIDEOS, "brand");
const LAUNCH = join(VIDEOS, "aidr-launch/assets");
// Voice-over providers: HeyGen through media-use, or ElevenLabs (scripts/tts-elevenlabs.mjs).
const TTS = {
  heygen: join(homedir(), ".claude/skills/media-use/audio/scripts/heygen-tts.mjs"),
  elevenlabs: join(HERE, "tts-elevenlabs.mjs"),
};

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build.mjs <release-dir> [--lang en|vi] [--capture]");
const root = join(RELEASES, dir);
const langAt = process.argv.indexOf("--lang");
const lang = langAt > 0 ? process.argv[langAt + 1] : "en";
const base = JSON.parse(readFileSync(join(root, "film.json"), "utf8"));
const merge = (a, b) => {
  // Lists of objects (scenes) merge by index; any other list (rows, stats) is replaced whole.
  const objects = (l) => l.every((x) => x && typeof x === "object" && !Array.isArray(x));
  if (Array.isArray(a) && Array.isArray(b)) return objects(a) && objects(b) ? a.map((x, i) => (i in b ? merge(x, b[i]) : x)) : b;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in a ? merge(a[k], v) : v;
    return out;
  }
  return b === undefined ? a : b;
};
const { vi: _vi, ...english } = base;
if (lang !== "en" && !base[lang]) throw new Error(`film.json has no "${lang}" block`);
const film = lang === "en" ? english : merge(english, base[lang]);
const UI = { inNumbers: "in numbers", releaseNotes: "Release notes", ...film.ui };
const CAPTURE = lang === "en" ? "capture" : `capture-${lang}`;

if (process.argv.includes("--capture")) {
  const specs = Object.entries(film.captures).map(([name, path]) => `${name}=${path}`);
  execFileSync(join(HERE, "capture.sh"), [join(root, CAPTURE), ...specs], { stdio: "inherit" });
}

const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { cwd: root });
const probe = (file) =>
  Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])
      .toString()
      .trim(),
  );
mkdirSync(join(root, "assets/audio/voice"), { recursive: true });
cpSync(join(BRAND, "assets/fonts"), join(root, "assets/fonts"), { recursive: true });

// ---------------------------------------------------------------- voice
// One line per section, voiced with V.provider (default heygen) and cached by provider + voice +
// speed + text.
const n = film.scenes.length;
const V = film.voice;
const lines = V ? [V.title, ...V.scenes, V.stats, V.close] : [];
// By default a voice-over uses the house cast (videos/brand/voices.json): hosts alternate per section
// like a TV show, in an order shuffled with the version as seed, so a re-render keeps the same
// voices. "cast": false with "provider" and "voice" uses one voice instead.
let cast = null;
if (V && V.cast !== false) {
  const all = JSON.parse(readFileSync(join(BRAND, "voices.json"), "utf8"));
  const pool = [...all[lang]];
  let seed = [...film.version].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  cast = { provider: all.provider, settings: all.settings, voices: lines.map((_, k) => pool[k % pool.length].id) };
}
const voices = lines.map((text, k) => {
  const provider = cast ? cast.provider : V.provider ?? "heygen";
  const voiceId = cast ? cast.voices[k] : V.voice;
  const extra = cast ? ["--settings", JSON.stringify(cast.settings)] : [];
  const key = createHash("sha1").update(`${provider}|${voiceId}|${V.speed}|${extra.join("")}|${text}`).digest("hex").slice(0, 12);
  const wav = join(root, "assets/audio/voice", `${key}.wav`);
  const words = wav.replace(/\.wav$/, ".words.json");
  if (!existsSync(wav)) {
    const args =
      provider === "elevenlabs"
        ? [TTS.elevenlabs, voiceId, text, "-o", wav, "--words", words, "--speed", String(V.speed), ...extra]
        : [TTS.heygen, text, "-o", wav, "--words", words, "--voice", voiceId, "--speed", String(V.speed)];
    execFileSync(process.execPath, args, { stdio: "inherit" });
  }
  return { wav, words: JSON.parse(readFileSync(words, "utf8")), dur: probe(wav) };
});

// ---------------------------------------------------------------- timing
// Without a voice-over: fixed lengths on the 120 BPM bar (2s). With one: each section is as
// long as its line needs (lead + line + tail), rounded up to the beat (0.5s).
const fixed = { title: 6, scene: 8, stats: 6, close: 6, ...film.timing };
const MIN = { title: 5.5, scene: 6, stats: film.also ? 6.5 : 4.5, close: 4.5 };
const LEAD = { title: 0.55, scene: 0.3, stats: 0.5, close: 0.5 };
const TAIL = 0.45;
const beat = (t) => Math.ceil(t * 2 - 1e-6) / 2;
const kinds = ["title", ...film.scenes.map(() => "scene"), "stats", "close"];
let clock = 0;
const sections = kinds.map((kind, k) => {
  const v = voices[k];
  const lastWord = v ? v.words.at(-1).end : 0;
  const dur = v ? beat(Math.max(MIN[kind], LEAD[kind] + lastWord + TAIL)) : fixed[kind];
  const sec = { kind, start: clock, dur, voiceAt: v ? clock + LEAD[kind] : null };
  clock += dur;
  return sec;
});
const TOTAL = clock;
const [titleSec, ...rest] = sections;
const sceneSecs = rest.slice(0, n);
const [statsSec, closeSec] = rest.slice(n);
const EXIT = 0.3; // each section slides out over its last 0.3s, then a hard cut

// Inside a highlight scene (seconds from its start); film.motion can tighten them.
const S = {
  win: 0.0, // window slides in
  num: 0.1,
  label: 0.2,
  title: 0.3,
  marker: 0.95, // marker sweep, 0.4s
  cam: 1.5, // camera glides to the detail, 1.1s
  focus: 2.65, // highlight on the detail
  rows: 3.1, // first row, then every 3 frames
  ...film.motion,
};

// ---------------------------------------------------------------- captions
// Spoken words grouped into short lines (house rule: 4 words, break on punctuation), with the
// spoken forms swapped for how they are written.
const REPLACE = [
  ...(film.captionReplace ?? []),
  ["AI DR dot today", "aidr.today"],
  ["aidr dot today", "aidr.today"],
  ["AI DR", "AI;DR"],
];
const caps = [];
voices.forEach((v, k) => {
  const words = v.words.map((w) => ({ text: w.text, s: sections[k].voiceAt + w.start, e: sections[k].voiceAt + w.end }));
  for (const [spoken, shown] of REPLACE) {
    const parts = spoken.toLowerCase().split(" ");
    for (let i = 0; i + parts.length <= words.length; i++) {
      const slice = words.slice(i, i + parts.length);
      if (slice.every((w, j) => w.text.toLowerCase().replace(/[.,!?:]/g, "") === parts[j])) {
        const tail = slice.at(-1).text.match(/[.,!?:]+$/)?.[0] ?? "";
        words.splice(i, parts.length, { text: shown + tail, s: slice[0].s, e: slice.at(-1).e });
      }
    }
  }
  // Lines break at punctuation, at 4 words otherwise, never after a weak word, and a short
  // punctuated tail (1–2 words) joins the line before it; 6 words at most.
  const WEAK = /^(the|a|an|to|of|and|or|its|their|it|has|is|by|at|in|on|for|when|went|you|và|của|cho|các|những|là|để|với|tại|theo|bằng|thì|lại|một|được|khi|có|sẽ)$/i;
  const END = /[.,!?;:]$/;
  let cur = [];
  const flush = () => {
    if (cur.length) caps.push({ section: k, words: cur });
    cur = [];
  };
  if (lang === "vi") {
    // Vietnamese words are syllables, so count characters: a clause per line. A long clause is
    // split before a joining word nearest its middle, so a compound ("bình chọn") never breaks.
    const JOIN = /^(và|còn|để|trong|bằng|của|lẫn|sẽ|lên|giữ|với|cho|khi|tại|từ|mà|qua|giờ)$/i;
    words.forEach((w) => {
      cur.push(w);
      if (!END.test(w.text)) return;
      const text = cur.map((x) => x.text).join(" ");
      if (text.length > 34) {
        let at = 0;
        let best = Infinity;
        let len = 0;
        cur.forEach((x, m) => {
          len += x.text.length + 1;
          if (m < cur.length - 1 && JOIN.test(cur[m + 1].text) && Math.abs(len - text.length / 2) < best) {
            [best, at] = [Math.abs(len - text.length / 2), m + 1];
          }
        });
        if (at) {
          const rest = cur.splice(at);
          flush();
          cur = rest;
        }
      }
      flush();
    });
    flush();
    return;
  }
  words.forEach((w, j) => {
    cur.push(w);
    if (END.test(w.text)) return flush();
    const tail = words.slice(j + 1).findIndex((x) => END.test(x.text)) + 1;
    const joinTail = tail > 0 && tail <= 2 && cur.length + tail <= 7;
    if (!joinTail && ((cur.length >= 4 && !WEAK.test(w.text)) || cur.length >= 6)) flush();
  });
  flush();
});
// A one-word line joins the line before it when they share a section and stay within 6 words.
for (let i = caps.length - 1; i > 0; i--) {
  const [prev, c] = [caps[i - 1], caps[i]];
  if (c.words.length === 1 && prev.section === c.section && prev.words.length <= 5) {
    prev.words.push(...c.words);
    caps.splice(i, 1);
  }
}
// A line on screen under 0.6s joins its neighbour in the same section when the result stays short.
const short = (c) => c.words.at(-1).e - c.words[0].s < 0.6;
const fits = (words) => (lang === "vi" ? words.map((w) => w.text).join(" ").length <= 40 : words.length <= 7);
for (let i = caps.length - 1; i >= 0; i--) {
  const c = caps[i];
  if (!short(c)) continue;
  const prev = caps[i - 1];
  const next = caps[i + 1];
  if (next && next.section === c.section && fits([...c.words, ...next.words])) {
    next.words.unshift(...c.words);
    caps.splice(i, 1);
  } else if (prev && prev.section === c.section && fits([...prev.words, ...c.words])) {
    prev.words.push(...c.words);
    caps.splice(i, 1);
  }
}
for (const c of caps) c.start = c.words[0].s;
caps.forEach((c, i) => {
  const next = caps[i + 1];
  const sectionEnd = sections[c.section].start + sections[c.section].dur - EXIT;
  c.end = Math.min(c.words.at(-1).e + 0.5, next ? next.start : Infinity, sectionEnd);
});

// ---------------------------------------------------------------- sound
// Music: the house "News Theme" (120 BPM), from 16s in where the beat is steady.
const MUSIC_FROM = 16;
const MUSIC_VOLUME = film.musicVolume ?? 0.2;
ff(
  "-ss", String(MUSIC_FROM), "-t", String(TOTAL), "-i", join(LAUNCH, "bgm/news-theme-source.mp3"),
  "-af", `afade=t=in:d=0.25,afade=t=out:st=${TOTAL - 2.5}:d=2.5`, "assets/audio/score.mp3",
);

// Seconds from the start of each effect file to its loudest point (measured for the launch film).
const PEAK = { "click-soft": 0.053, whoosh: 0.164, "whoosh-short": 0.164, "impact-bass-1": 0.077, pop: 0.122 };
const LEN = { "click-soft": 0.366, whoosh: 0.575, "whoosh-short": 0.575, "impact-bass-1": 2.116, pop: 0.72 };
for (const name of Object.keys(PEAK)) cpSync(join(LAUNCH, `sfx/${name}.mp3`), join(root, `assets/audio/${name}.mp3`));

const hits = [
  ["pop", 0.2, 0.2], // semicolon lands
  ["whoosh-short", 0.84, 0.18], // AI and DR open out of the hinge
  ["impact-bass-1", 1.58, V ? 0.05 : 0.14], // version lands (kept under a voice-over)
  ["click-soft", 2.2, 0.28], // marker under the version
];
sceneSecs.forEach(({ start: t }) => {
  hits.push(
    ["whoosh", t + 0.12, 0.26], // window arrives
    ["click-soft", t + S.marker + 0.4, 0.28], // marker done
    ["whoosh-short", t + S.cam + 0.06, 0.22], // camera glide, fastest part
    ["click-soft", t + S.focus + 0.05, 0.28], // highlight on
  );
});
hits.push(
  ["whoosh", statsSec.start + 0.12, 0.26],
  ["impact-bass-1", closeSec.start + 0.1, V ? 0.05 : 0.14], // logo tile lands
  ["click-soft", closeSec.start + 1.85, 0.28], // marker under the address
);

let audioHtml;
if (V) {
  // Voice-over: one premixed track. The music is carved about 10 dB under the voice with a
  // sidechain compressor; effects sit on top; the whole mix is normalised to -14 LUFS.
  const inputs = [];
  const filters = [];
  voices.forEach((v, k) => {
    inputs.push("-i", v.wav);
    filters.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(sections[k].voiceAt * 1000)}:all=1[v${k}]`);
  });
  const nv = voices.length;
  filters.push(`${voices.map((_, k) => `[v${k}]`).join("")}amix=inputs=${nv}:normalize=0,apad=whole_dur=${TOTAL}[voice]`);
  inputs.push("-i", "assets/audio/score.mp3");
  filters.push(`[${nv}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${MUSIC_VOLUME}[bgm]`);
  filters.push(`[voice]asplit=2[vmix][vkey]`);
  filters.push(`[bgm][vkey]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[duck]`);
  hits.forEach(([name, at, vol], k) => {
    inputs.push("-i", `assets/audio/${name}.mp3`);
    const ms = Math.max(0, Math.round((at - PEAK[name]) * 1000));
    filters.push(`[${nv + 1 + k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${vol},adelay=${ms}:all=1[x${k}]`);
  });
  filters.push(`${hits.map((_, k) => `[x${k}]`).join("")}amix=inputs=${hits.length}:normalize=0[sfx]`);
  filters.push(`[vmix][duck][sfx]amix=inputs=3:normalize=0,atrim=0:${TOTAL},loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
  ff(...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-ar", "48000", `assets/audio/mix-${lang}.wav`);
} else {
  // Music and effects only, normalised the same way.
  const inputs = ["-i", "assets/audio/score.mp3"];
  const filters = [`[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=${MUSIC_VOLUME}[bgm]`];
  hits.forEach(([name, at, vol], k) => {
    inputs.push("-i", `assets/audio/${name}.mp3`);
    const ms = Math.max(0, Math.round((at - PEAK[name]) * 1000));
    filters.push(`[${1 + k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${vol},adelay=${ms}:all=1[x${k}]`);
  });
  filters.push(`[bgm]${hits.map((_, k) => `[x${k}]`).join("")}amix=inputs=${hits.length + 1}:normalize=0,atrim=0:${TOTAL},loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
  ff(...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-ar", "48000", `assets/audio/mix-${lang}.wav`);
}
audioHtml = `<audio id="a-mix" src="assets/audio/mix-${lang}.wav" data-start="0" data-duration="${TOTAL}" data-track-index="10" data-volume="1"></audio>`;

// Captions as SRT too, for platforms that take a separate track.
if (caps.length) {
  const srt = (t) => {
    const ms = Math.round(t * 1000);
    const p = (x, w = 2) => String(x).padStart(w, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  writeFileSync(
    join(root, `captions-${lang}.srt`),
    caps.map((c, i) => `${i + 1}\n${srt(c.start)} --> ${srt(c.end)}\n${c.words.map((w) => w.text).join(" ")}\n`).join("\n"),
  );
}

// ---------------------------------------------------------------- shared html
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad = (i) => String(i).padStart(2, "0");
const r3 = (x) => Math.round(x * 1000) / 1000;
const marked = (text, mark) => {
  const at = mark ? text.indexOf(mark) : -1;
  if (at < 0) return esc(text);
  return `${esc(text.slice(0, at))}<span class="mk">${esc(mark)}<i class="hl"></i></span>${esc(text.slice(at + mark.length))}`;
};

const pngSize = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
for (const s of film.scenes) {
  const file = join(root, CAPTURE, `${s.shot}.png`);
  if (!existsSync(file)) throw new Error(`missing ${file}; run with --capture`);
  s.size = pngSize(file);
}

const fontFaces = readFileSync(join(BRAND, "frame.md"), "utf8")
  .split("\n")
  .filter((l) => l.startsWith("@font-face"))
  .join("\n");
const logoTile = readFileSync(join(BRAND, "assets/logo.svg"), "utf8")
  .replace(/<!--.*?-->\s*/s, "")
  .replace(/width="160" height="160" /, "")
  .replace(/role="img" aria-label="AI;DR"/, 'class="tile" aria-hidden="true"');

// The wordmark split at the semicolon hinge (paths from brand/assets/logo.svg).
const P = {
  A: "M69.6 91L55.3 91L49.2 73.4L23.0 73.4L16.9 91L2.5 91L27.6 22.2L44.6 22.2L69.6 91ZM37.1 36.2L36.1 32.8L35.8 33.9Q35.3 35.6 34.6 37.9Q33.9 40.1 26.2 62.6L26.2 62.6L46.0 62.6L39.2 42.8L37.1 36.2Z",
  I: "M88.9 91L74.5 91L74.5 22.2L88.9 22.2L88.9 91Z",
  dot: "M114.9 54.3L100.8 54.3L100.8 40.5L114.9 40.5L114.9 54.3Z",
  comma: "M114.9 77.3L114.9 87.8Q114.9 93.6 113.7 98.1Q112.4 102.6 109.6 106.5L109.6 106.5L100.6 106.5Q103.8 102.5 105.5 98.5Q107.1 94.5 107.1 91L107.1 91L100.8 91L100.8 77.3L114.9 77.3Z",
  D: "M188.0 56.1L188.0 56.1Q188.0 66.7 183.8 74.7Q179.6 82.6 172.0 86.8Q164.4 91 154.5 91L154.5 91L126.7 91L126.7 22.2L151.6 22.2Q169.0 22.2 178.5 31.0Q188.0 39.7 188.0 56.1ZM173.5 56.1L173.5 56.1Q173.5 45.0 167.7 39.2Q162.0 33.3 151.3 33.3L151.3 33.3L141.1 33.3L141.1 79.9L153.3 79.9Q162.6 79.9 168.0 73.5Q173.5 67.1 173.5 56.1Z",
  R: "M257.9 91L241.7 91L225.7 64.9L208.9 64.9L208.9 91L194.4 91L194.4 22.2L228.8 22.2Q241.1 22.2 247.8 27.5Q254.5 32.8 254.5 42.7L254.5 42.7Q254.5 49.9 250.4 55.2Q246.3 60.4 239.3 62.1L239.3 62.1L257.9 91ZM240.0 43.3L240.0 43.3Q240.0 33.4 227.3 33.4L227.3 33.4L208.9 33.4L208.9 53.7L227.7 53.7Q233.8 53.7 236.9 51.0Q240.0 48.2 240.0 43.3Z",
};
const wordmark = `<svg class="wm" viewBox="0 0 260 110" aria-hidden="true">
  <defs>
    <clipPath id="wm-left" clipPathUnits="userSpaceOnUse"><rect x="-20" y="0" width="118" height="110"/></clipPath>
    <clipPath id="wm-right" clipPathUnits="userSpaceOnUse"><rect x="118" y="0" width="160" height="110"/></clipPath>
  </defs>
  <g clip-path="url(#wm-left)"><g id="wm-ai"><path d="${P.A}"/><path d="${P.I}"/></g></g>
  <g clip-path="url(#wm-right)"><g id="wm-dr"><path d="${P.D}"/><path d="${P.R}"/></g></g>
  <path id="wm-dot" d="${P.dot}"/><path id="wm-comma" d="${P.comma}"/>
</svg>`;

const statHtml = film.stats
  .map(([value, label], i) => {
    const m = /^([^0-9]*)([0-9]+)(.*)$/.exec(value);
    return `<div class="stat" id="st${i}"><div class="sv" data-pre="${esc(m[1])}" data-num="${m[2]}" data-post="${esc(m[3])}">${esc(value)}</div><div class="sl">${esc(label)}</div></div>`;
  })
  .join("");

const capHtml = caps
  .map(
    (c, i) =>
      `<div id="cap-${i}" class="clip cap" data-start="${r3(c.start)}" data-duration="${r3(c.end - c.start)}" data-track-index="6"><div class="line">${c.words.map((w) => `<span class="w">${esc(w.text)}</span>`).join(" ")}</div></div>`,
  )
  .join("\n      ");

// ---------------------------------------------------------------- formats
// 9:16 keeps text inside the TikTok / Reels safe zone: x 60–960, y 200–1580. Every language and
// shape is its own HyperFrames project (one project may hold only one root composition):
// <v>/ is the English 16:9 master, the others sit next to it (<v>-9x16/, <v>-vi/, <v>-vi-9x16/,
// like aidr-launch-9x16/) with copies of the captures, fonts and sound.
const suffix = lang === "en" ? "" : `-${lang}`;
const FORMATS = {
  "16x9": { dir: `${root}${suffix}`, w: 1920, h: 1080, win: { left: 790, top: 150, w: 1010, h: 780, bar: 52 }, bloom: [310, -110] },
  "9x16": { dir: `${root}${suffix}-9x16`, w: 1080, h: 1920, win: { left: 80, top: 560, w: 860, h: 680, bar: 48 }, bloom: [-110, 140] },
};

const STYLE = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { overflow: hidden; background: #f7f7f5; }
      #root {
        position: relative; width: 100%; height: 100%; overflow: hidden; background: #f7f7f5;
        font-family: "Source Sans 3 Variable", sans-serif; color: #0a0a0a;
        -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision;
      }
      .scene { position: absolute; inset: 0; overflow: hidden; }
      .out, .push { position: absolute; inset: 0; }
      .push { transform-origin: 62% 50%; }
      .bloom {
        position: absolute; width: 1300px; height: 1300px; border-radius: 50%;
        background: radial-gradient(circle, rgba(245,197,24,0.5) 0%, rgba(253,246,216,0.62) 34%, rgba(249,221,116,0.16) 54%, rgba(247,247,245,0) 70%);
      }
      .ember {
        position: absolute; left: -380px; bottom: -520px; width: 1000px; height: 1000px; border-radius: 50%;
        background: radial-gradient(circle, rgba(180,83,9,0.16) 0%, rgba(180,83,9,0.05) 40%, rgba(180,83,9,0) 68%);
      }
      .chrome-top {
        position: absolute; left: 120px; top: 64px; font-size: 17px; font-weight: 600; letter-spacing: 0.2em;
        text-transform: uppercase; color: rgba(10,10,10,0.72);
      }
      .chrome-top .d { margin-left: 22px; font-weight: 400; letter-spacing: 0.12em; }
      .nc { text-transform: none; }
      .pagenum {
        position: absolute; right: 120px; bottom: 56px; font-size: 17px; letter-spacing: 0.16em;
        font-variant-numeric: tabular-nums; color: rgba(10,10,10,0.72);
      }
      .left { position: absolute; left: 120px; top: 170px; width: 600px; }
      .num { font-family: "EB Garamond Variable", serif; font-weight: 400; font-size: 120px; line-height: 0.84; letter-spacing: -0.02em; }
      .num .of { font-family: "Source Sans 3 Variable", sans-serif; font-size: 22px; letter-spacing: 0.12em; margin-left: 14px; color: rgba(10,10,10,0.6); }
      .label { margin-top: 40px; font-size: 17px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: #b45309; }
      .title {
        margin-top: 16px; font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: 76px;
        line-height: 1.04; letter-spacing: -0.01em; isolation: isolate;
       text-wrap: balance; }
      .mk { position: relative; white-space: nowrap; }
      .hl {
        position: absolute; left: -0.06em; right: -0.06em; bottom: 0.08em; height: 0.4em; z-index: -1;
        background: #f5c518; transform-origin: 0% 50%;
      }
      .rows { margin-top: 44px; border-bottom: 1px solid rgba(10,10,10,0.18); }
      .row { display: grid; grid-template-columns: 150px 1fr; align-items: baseline; padding: 15px 0; border-top: 1px solid rgba(10,10,10,0.18); }
      .row .k { font-size: 16px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(10,10,10,0.62); }
      .row .v { font-size: 27px; line-height: 1.25; }
      .win { position: absolute; border: 1px solid rgba(10,10,10,0.18); border-radius: 18px; overflow: hidden; background: #f7f7f5; }
      .bar { display: flex; align-items: center; padding: 0 20px; background: #ededeb; border-bottom: 1px solid rgba(10,10,10,0.1); }
      .dots { display: flex; gap: 8px; }
      .dots i { display: block; width: 12px; height: 12px; border-radius: 50%; background: rgba(10,10,10,0.16); }
      .url {
        margin-left: 24px; flex: 1; height: 32px; display: flex; align-items: center; padding: 0 16px; white-space: nowrap; overflow: hidden;
        border-radius: 16px; background: #fff; border: 1px solid rgba(10,10,10,0.08); font-size: 17px; color: rgba(10,10,10,0.72);
      }
      .view { position: absolute; left: 0; right: 0; bottom: 0; overflow: hidden; background: #f7f7f5; }
      .cam { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
      .cam img { display: block; width: 100%; height: 100%; }
      .focus { position: absolute; border: 6px solid #f5c518; border-radius: 22px; box-shadow: 0 0 0 6000px rgba(247,247,245,0.5); }
      /* title */
      .t-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .t-kicker { font-size: 19px; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: #b45309; }
      .t-lock { margin-top: 34px; display: flex; align-items: baseline; gap: 44px; }
      .wm { display: block; width: 472px; height: 200px; margin-bottom: -35px; fill: #1c1917; overflow: visible; }
      .t-ver { position: relative; isolation: isolate; font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: 190px; line-height: 1; letter-spacing: -0.02em; }
      .t-ver .hl { height: 0.3em; bottom: 0.1em; }
      .t-head { margin-top: 46px; font-family: "EB Garamond Variable", serif; font-style: italic; font-weight: 400; font-size: 58px; line-height: 1.1; text-align: center; max-width: 1500px;  text-wrap: balance; }
      .t-dates { margin-top: 26px; font-size: 22px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(10,10,10,0.68); }
      /* stats */
      .st-wrap { position: absolute; left: 120px; right: 120px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
      .st-label { font-size: 17px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: #b45309; }
      .st-row { margin-top: 30px; display: flex; gap: 48px; }
      .stat { flex: 1; border-top: 1px solid #0a0a0a; padding-top: 22px; }
      .sv { font-family: "EB Garamond Variable", serif; font-weight: 400; font-size: 150px; line-height: 0.9; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .sl { margin-top: 18px; font-size: 24px; color: rgba(10,10,10,0.72); }
      .st-also { margin-top: 70px; font-family: "EB Garamond Variable", serif; font-size: 44px; line-height: 1.2; max-width: 1500px;  text-wrap: balance; }
      /* close */
      .c-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .tile { display: block; width: 168px; height: 168px; }
      .c-line { margin-top: 52px; font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: 68px; line-height: 1.08; text-align: center; max-width: 1500px; letter-spacing: -0.01em;  text-wrap: balance; }
      .c-url { position: relative; isolation: isolate; margin-top: 34px; font-size: 64px; font-weight: 600; letter-spacing: 0.01em; }
      .c-url .hl { height: 0.36em; bottom: 0.06em; }
      .c-notes { margin-top: 30px; font-size: 22px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(10,10,10,0.68); }
      /* captions: paper chips, the spoken word gets the marker */
      .cap { z-index: 15; }
      .cap .line { position: absolute; left: 50%; top: 966px; width: 1400px; margin-left: -700px; text-align: center; font-weight: 700; font-size: 40px; line-height: 1.15; }
      .cap .w { display: inline-block; padding: 2px 10px 6px; background: #f7f7f5; }
      /* 9:16 */
      .f-9x16 .bloom { left: -110px !important; top: 380px !important; }
      .f-9x16 .push { transform-origin: 50% 50%; }
      .f-9x16 .chrome-top { left: 80px; top: 220px; font-size: 19px; }
      .f-9x16 .chrome-top .d { margin-left: 16px; }
      .f-9x16 .pagenum { right: 140px; top: 222px; bottom: auto; font-size: 19px; }
      .f-9x16 .left { left: 80px; top: 290px; width: 860px; }
      .f-9x16 .num { font-size: 104px; }
      .f-9x16 .label { margin-top: 26px; font-size: 19px; }
      .f-9x16 .title { margin-top: 10px; font-size: 74px; }
      .f-9x16 .title.long { font-size: 50px; }
      .f-9x16 .rows { position: absolute; left: 0; top: 980px; width: 860px; margin-top: 0; }
      .f-9x16 .row { grid-template-columns: 180px 1fr; padding: 14px 0; }
      .f-9x16 .row .k { font-size: 18px; }
      .f-9x16 .row .v { font-size: 30px; }
      .f-9x16 .t-lock { flex-direction: column; align-items: center; gap: 4px; }
      .f-9x16 .wm { width: 590px; height: 250px; margin-bottom: 0; }
      .f-9x16 .t-ver { font-size: 180px; }
      .f-9x16 .t-head { max-width: 800px; font-size: 52px; }
      .f-9x16 .t-kicker, .f-9x16 .t-dates { font-size: 22px; }
      .f-9x16 .st-wrap { left: 80px; right: 140px; }
      .f-9x16 .st-row { flex-wrap: wrap; gap: 44px 40px; }
      .f-9x16 .stat { flex: 0 0 calc(50% - 20px); }
      .f-9x16 .sv { font-size: 120px; }
      .f-9x16 .st-also { margin-top: 56px; font-size: 42px; }
      .f-9x16 .c-wrap { padding: 0 140px 0 80px; }
      .f-9x16 .c-line { font-size: 58px; max-width: 900px; }
      .f-9x16 .c-notes { font-size: 20px; letter-spacing: 0.1em; }
      .f-9x16 .cap .line { top: 1505px; width: 900px; margin-left: -480px; font-size: 50px; }
`;

function build(fmtName) {
  const F = FORMATS[fmtName];
  const W = F.win;
  const VW = W.w - 2;
  const vertical = fmtName === "9x16";
  const view = (s, r) => {
    const k = VW / (r.w * s.size.w);
    return { x: -r.x * s.size.w * k, y: -r.y * s.size.h * k, scale: k };
  };
  // The phone window is small, so by default it lands closer: 72% of the master's width,
  // centred on the highlight (or on the master's view when there is none).
  const VH = W.h - W.bar - 2;
  const tighter = (s) => {
    const fo = s.focus9 ?? s.focus;
    const t = s.to;
    const fit = fo ? Math.max(fo.w * 1.12, (fo.h * 1.1 * VW * s.size.h) / (VH * s.size.w)) : 0;
    const w = Math.min(Math.max(t.w * 0.72, fit), t.w);
    const h = (w * VH * s.size.w) / (VW * s.size.h);
    const c = fo
      ? { x: fo.x + fo.w / 2, y: fo.y + fo.h / 2 }
      : { x: t.x + t.w / 2, y: t.y + (t.w * 0.713 * s.size.w) / s.size.h / 2 };
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    return { x: clamp(c.x - w / 2, Math.min(t.x, 0), 1 - w), y: clamp(c.y - h / 2, Math.min(t.y, 0), Math.max(1 - h, 0)), w };
  };
  const sceneHtml = (s, i) => {
    const { start, dur } = sceneSecs[i];
    const bloom = [[1080, -260], [980, 60], [1160, -120], [1020, -40], [1120, 40]][i % 5];
    const fo = (vertical && s.focus9) || s.focus;
    const focus = fo
      ? `<div class="focus" id="s${i}-focus" style="left:${fo.x * s.size.w}px;top:${fo.y * s.size.h}px;width:${fo.w * s.size.w}px;height:${fo.h * s.size.h}px"></div>`
      : "";
    return `
      <section id="s${i}" class="clip scene" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="1">
        <div class="out" id="s${i}-out"><div class="push" id="s${i}-push">
          <div class="bloom" style="left:${bloom[0]}px;top:${bloom[1]}px"></div>
          <div class="ember"></div>
          <div class="chrome-top" id="s${i}-chrome">AI;DR <span class="nc">v${esc(film.version)}</span><span class="d">${esc(film.dates)}</span></div>
          <div class="left">
            <div class="num" id="s${i}-num">${pad(i + 1)}<span class="of">/ ${pad(n)}</span></div>
            <div class="label" id="s${i}-label">${esc(s.label)}</div>
            <h2 class="title${s.title.length > 26 ? " long" : ""}" id="s${i}-title">${marked(s.title, s.mark)}</h2>
            <div class="rows">${s.rows
              .map(([k, v], r) => `<div class="row" id="s${i}-r${r}"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`)
              .join("")}</div>
          </div>
          <div class="win" id="s${i}-win" style="left:${W.left}px;top:${W.top}px;width:${W.w}px;height:${W.h}px">
            <div class="bar" style="height:${W.bar}px"><span class="dots"><i></i><i></i><i></i></span><span class="url">${esc(s.url)}</span></div>
            <div class="view" style="top:${W.bar}px">
              <div class="cam" id="s${i}-cam" style="width:${s.size.w}px;height:${s.size.h}px">
                <img src="capture/${esc(s.shot)}.png" alt="" />${focus}
              </div>
            </div>
          </div>
          <div class="pagenum">${pad(i + 1)} / ${pad(n)}</div>
        </div></div>
      </section>`;
  };

  const motion = {
    EXIT,
    S,
    TOTAL,
    title: titleSec,
    stats: { ...statsSec, count: film.stats.length },
    close: closeSec,
    scenes: film.scenes.map((s, i) => ({
      start: sceneSecs[i].start,
      dur: sceneSecs[i].dur,
      rows: s.rows.length,
      from: view(s, (vertical && s.from9) || s.from || { x: 0.04, y: 0, w: 0.92 }),
      to: view(s, vertical ? s.to9 ?? tighter(s) : s.to),
      focus: Boolean(s.focus),
    })),
    caps: caps.map((c) => ({ start: r3(c.start), words: c.words.map((w) => r3(w.s)) })),
  };

  const html = `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${F.w}, height=${F.h}" />
    <title>AI;DR v${esc(film.version)} release film (${lang}, ${fmtName})</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
${fontFaces}
${STYLE}
    </style>
  </head>
  <body>
    <div id="root" class="f-${fmtName}" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="${F.w}" data-height="${F.h}" data-fps="30">
      <section id="title" class="clip scene" data-start="0" data-duration="${titleSec.dur}" data-track-index="0">
        <div class="out" id="title-out"><div class="push" id="title-push">
          <div class="bloom" style="left:${F.bloom[0]}px;top:${F.bloom[1]}px"></div>
          <div class="ember"></div>
          <div class="t-wrap">
            <div class="t-kicker" id="t-kicker">${esc(film.kicker)}</div>
            <div class="t-lock">${wordmark}<div class="t-ver" id="t-ver">v${esc(film.version)}<i class="hl" id="t-hl"></i></div></div>
            <div class="t-head" id="t-head">${esc(film.headline)}</div>
            <div class="t-dates" id="t-dates">${esc(film.dates)}</div>
          </div>
        </div></div>
      </section>
${film.scenes.map(sceneHtml).join("\n")}
      <section id="stats" class="clip scene" data-start="${r3(statsSec.start)}" data-duration="${statsSec.dur}" data-track-index="0">
        <div class="out" id="stats-out"><div class="push" id="stats-push">
          <div class="bloom" style="left:820px;top:-420px"></div>
          <div class="ember"></div>
          <div class="st-wrap">
            <div class="st-label" id="st-label"><span class="nc">v${esc(film.version)}</span> ${esc(UI.inNumbers)} · ${esc(film.dates)}</div>
            <div class="st-row">${statHtml}</div>
            <div class="st-also" id="st-also">${esc(film.also)}</div>
          </div>
        </div></div>
      </section>
      <section id="close" class="clip scene" data-start="${r3(closeSec.start)}" data-duration="${closeSec.dur}" data-track-index="0">
        <div class="push" id="close-push">
          <div class="bloom" style="left:${F.bloom[0]}px;top:${F.bloom[1] - 50}px"></div>
          <div class="ember"></div>
          <div class="c-wrap">
            <div id="c-tile">${logoTile}</div>
            <div class="c-line" id="c-line">${esc(film.closing)}</div>
            <div class="c-url" id="c-url">aidr.today<i class="hl" id="c-hl"></i></div>
            <div class="c-notes" id="c-notes">${esc(UI.releaseNotes)} · <span class="nc">aidr.today/release/v${esc(film.version)}</span></div>
          </div>
        </div>
      </section>
      ${capHtml}
      ${audioHtml}
    </div>
    <script>
      window.__FILM = ${JSON.stringify(motion)};
${readFileSync(join(HERE, "motion.js"), "utf8")}
    </script>
  </body>
</html>
`;
  if (F.dir !== root) {
    mkdirSync(F.dir, { recursive: true });
    cpSync(join(root, CAPTURE), join(F.dir, "capture"), { recursive: true });
    for (const sub of ["assets/fonts", "assets/audio"]) cpSync(join(root, sub), join(F.dir, sub), { recursive: true });
    for (const file of ["hyperframes.json", "package.json"]) {
      if (!existsSync(join(F.dir, file))) cpSync(join(root, file), join(F.dir, file));
    }
  }
  writeFileSync(join(F.dir, "index.html"), html);
}

build("16x9");
build("9x16");
console.log(
  `${dir}: index.html + ${dir}-9x16/index.html, ${TOTAL}s, ${n} highlights, ${hits.length} effects` +
    (V ? `, voice-over (${caps.length} caption lines)` : ""),
);
console.log(sections.map((s) => `${s.kind}@${r3(s.start)}+${s.dur}`).join(" "));
if (cast) console.log(`cast (${lang}): ${cast.voices.join(" ")}`);
