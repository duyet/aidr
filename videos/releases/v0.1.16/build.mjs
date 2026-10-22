#!/usr/bin/env node
// Build the v0.1.16 release film in one language, both shapes, from film.json:
//   en: v0.1.16/ (16:9 master) and v0.1.16-9x16/      vi: v0.1.16-vi/ and v0.1.16-vi-9x16/
//
//   node v0.1.16/build.mjs [--lang en|vi]      (from videos/releases/; run capture.mjs first)
//
// Each highlight is one station of the launch film's machine (videos/aidr-launch-2026/assets,
// drawn with the anatomy kit in aidr-launch-2026/machine/kit/) beside a real capture of the live
// surface. Voice by the house cast (videos/brand/voices.json, ElevenLabs, cached by text in the
// ignored assets/audio/voice/), burned-in captions, one mix at -14 LUFS. Needs ffmpeg on PATH and
// $ELEVENLABS_API_KEY for lines not yet cached.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname);
const VIDEOS = resolve(ROOT, "../..");
const LAUNCH = join(VIDEOS, "aidr-launch-2026");
const BRAND = join(VIDEOS, "brand");
const TTS = join(VIDEOS, "releases/scripts/tts-elevenlabs.mjs");
const FPS = 30;

const langAt = process.argv.indexOf("--lang");
const lang = langAt > 0 ? process.argv[langAt + 1] : "en";
const base = JSON.parse(readFileSync(join(ROOT, "film.json"), "utf8"));
const merge = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) return a.every((x) => x && typeof x === "object" && !Array.isArray(x)) ? a.map((x, i) => (i in b ? merge(x, b[i]) : x)) : b;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in a ? merge(a[k], v) : v;
    return out;
  }
  return b === undefined ? a : b;
};
const { vi: _vi, ...english } = base;
const film = lang === "en" ? english : merge(english, base[lang]);
const n = film.scenes.length;

const machine = JSON.parse(readFileSync(join(LAUNCH, "assets/machine.json"), "utf8"));
const machineSvg = readFileSync(join(LAUNCH, "assets/machine.svg"), "utf8").replace(/<\?xml[^>]*>\s*/, "");
const peaks = JSON.parse(readFileSync(join(LAUNCH, "assets/sfx/peaks.json"), "utf8"));

const probe = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { cwd: ROOT });
const round = (t) => Math.round(t * FPS) / FPS;
const r3 = (x) => Math.round(x * 1000) / 1000;

// Voice: one line per section; hosts alternate in an order shuffled with the version as seed.
mkdirSync(join(ROOT, "assets/audio/voice"), { recursive: true });
cpSync(join(BRAND, "assets/fonts"), join(ROOT, "assets/fonts"), { recursive: true });
const lines = [film.voice.title, ...film.scenes.map((s) => s.voice), film.voice.close];
const cast = JSON.parse(readFileSync(join(BRAND, "voices.json"), "utf8"));
const pool = [...cast[lang]];
let seed = [...film.version].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const settings = JSON.stringify(cast.settings);
const voices = lines.map((text, k) => {
  const host = pool[k % pool.length];
  const key = createHash("sha1").update(`elevenlabs|${host.id}|${film.voice.speed}|${settings}|${text}`).digest("hex").slice(0, 12);
  const wav = join(ROOT, "assets/audio/voice", `${key}.wav`);
  const words = wav.replace(/\.wav$/, ".words.json");
  if (!existsSync(wav)) {
    execFileSync(process.execPath, [TTS, host.id, text, "-o", wav, "--words", words, "--speed", String(film.voice.speed), "--settings", settings], { stdio: "inherit" });
  }
  return { host: host.name, wav, words: JSON.parse(readFileSync(words, "utf8")), dur: probe(wav) };
});

// Sections: as long as the line needs (lead + line + tail), rounded up to the 120 BPM beat.
const LEAD = { title: 0.6, scene: 0.55, close: 0.5 };
const MIN = { title: 4, scene: 5, close: 4 };
const TAIL = 0.4;
const beat = (t) => Math.ceil(t * 2 - 1e-6) / 2;
const kinds = ["title", ...film.scenes.map(() => "scene"), "close"];
let clock = 0;
const sections = kinds.map((kind, k) => {
  const dur = beat(Math.max(MIN[kind], LEAD[kind] + voices[k].words.at(-1).end + TAIL));
  const sec = { kind, start: clock, dur, voiceAt: clock + LEAD[kind] };
  clock += dur;
  return sec;
});
const TOTAL = clock;
const word = (k, key) => {
  const fold = (s) => s.toLowerCase().normalize("NFC");
  const w = voices[k].words.find((x) => fold(x.text).startsWith(fold(key)));
  if (!w) throw new Error(`no word "${key}" in line ${k}: ${lines[k]}`);
  return round(sections[k].voiceAt + w.start);
};

// Captions: the spoken words in short lines (English: up to 4 words, break on punctuation;
// Vietnamese: a clause per line, about 34 characters), spoken forms swapped for written ones.
const REPLACE = [["twenty-three pixels", "23 px"], ["hai mươi ba pixel", "23 px"], ["thirty minutes", "30 minutes"], ["ba mươi phút", "30 phút"], ["version zero point one point sixteen", "version 0.1.16"], ["phiên bản không chấm một chấm mười sáu", "phiên bản 0.1.16"], ["AI DR dot today", "aidr.today"], ["AI DR chấm today", "aidr.today"], ["AI DR", "AI;DR"]];
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
  const END = /[.,!?;:]$/;
  const WEAK = /^(the|a|an|to|of|and|or|is|it|by|at|in|on|for|no|và|của|cho|các|là|để|với|từ|được|khi|có|sẽ|thì|mỗi|không|bao|chỉ)$/i;
  const limit = lang === "vi" ? 38 : 0;
  let cur = [];
  const flush = () => {
    if (cur.length) caps.push({ section: k, words: cur });
    cur = [];
  };
  words.forEach((w, j) => {
    // A Vietnamese line breaks before "và" (and) once it holds a clause, so the clause stays whole.
    if (lang === "vi" && /^và$/i.test(w.text) && cur.map((x) => x.text).join(" ").length >= 16) flush();
    cur.push(w);
    if (END.test(w.text)) return flush();
    const next = words[j + 1];
    const len = cur.map((x) => x.text).join(" ").length;
    const full = limit ? len >= limit : cur.length >= 4;
    // A short punctuated tail (1-2 words) stays with this line instead of standing alone.
    const tail = words.slice(j + 1).findIndex((x) => END.test(x.text)) + 1;
    if (full && !WEAK.test(w.text) && next && !(tail > 0 && tail <= 2)) flush();
  });
  flush();
});
for (const c of caps) c.start = c.words[0].s;
caps.forEach((c, i) => {
  const next = caps[i + 1];
  const sec = sections[c.section];
  c.end = Math.min(c.words.at(-1).e + 0.45, next ? next.start : Infinity, sec.start + sec.dur - 0.1);
});

// Hits: each effect's measured peak lands on its visual event.
const T = {
  title: sections[0],
  close: sections.at(-1),
  scenes: film.scenes.map((s, i) => {
    const sec = sections[i + 1];
    return { ...sec, tags: s.tags.map((t) => word(i + 1, t.at)) };
  }),
};
const hits = [
  ["impact-bass-1", 0.1, 0.35],
  ["pop", 0.75, 0.25],
  ["whoosh-cinematic", T.title.start + T.title.dur - 0.25, 0.32],
];
T.scenes.forEach((s, i) => {
  if (i > 0) hits.push(["whoosh-short", s.start + 0.35, 0.2]);
  hits.push(["whoosh-short", s.start + 1.15, 0.22]);
  s.tags.forEach((t) => hits.push(["click-soft", t + 0.1, 0.4]));
});
hits.push(["whoosh-cinematic", T.close.start + 0.05, 0.3], ["impact-bass-1", T.close.start + 0.5, 0.35], ["pop", T.close.start + 1.4, 0.25]);

const audio = join(ROOT, "assets/audio");
for (const name of new Set(hits.map((h) => h[0]))) cpSync(join(LAUNCH, `assets/sfx/${name}.mp3`), join(audio, `${name}.mp3`));
ff("-ss", "16", "-t", String(TOTAL), "-i", join(VIDEOS, "aidr-launch/assets/bgm/news-theme-source.mp3"), "-af", `afade=t=in:d=0.25,afade=t=out:st=${TOTAL - 2.5}:d=2.5`, "assets/audio/score.mp3");
{
  const inputs = [];
  const f = [];
  voices.forEach((v, k) => {
    inputs.push("-i", v.wav);
    f.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(sections[k].voiceAt * 1000)}:all=1[v${k}]`);
  });
  const nv = voices.length;
  f.push(`${voices.map((_, k) => `[v${k}]`).join("")}amix=inputs=${nv}:normalize=0,apad=whole_dur=${TOTAL}[voice]`);
  inputs.push("-i", "assets/audio/score.mp3");
  f.push(`[${nv}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.22[bgm]`, "[voice]asplit=2[vmix][vkey]", "[bgm][vkey]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[duck]");
  hits.forEach(([name, at, vol], k) => {
    inputs.push("-i", `assets/audio/${name}.mp3`);
    f.push(`[${nv + 1 + k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${vol},adelay=${Math.max(0, Math.round((at - peaks[name].peak) * 1000))}:all=1[x${k}]`);
  });
  f.push(`${hits.map((_, k) => `[x${k}]`).join("")}amix=inputs=${hits.length}:normalize=0[sfx]`);
  f.push(`[vmix][duck][sfx]amix=inputs=3:normalize=0,atrim=0:${TOTAL},loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
  ff(...inputs, "-filter_complex", f.join(";"), "-map", "[out]", "-ar", "48000", `assets/audio/mix-${lang}.wav`);
}

const srt = (t) => {
  const ms = Math.round(t * 1000);
  const p = (x, w = 2) => String(x).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync(join(ROOT, `captions-${lang}.srt`), caps.map((c, i) => `${i + 1}\n${srt(c.start)} --> ${srt(c.end)}\n${c.words.map((w) => w.text).join(" ")}\n`).join("\n"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const marked = (text, mark) => {
  const at = mark ? text.indexOf(mark) : -1;
  if (at < 0) return esc(text);
  return `${esc(text.slice(0, at))}<span class="mk"><i class="hl"></i>${esc(mark)}</span>${esc(text.slice(at + mark.length))}`;
};
const pad = (i) => String(i).padStart(2, "0");
const size = (name) => {
  const b = readFileSync(join(ROOT, "capture", `${name}.png`));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const fontFaces = readFileSync(join(BRAND, "frame.md"), "utf8").split("\n").filter((l) => l.startsWith("@font-face")).join("\n");
const logoTile = readFileSync(join(BRAND, "assets/logo.svg"), "utf8").replace(/<!--.*?-->\s*/s, "").replace(/width="160" height="160" /, "").replace(/role="img" aria-label="AI;DR"/, 'class="tile" aria-hidden="true"');

// Where each station's action happens, in machine viewBox units (machine.json).
const ANCHOR = {
  fetch: { box: "st-fetch", at: machine.pivots["needle-clock"] },
  "tldr-vi": { box: "st-tldr", at: machine.stations["st-tldr"].center },
  tldr: { box: "st-tldr", at: machine.stations["st-tldr"].center },
  email: { box: "st-dispatch", at: machine.ports.email },
  telegram: { box: "st-dispatch", at: machine.ports.telegram },
  rss: { box: "st-dispatch", at: machine.ports.web },
};

const SHAPES = {
  "16x9": { W: 1920, H: 1080, form: "desktop" },
  "9x16": { W: 1080, H: 1920, form: "mobile" },
};

function html(fmt) {
  const { W, H, form } = SHAPES[fmt];
  const tall = H > W;
  const scenes = film.scenes.map((s, i) => {
    const shot = s.shot === "daycard" ? "daycard" : `${s.shot}-${form}`;
    return { ...ANCHOR[s.station], station: s.station, shot, size: size(shot), view: (tall && s.view9) || s.view, tags: s.tags.length, ...T.scenes[i] };
  });
  const cfg = { W, H, tall, TOTAL, title: T.title, close: T.close, scenes, machine: { pivots: machine.pivots, viewBox: machine.viewBox, stations: machine.stations, belt: machine.belt, moves: machine.moves, ports: machine.ports } };
  const scene = (s, i) => `
          <div class="head" id="h${i}">
            <div class="num" id="h${i}-num">${pad(i + 1)} <span>/ ${pad(n)}</span></div>
            <div class="label" id="h${i}-label">${esc(s.label)}</div>
            <h2 class="title" id="h${i}-title">${marked(s.title, s.mark)}</h2>
          </div>
          <div class="win" id="w${i}"><div class="bar"><i></i><i></i><i></i><span>${esc(s.url)}</span></div><div class="view${s.shot === "daycard" ? " dark" : ""}"><img id="w${i}-img" src="capture/${esc(scenes[i].shot)}.png" alt=""></div></div>`;
  const tags = film.scenes
    .map((s, i) => s.tags.map((t, j) => `<div class="tag" id="t${i}-${j}"><span>${esc(t.text)}</span></div>`).join(""))
    .join("");
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>AI;DR v${esc(film.version)} release film (${lang}, ${fmt})</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
${fontFaces}
${css(W, H)}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
      <section id="s-title" class="clip scene" data-start="0" data-duration="${T.title.dur + 0.6}" data-track-index="2">
        <div class="hatch top" id="hatch-top"></div><div class="hatch bottom" id="hatch-bottom"></div>
        <div class="cam" id="title-cam">
          <div class="lock" id="title-lock">
            <div class="tile-wrap" id="title-tile">${logoTile}</div>
            <div class="ver" id="title-ver">v${esc(film.version)}</div>
          </div>
          <p class="headline" id="title-head">${esc(film.headline)}</p>
          <p class="dates" id="title-dates">${esc(film.dates)}</p>
        </div>
      </section>
      <section id="s-machine" class="clip scene paper" data-start="${r3(T.title.start + T.title.dur - 0.4)}" data-duration="${r3(T.close.start + 0.6 - (T.title.dur - 0.4))}" data-track-index="1">
        <div class="grid"></div>
        <div class="push" id="machine-push">
          <div class="mcam" id="mcam" style="width:${machine.viewBox[0]}px;height:${machine.viewBox[1]}px">
            ${machineSvg}
            <div class="ring" id="ring"></div>
            ${[0, 1, 2].map((i) => `<div class="pk" id="pk-${i}"><i></i><i></i></div>`).join("")}
            <div class="plate2" id="plate">VI</div>
            <div class="plate2" id="plate-day">Aa</div>
            ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<div class="msg" id="msg-${i}">${i < 2 ? "@" : i - 1}</div>`).join("")}
            ${[0, 1, 2].map((i) => `<div class="msg feed" id="feed-${i}">RSS</div>`).join("")}
            ${tags}
          </div>
        </div>
        <div class="mask"><div class="grid"></div></div>
        ${film.scenes.map(scene).join("")}
      </section>
      <section id="s-close" class="clip scene yellow" data-start="${r3(T.close.start)}" data-duration="${r3(T.close.dur)}" data-track-index="3">
        <div class="cam" id="close-cam">
          <div class="lock" id="close-lock"><div class="tile-wrap" id="close-tile">${logoTile}</div></div>
          <p class="headline" id="close-line">${esc(film.closing)}</p>
          <p class="url" id="close-url">aidr.today/release/v${esc(film.version)}</p>
        </div>
      </section>
      ${caps.map((c, i) => `<div id="cap-${i}" class="clip cap" data-start="${r3(c.start)}" data-duration="${r3(c.end - c.start)}" data-track-index="6"><div class="line"><span>${esc(c.words.map((w) => w.text).join(" "))}</span></div></div>`).join("\n      ")}
      <audio id="a-mix" src="assets/audio/mix-${lang}.wav" data-start="0" data-duration="${TOTAL}" data-track-index="10" data-volume="1"></audio>
    </div>
    <script>
      const CFG = ${JSON.stringify(cfg)};
${readFileSync(join(ROOT, "timeline.js"), "utf8")}
    </script>
  </body>
</html>
`;
}

function css(W, H) {
  const tall = H > W;
  return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #f7f7f5; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #f7f7f5;
        font-family: "Source Sans 3 Variable", sans-serif; color: #0a0a0a; -webkit-font-smoothing: antialiased; }
      .scene { position: absolute; inset: 0; overflow: hidden; isolation: isolate; }
      #s-machine { z-index: 1; } #s-title { z-index: 2; } #s-close { z-index: 3; }
      .paper { background: #f7f7f5; } .yellow { background: #f5c518; }
      .cam, .push { position: absolute; inset: 0; transform-origin: 50% 50%; }
      .grid { position: absolute; inset: 0; opacity: .5;
        background-image: linear-gradient(#0a0a0a0d 1px, transparent 1px), linear-gradient(90deg, #0a0a0a0d 1px, transparent 1px); background-size: 48px 48px; }
      /* title and close on yellow */
      .hatch { position: absolute; left: 0; width: 100%; height: 50.5%; background: #f5c518; z-index: 2; }
      .hatch.top { top: 0; } .hatch.bottom { bottom: 0; }
      #title-cam, #close-cam { z-index: 3; }
      .lock { position: absolute; left: 0; right: 0; top: ${tall ? 560 : 250}px; display: flex; ${tall ? "flex-direction: column; gap: 30px" : "gap: 56px"}; align-items: center; justify-content: center; }
      .tile-wrap { width: ${tall ? 260 : 230}px; height: ${tall ? 260 : 230}px; border: 3px solid #0a0a0a; border-radius: 22%; overflow: hidden; }
      .tile { display: block; width: 100%; height: 100%; }
      .ver { font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${tall ? 190 : 210}px; line-height: 1; letter-spacing: -0.02em; }
      .headline { position: absolute; left: 0; right: 0; top: ${tall ? 1130 : 590}px; padding: 0 80px; text-align: center;
        font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${tall ? 92 : 96}px; line-height: 1.06; }
      .dates { position: absolute; left: 0; right: 0; top: ${tall ? 1390 : 740}px; text-align: center; font-size: ${tall ? 30 : 28}px; letter-spacing: .18em; text-transform: uppercase; }
      .url { position: absolute; left: 0; right: 0; top: ${tall ? 1290 : 730}px; text-align: center; font-weight: 600; font-size: ${tall ? 54 : 58}px; letter-spacing: .02em; }
      /* machine: accents stay paper-grey; the one yellow part is the ring on the active station */
      .mcam { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
      .mcam > svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
      .mcam .acc { --anatomy-paper:#F1F1EE; --anatomy-face:#FFFFFF; --anatomy-top:#FDFDFB; --anatomy-shade-0:#D3D3CE; --anatomy-shade-1:#DFDFDA; --anatomy-shade-2:#E9E9E5; --anatomy-shade-3:#F1F1EE; }
      .mcam .needle-tip, .mcam .needle-hub { fill: #0a0a0a; }
      .ring, .pk, .plate2, .msg, .tag { position: absolute; left: 0; top: 0; }
      .lock, .headline, .dates, .url, .head, .num, .label, .title, .ring, .pk, .plate2, .msg, .tag, .win { opacity: 0; }
      .hl { transform: scaleX(0); }
      .ring { width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; border: 10px solid #f5c518; box-shadow: 0 0 0 3px #0a0a0a, inset 0 0 0 3px #0a0a0a; }
      .pk { width: 64px; height: 44px; margin: -22px 0 0 -32px; background: #fff; border: 3px solid #0a0a0a; border-radius: 4px; }
      .pk i { position: absolute; left: 9px; right: 9px; height: 4px; background: #0a0a0a; } .pk i:first-child { top: 10px; } .pk i:last-child { top: 24px; right: 24px; }
      .plate2 { width: 150px; height: 100px; margin: -50px 0 0 -75px; background: #fff; border: 4px solid #0a0a0a; border-radius: 4px;
        font-family: "EB Garamond Variable", serif; font-size: 52px; font-weight: 600; text-align: center; line-height: 92px; }
      .msg { width: 56px; height: 56px; margin: -28px 0 0 -28px; background: #fff; border: 3px solid #0a0a0a; border-radius: 50%;
        font-family: ui-monospace, monospace; font-size: 28px; font-weight: 700; text-align: center; line-height: 50px; }
      .msg.feed { width: 84px; border-radius: 28px; margin-left: -42px; font-size: 22px; background: #f5c518; }
      .tag { width: 0; height: 0; }
      .tag span { position: absolute; left: 0; bottom: 0; display: block; white-space: nowrap; padding: 10px 20px; background: #0a0a0a; color: #f7f7f5;
        font-family: ui-monospace, monospace; font-size: 40px; border-radius: 4px; }
      /* scene header, on a paper band the machine passes under */
      .mask { position: absolute; left: 0; top: 0; z-index: 3; overflow: hidden; background: #f7f7f5; ${tall ? "width: 100%; height: 490px;" : "width: 1000px; height: 270px;"} }
      .head { position: absolute; left: ${tall ? 80 : 80}px; top: ${tall ? 230 : 64}px; width: ${tall ? 920 : 880}px; z-index: 4; }
      .num { font-family: ui-monospace, monospace; font-size: 26px; } .num span { color: #0a0a0a99; }
      .label { margin-top: 18px; font-size: 22px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: #b45309; }
      .title { margin-top: 10px; font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${tall ? 80 : 74}px; line-height: 1.04; letter-spacing: -0.01em; isolation: isolate; }
      .mk { position: relative; white-space: nowrap; }
      .hl { position: absolute; left: -0.06em; right: -0.06em; bottom: 0.08em; height: 0.4em; z-index: -1; background: #f5c518; transform-origin: 0 50%; }
      /* real capture in a quiet browser frame */
      .win { position: absolute; z-index: 4; background: #fff; border: 1px solid #0a0a0a33; border-radius: 16px; overflow: hidden; box-shadow: 0 30px 80px #0a0a0a1f;
        ${tall ? "left: 80px; top: 1000px; width: 920px; height: 500px;" : "left: 1010px; top: 96px; width: 850px; height: 820px;"} }
      .win .bar { height: 46px; display: flex; align-items: center; gap: 8px; padding: 0 18px; border-bottom: 1px solid #0a0a0a14; background: #f7f7f5; }
      .win .bar i { width: 12px; height: 12px; border-radius: 50%; background: #0a0a0a26; }
      .win .bar span { margin-left: 14px; font-family: ui-monospace, monospace; font-size: 19px; color: #0a0a0aa6; }
      .win .view { position: relative; overflow: hidden; height: calc(100% - 46px); background: #fff; }
      .win .view.dark { background: #0a0a0a; }
      .win .view img { position: absolute; left: 0; top: 0; display: block; transform-origin: 0 0; }
      /* captions: paper chip with a dark rule, bottom centre */
      .cap { z-index: 20; } .cap .line { opacity: 0; }
      .cap .line { position: absolute; left: 50%; top: ${tall ? 1530 : 960}px; width: ${tall ? 920 : 1500}px; margin-left: ${tall ? -460 : -750}px; text-align: center; }
      .cap .line span { display: inline; padding: 6px 18px 9px; background: #f7f7f5; border: 2px solid #0a0a0a; border-radius: 6px; box-decoration-break: clone; -webkit-box-decoration-break: clone;
        font-weight: 700; font-size: ${tall ? 46 : 42}px; line-height: 1.5; }
`;
}

const suffix = lang === "en" ? "" : `-${lang}`;
for (const fmt of Object.keys(SHAPES)) {
  const dir = resolve(ROOT, `../v${film.version}${suffix}${fmt === "9x16" ? "-9x16" : ""}`);
  mkdirSync(dir, { recursive: true });
  if (dir !== ROOT) {
    for (const sub of ["capture", "assets/audio", "assets/fonts"]) cpSync(join(ROOT, sub), join(dir, sub), { recursive: true });
    for (const f of ["hyperframes.json", "package.json"]) {
      const src = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
      if (src.name) src.name = `aidr-release-v${film.version}${suffix}-${fmt}`;
      writeFileSync(join(dir, f), `${JSON.stringify(src, null, 2)}\n`);
    }
  }
  writeFileSync(join(dir, "index.html"), html(fmt));
}
console.log(`v${film.version} ${lang}: ${TOTAL}s, ${caps.length} caption lines, ${hits.length} effects, ${lines.join(" ").length} voice chars`);
console.log(sections.map((s, k) => `${s.kind}@${r3(s.start)}+${s.dur} (${voices[k].host})`).join("  "));
