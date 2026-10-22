#!/usr/bin/env node
// Build both cuts of the Chrome extension promo from one time sheet:
//   index.html     16:9, 1920x1080
//   9x16/index.html  9:16, 1080x1920 (assets/ and capture/ copied in, ignored)
// and the music bed (assets/bgm/bed.mp3, ducked under the voice).
//
// Inputs: data/script.json + assets/voice/*.words.json, capture/ (scripts/capture.mjs),
// assets/sfx/peaks.json. Needs ffmpeg and ffprobe on PATH.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));

const script = json("data/script.json");
const peaks = json("assets/sfx/peaks.json");
const logoSvg = read("assets/logo.svg").replace(/<\?xml[^>]*>\s*/, "");
const FONTS = read("scripts/fonts.css");

const FPS = 30;
const TOTAL = 17;
const round = (t) => Math.round(t * FPS) / FPS;
const VOICE_AT = { l1: 0.3, l2: 4.8, l3: 10.4 };
const words = Object.fromEntries(script.lines.map((l) => [l.id, json(`assets/voice/${l.id}.words.json`)]));
const voiceLength = Object.fromEntries(
  script.lines.map((l) => [
    l.id,
    Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(ROOT, `assets/voice/${l.id}.wav`)]).toString()),
  ]),
);
const word = (id, i) => round(VOICE_AT[id] + words[id][i].start);

const T = {
  forget: word("l1", 0),
  forget2: word("l1", 1),
  logo: word("l1", 2),
  has: word("l1", 4),
  marker: word("l1", 6),
  wipe: 4.1,
  tab: 4.4,
  stories: word("l2", 6),
  english: word("l2", 10),
  store: 10.2,
  free: word("l3", 1),
  end: 11.8,
  slash: word("l3", 11),
};

// Regions of the 2880x1800 desktop captures (device pixels) the camera frames.
const SHOT = { w: 2880, h: 1800 };
const R = {
  page: [0, 0, 2880, 1800],
  card: [425, 540, 2040, 960],
  cardLeft: [425, 540, 1110, 960],
  toggle: [2140, 24, 172, 72],
  toggleView: [1960, 0, 620, 140],
  toggleViewTall: [2080, 0, 400, 140],
  store: [330, 440, 2250, 520],
  storeTall: [330, 400, 1150, 300],
  addTall: [1900, 400, 900, 300],
  add: [2218, 524, 295, 81],
};

// Caption chunks: [line, first word index, text]. A chunk shows from its first word to the next.
const CHUNKS = [
  ["l1", 0, "Don't forget."],
  ["l1", 2, "AI;DR has a Chrome extension."],
  ["l2", 0, "Every new tab opens on"],
  ["l2", 5, "today's top AI stories,"],
  ["l2", 9, "in English or Vietnamese."],
  ["l3", 0, "It's free."],
  ["l3", 2, "Get it at aidr.today/c"],
].map(([id, i, text], n, all) => {
  const next = all[n + 1];
  const lineEnd = round(VOICE_AT[id] + words[id].at(-1).end + 0.25);
  const end = next && next[0] === id ? word(id, next[1]) : lineEnd;
  return { at: word(id, i), end, text };
});

// [sfx, visual hit, volume]
const HITS = [
  ["whoosh-short", 4.32, 0.5],
  ["key-press", T.tab, 0.6],
  ["whoosh-short", T.stories + 0.35, 0.3],
  ["whoosh-short", T.store + 0.3, 0.45],
  ["click-soft", T.free + 0.35, 0.7],
  ["impact-bass-1", T.end, 0.55],
  ["pop", T.slash + 0.25, 0.35],
];

function audioTags() {
  const tags = script.lines.map(
    (l) => `<audio id="vo-${l.id}" src="assets/voice/${l.id}.wav" data-start="${VOICE_AT[l.id]}" data-duration="${voiceLength[l.id].toFixed(2)}" data-track-index="30" data-volume="1"></audio>`,
  );
  tags.push(`<audio id="bgm" src="assets/bgm/bed.mp3" data-start="0" data-duration="${TOTAL}" data-track-index="31" data-volume="1"></audio>`);
  HITS.forEach(([name, hit, volume], i) => {
    const p = peaks[name];
    tags.push(
      `<audio id="sfx-${i}" src="assets/sfx/${name}.mp3" data-start="${Math.max(0, round(hit - p.peak)).toFixed(3)}" data-duration="${p.duration}" data-track-index="${40 + i}" data-volume="${volume}"></audio>`,
    );
  });
  return tags.join("\n      ");
}

/** News Theme bed, ducked under each voice line with short ramps, faded out over the last 1.5 s. */
function buildBed() {
  const out = join(ROOT, "assets/bgm/bed.mp3");
  mkdirSync(join(ROOT, "assets/bgm"), { recursive: true });
  const duck = script.lines
    .map((l) => [VOICE_AT[l.id] - 0.1, VOICE_AT[l.id] + voiceLength[l.id]])
    .map(([a, b]) => `clip((t-${a.toFixed(2)})/0.15,0,1)*clip((${b.toFixed(2)}-t)/0.3,0,1)`)
    .join("+");
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-ss", "1.5", "-t", String(TOTAL), "-i", resolve(ROOT, "../aidr-launch/assets/bgm/news-theme-source.mp3"),
    "-af", `volume='0.36-0.24*min(1,${duck})':eval=frame,afade=t=in:d=0.2,afade=t=out:st=${TOTAL - 1.5}:d=1.5`,
    "-ar", "48000", "-b:a", "256k", out,
  ]);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function layout(W, H) {
  const tall = H > W;
  return tall
    ? { tall, win: [60, 300, 960, 1180], cap: 1640, label: 230 }
    : { tall, win: [150, 104, 1620, 800], cap: 984, label: 58 };
}

function css(W, H, L) {
  const [wx, wy, ww, wh] = L.win;
  const t = L.tall;
  return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #f7f7f5; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #f7f7f5;
        font-family: "Source Sans 3 Variable", sans-serif; color: #0a0a0a; }
      .scene { position: absolute; inset: 0; overflow: hidden; }
      .cam { position: absolute; inset: 0; transform-origin: 50% 50%; }
      .paper { background: #f7f7f5; }
      .yellow { background: #f5c518; }
      .hook { position: absolute; left: 0; right: 0; top: ${t ? 640 : 300}px; text-align: center; }
      .forget { font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${t ? 150 : 176}px; line-height: 1; letter-spacing: -0.01em; }
      .forget span { display: inline-block; }
      .has { margin-top: ${t ? 70 : 54}px; font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${t ? 82 : 92}px; line-height: 1.15; }
      .has .row { display: block; }
      .has .w { display: inline-block; }
      .tile { display: inline-block; width: ${t ? 104 : 112}px; height: ${t ? 104 : 112}px; vertical-align: -0.24em; margin-right: 0.18em; }
      .tile svg { width: 100%; height: 100%; display: block; }
      .mk { position: relative; display: inline-block; isolation: isolate; }
      .mk i { position: absolute; left: -0.08em; right: -0.08em; top: 0.52em; height: 0.5em; background: #f5c518; transform-origin: 0 50%; z-index: -1; }
      .mk b { font-weight: 500; position: relative; }
      .wipe { position: absolute; inset: 0; background: #f5c518; }
      .label { position: absolute; left: ${wx}px; top: ${L.label}px; font: 600 ${t ? 34 : 26}px/1 ui-monospace, "SFMono-Regular", Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; }
      .win { position: absolute; left: ${wx}px; top: ${wy}px; width: ${ww}px; height: ${wh}px; background: #f7f7f5;
        border: 2px solid #0a0a0a; border-radius: ${t ? 28 : 22}px; overflow: hidden; }
      .view { position: absolute; left: 0; top: 0; width: ${SHOT.w}px; height: ${SHOT.h}px; transform-origin: 0 0; }
      .view img { position: absolute; left: 0; top: 0; width: ${SHOT.w}px; height: ${SHOT.h}px; }
      .ring { position: absolute; border: 10px solid #0a0a0a; border-radius: 26px; }
      .ring.y { border-color: #f5c518; box-shadow: 0 0 0 6px #0a0a0a; }
      .end { position: absolute; left: 0; right: 0; top: ${t ? 600 : 250}px; text-align: center; }
      .end .tile { width: ${t ? 170 : 150}px; height: ${t ? 170 : 150}px; margin: 0; }
      .url { margin-top: ${t ? 70 : 50}px; font-weight: 700; font-size: ${t ? 158 : 190}px; line-height: 1; letter-spacing: -0.02em; }
      .url .mk i { top: 0.6em; height: 0.42em; }
      .url .mk b { font-weight: 700; }
      .sub { margin-top: ${t ? 56 : 44}px; font-size: ${t ? 46 : 44}px; font-weight: 500; color: #3f3f3c; }
      .caps { position: absolute; left: 0; right: 0; top: ${L.cap}px; height: 0; }
      .cap { position: absolute; left: 50%; top: 0; white-space: nowrap; padding: ${t ? "14px 30px" : "10px 26px"};
        background: #0a0a0a; color: #f7f7f5; border-radius: 12px; font-weight: 600; font-size: ${t ? 52 : 46}px; line-height: 1.2; opacity: 0; }
  `;
}

function html(W, H) {
  const L = layout(W, H);
  const cfg = { W, H, T, R, SHOT, L, CHUNKS, TOTAL };
  const forget = ["Don't", "forget."].map((w, i) => `<span id="f-${i}">${w}</span>`).join(" ");
  const hasRows = L.tall
    ? `<span class="row"><span class="w tile" id="h-logo">${logoSvg}</span><span class="w" id="h-0">has a</span></span><span class="row"><span class="w mk" id="h-1"><i id="h-mk"></i><b>Chrome extension.</b></span></span>`
    : `<span class="row"><span class="w tile" id="h-logo">${logoSvg}</span><span class="w" id="h-0">has a</span> <span class="w mk" id="h-1"><i id="h-mk"></i><b>Chrome extension.</b></span></span>`;
  const ring = (id, [x, y, w, h], cls, pad) =>
    `<div class="ring ${cls}" id="${id}" style="left:${x - pad}px;top:${y - pad}px;width:${w + pad * 2}px;height:${h + pad * 2}px"></div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js" integrity="sha384-sG0Hv1tP1lZCk9KQmrIbY/XNwi+OY84GQqhMscbnsoBFqAz8KNCil1kvfL3Hbbk2" crossorigin="anonymous"></script>
    <style>
${FONTS}
${css(W, H, L)}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="${W}" data-height="${H}">

      <!-- 1 Hook -->
      <div id="s-hook" class="clip scene paper" data-start="0" data-duration="${T.tab}" data-track-index="1">
        <div class="cam" id="hook-cam">
          <div class="hook">
            <p class="forget">${forget}</p>
            <p class="has">${hasRows}</p>
          </div>
        </div>
        <div class="wipe" id="hook-wipe"></div>
      </div>

      <!-- 2 The real new tab, then the real store listing, in one window -->
      <div id="s-tab" class="clip scene yellow" data-start="${T.tab}" data-duration="${T.end - T.tab}" data-track-index="2">
        <p class="label" id="label-tab">New tab · AI;DR for Chrome</p>
        <p class="label" id="label-store">Chrome Web Store</p>
        <div class="win" id="win">
          <div class="view" id="view-tab">
            <img src="capture/newtab-desktop.png" alt="">
            ${ring("ring-toggle", R.toggle, "", 14)}
          </div>
          <div class="view" id="view-store">
            <img src="capture/store-desktop.png" alt="">
            ${ring("ring-add", R.add, "y", 16)}
          </div>
        </div>
      </div>

      <!-- 3 End card -->
      <div id="s-end" class="clip scene paper" data-start="${T.end}" data-duration="${TOTAL - T.end}" data-track-index="3">
        <div class="cam" id="end-cam">
          <div class="end">
            <div class="tile" id="end-logo">${logoSvg}</div>
            <p class="url" id="end-url">aidr.today<span class="mk"><i id="end-mk"></i><b>/c</b></span></p>
            <p class="sub" id="end-sub">AI;DR for Chrome · free</p>
          </div>
        </div>
      </div>

      <!-- Captions -->
      <div id="s-caps" class="clip caps" data-start="0" data-duration="${TOTAL}" data-track-index="9">
        ${CHUNKS.map((c, i) => `<p class="cap" id="cap-${i}">${esc(c.text)}</p>`).join("\n        ")}
      </div>

      ${audioTags()}
    </div>
    <script>
const CFG = ${JSON.stringify(cfg)};
${read("scripts/timeline.js")}
    </script>
  </body>
</html>
`;
}

buildBed();
writeFileSync(join(ROOT, "index.html"), html(1920, 1080));
const TALL = join(ROOT, "9x16");
for (const dir of ["assets", "capture"]) {
  rmSync(join(TALL, dir), { recursive: true, force: true });
  cpSync(join(ROOT, dir), join(TALL, dir), { recursive: true });
}
writeFileSync(join(TALL, "index.html"), html(1080, 1920));
console.log("built", JSON.stringify(T));
