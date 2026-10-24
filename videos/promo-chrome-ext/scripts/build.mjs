#!/usr/bin/env node
// Build both cuts of the Chrome extension spot from one time sheet:
//   index.html       16:9, 1920x1080
//   9x16/index.html  9:16, 1080x1920 (assets/ copied in, ignored)
// and the music bed (assets/bgm/bed.mp3: filtered intro, opened on the first cut, ducked under the voice).
//
// Inputs: data/script.json + assets/voice/*.words.json, data/shots.json (scripts/shots.py),
// assets/music/track.mp3, assets/sfx/*.mp3. Needs ffmpeg and ffprobe on PATH.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));
const probe = (p) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(ROOT, p)]).toString());

const script = json("data/script.json");
const SHOTS = json("data/shots.json");
const logoSvg = read("assets/logo.svg").replace(/<!--[\s\S]*?-->\s*/, "");
const FONTS = read("scripts/fonts.css");

const FPS = 30;
const TOTAL = 13.5;
const round = (t) => Math.round(t * FPS) / FPS;

// The track is 120 BPM with its first beat 0.035 s in; MUSIC_IN trims that so beats sit on 0.5 s.
// Its own break runs 7.5 to 8.0 and the hotter section drops at 8.0: the end card cuts there.
const MUSIC_IN = 0.035;
const BEAT = 0.5;
const VOICE_AT = { l1: 0.4, l2: 2.6, l3: 6.4 };
const words = Object.fromEntries(script.lines.map((l) => [l.id, json(`assets/voice/${l.id}.words.json`)]));
const voiceLength = Object.fromEntries(script.lines.map((l) => [l.id, probe(`assets/voice/${l.id}.wav`)]));
const word = (id, i) => round(VOICE_AT[id] + words[id][i].start);

const T = {
  blank: [0, 1, 2].map((i) => word("l1", i)),
  open: 5 * BEAT,
  line: words.l2.map((_, i) => word("l2", i)),
  worth: word("l2", 4),
  close: 10 * BEAT,
  match: 12 * BEAT,
  aidr: word("l3", 0),
  fan: 14 * BEAT,
  end: 16 * BEAT,
  slash: word("l3", words.l3.findIndex((w) => w.text.toLowerCase().startsWith("slash"))),
};

// Each hero card is a crop of a screenshot (image px). The two light/dark twins share a crop offset
// from their yellow header, so the cut between them at T.match is a match cut. The 9:16 cut uses the
// whole tab from the top, a taller card, so it can fill close to half the frame's height.
const crop = (id, padX, top, height) => {
  const { header, w, h } = SHOTS[id];
  const y = top ?? header[1] - padX;
  return { id, x: header[0] - padX, y, w: header[2] + padX * 2, h: Math.min(height ?? h - y, h - y), sw: w, sh: h };
};
const cardsFor = (tall) => ({
  light: tall ? crop("en-light", 44, 0) : crop("en-light", 44, undefined, 1004),
  dark: tall ? crop("vi-dark", 44, 0) : crop("vi-dark", 44, undefined, 1004),
  list: crop("en-list", 44, 0, 1888),
});

// [sfx file, visual hit time, volume]. Every hit has a visual event on that frame (STORYBOARD.md).
const HITS = [
  ["tick", T.blank[0], 0.55],
  ["tick", T.blank[1], 0.55],
  ["tick", T.blank[2], 0.6],
  ["riser", T.open, 0.35],
  ["hit", T.open, 0.75],
  ["swish", T.close, 0.45],
  ["hit", T.match, 0.6],
  ["swish", T.fan, 0.5],
  ["riser", T.end, 0.4],
  ["boom", T.end, 0.5],
  ["sting", T.end, 0.45],
  ["tick", T.slash, 0.6],
];

/** Seconds from a file's start to its loudest 10 ms, so a sound's peak can sit on its visual hit. */
function peakOf(file) {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", join(ROOT, file), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], {
    maxBuffer: 1 << 26,
  });
  const a = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
  let best = 0;
  let at = 0;
  for (let i = 0; i < a.length; i += 80) {
    let m = 0;
    for (let j = i; j < Math.min(i + 80, a.length); j++) m = Math.max(m, Math.abs(a[j]));
    if (m > best) [best, at] = [m, i / 8000];
  }
  return at;
}

function audioTags() {
  const tags = script.lines.map(
    (l) =>
      `<audio id="vo-${l.id}" src="assets/voice/${l.id}.wav" data-start="${VOICE_AT[l.id]}" data-duration="${voiceLength[l.id].toFixed(2)}" data-track-index="30" data-volume="1"></audio>`,
  );
  tags.push(`<audio id="bgm" src="assets/bgm/bed.mp3" data-start="0" data-duration="${TOTAL}" data-track-index="31" data-volume="1"></audio>`);
  const sfx = {};
  HITS.forEach(([name, hit, volume], i) => {
    const file = `assets/sfx/${name}.mp3`;
    sfx[name] ??= { peak: peakOf(file), duration: probe(file) };
    const { peak, duration } = sfx[name];
    const start = Math.max(0, round(hit - peak));
    tags.push(
      `<audio id="sfx-${i}" src="${file}" data-start="${start.toFixed(3)}" data-duration="${Math.min(duration, TOTAL - start).toFixed(2)}" data-track-index="${40 + i}" data-volume="${volume}"></audio>`,
    );
  });
  return tags.join("\n      ");
}

/** The bed: low-passed until the first cut, full from T.open, ducked about 11 dB under each line, faded at the end. */
function buildBed() {
  const out = join(ROOT, "assets/bgm/bed.mp3");
  mkdirSync(join(ROOT, "assets/bgm"), { recursive: true });
  const duck = script.lines
    .map((l) => [VOICE_AT[l.id] - 0.08, VOICE_AT[l.id] + voiceLength[l.id]])
    .map(([a, b]) => `clip((t-${a.toFixed(2)})/0.1,0,1)*clip((${b.toFixed(2)}-t)/0.25,0,1)`)
    .join("+");
  const o = T.open.toFixed(2);
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-ss", String(MUSIC_IN), "-t", String(TOTAL), "-i", join(ROOT, "assets/music/track.mp3"),
    "-filter_complex",
    `[0:a]asplit[a][b];[a]atrim=0:${o},lowpass=f=420,volume=1.6[lo];[b]atrim=${o},asetpts=PTS-STARTPTS[hi];[lo][hi]concat=n=2:v=0:a=1,` +
      `volume='0.42-0.3*min(1,${duck})':eval=frame,afade=t=out:st=${TOTAL - 1.2}:d=1.2[out]`,
    "-map", "[out]", "-ar", "48000", "-b:a", "256k", out,
  ]);
}

function layout(W, H) {
  return H > W
    ? {
        tall: true,
        word: 200, wordGap: 230, wordTop: 560,
        ghost: [[-250, -560, -8], [260, -40, 6], [-180, 520, -4]], ghostW: 760,
        type: { x: 80, y: 190, w: 940, size: 124 }, heroCard: { cx: 540, cy: 1290, w: 1040 },
        showW: 1240, fan: { gapX: 0, gapY: 360, dx: 0, dy: -70, w: 1000, rot: 12 },
        label: 1730, url: 150, logo: 190, sub: 52,
      }
    : {
        tall: false,
        word: 210, wordGap: 230, wordTop: 190,
        ghost: [[-560, -200, -8], [520, -160, 6], [-80, 260, -4]], ghostW: 760,
        type: { x: 110, y: 290, w: 900, size: 118 }, heroCard: { cx: 1400, cy: 600, w: 960 },
        showW: 1960, fan: { gapX: 540, gapY: 0, dx: 0, dy: 10, w: 920, rot: 20 },
        label: 940, url: 250, logo: 190, sub: 54,
      };
}

function css(W, H, L) {
  const t = L.tall;
  return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0a0a0a; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0a0a0a;
        font-family: "Source Sans 3 Variable", sans-serif; color: #0a0a0a; }
      .scene { position: absolute; inset: 0; overflow: hidden; }
      .cam { position: absolute; inset: 0; transform-origin: 50% 50%; }
      .ink { background: #0a0a0a; }
      .sun { background: #f5c518; }
      .stage { position: absolute; inset: 0; perspective: ${t ? 1800 : 2000}px; perspective-origin: 50% 45%; }
      .stage > * { transform-style: preserve-3d; }

      .ghost { position: absolute; left: 50%; top: 50%; width: ${L.ghostW}px; height: ${Math.round(L.ghostW * 0.6)}px;
        margin: ${-Math.round(L.ghostW * 0.3)}px 0 0 ${-L.ghostW / 2}px; border-radius: 22px; background: #1b1b1a;
        border: 2px solid #2c2c2a; }
      .ghost i { position: absolute; left: 18%; right: 18%; top: 44%; height: 9%; border-radius: 999px; background: #262624; }
      .ghost b { position: absolute; left: 0; right: 0; top: 0; height: 9%; border-bottom: 2px solid #2c2c2a; }
      .blanks { position: absolute; left: 0; right: 0; top: ${L.wordTop}px; text-align: center; }
      .blank { display: block; height: ${L.wordGap}px; font-family: "EB Garamond Variable", serif; font-weight: 500;
        font-size: ${L.word}px; line-height: ${L.wordGap}px; letter-spacing: -0.02em; color: #f7f7f5; }
      .wipe { position: absolute; inset: -10%; background: #f5c518; }

      .card { position: absolute; left: 0; top: 0; transform-origin: 50% 50%; visibility: hidden; opacity: 0; }
      .card .plate { position: absolute; inset: 0; border-radius: 3%; background: #0a0a0a; transform: translate3d(3%, 4%, -1px); }
      .card .face { position: absolute; inset: 0; border-radius: 3%; overflow: hidden; border: 3px solid #0a0a0a; }
      .card img { position: absolute; transform-origin: 0 0; }

      .type { position: absolute; left: ${L.type.x}px; top: ${L.type.y}px; width: ${L.type.w}px;
        font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${L.type.size}px; line-height: 0.98; letter-spacing: -0.02em; }
      .type .w { display: inline-block; }
      .type .em { font-style: italic; }
      .type .row { display: block; overflow: hidden; padding-bottom: 0.08em; }

      .label { position: absolute; left: 0; right: 0; top: ${L.label}px; text-align: center; }
      #label { visibility: hidden; opacity: 0; }
      .pill { display: inline-flex; align-items: center; gap: 22px; padding: 16px 34px 16px 16px; border-radius: 999px;
        background: #f5c518; font-weight: 800; font-size: ${t ? 54 : 50}px; letter-spacing: -0.01em; }
      .pill .logo { width: ${t ? 76 : 70}px; height: ${t ? 76 : 70}px; }
      .logo svg { width: 100%; height: 100%; display: block; }

      .end { position: absolute; left: 0; right: 0; top: 50%; text-align: center; transform: translateY(-50%); }
      .end .logo { display: inline-block; width: ${L.logo}px; height: ${L.logo}px; }
      .end .logo svg rect { fill: #0a0a0a; }
      .end .logo svg path { fill: #f5c518; }
      .url { margin-top: ${t ? 60 : 44}px; font-weight: 800; font-size: ${L.url}px; line-height: 1; letter-spacing: -0.035em; white-space: nowrap; }
      .url .c { position: relative; display: inline-block; padding: 0 0.05em; margin-left: 0.12em; isolation: isolate; }
      .url .c i { position: absolute; inset: 0.04em -0.02em -0.06em; background: #0a0a0a; border-radius: 0.1em; transform-origin: 0 50%; z-index: -1; }
      .sub { margin-top: ${t ? 56 : 40}px; font-weight: 600; font-size: ${L.sub}px; }

      .grain { position: absolute; inset: -128px; pointer-events: none; opacity: 0.11; mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1.6 -0.3'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)'/%3E%3C/svg%3E"); }
  `;
}

const card = (id, key, CARDS) => {
  const c = CARDS[key];
  return `<div class="card" id="${id}" data-card="${key}" style="width:${c.w}px;height:${c.h}px">
            <div class="plate"></div>
            <div class="face"><img src="assets/shots/${c.id}.webp" alt="" style="left:${-c.x}px;top:${-c.y}px;width:${c.sw}px;height:${c.sh}px"></div>
          </div>`;
};

function html(W, H) {
  const L = layout(W, H);
  const CARDS = cardsFor(L.tall);
  const cfg = { W, H, T, L, CARDS, TOTAL, FPS };
  const typeRows = [["Make", "your"], ["new", "tab"], ["worth", "looking", "at."]];
  let wi = 0;
  const type = typeRows
    .map((row) => `<span class="row">${row.map((w) => `<span class="w${wi >= 4 ? " em" : ""}" id="tw-${wi++}">${w}</span>`).join(" ")}</span>`)
    .join("");

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

      <!-- 1 Hook: three blank tabs, one per "Blank." -->
      <div id="s-hook" class="clip scene ink" data-start="0" data-duration="${T.open}" data-track-index="1">
        <div class="cam" id="hook-cam">
          <div class="stage">
            ${[0, 1, 2].map((i) => `<div class="ghost" id="ghost-${i}"><b></b><i></i></div>`).join("\n            ")}
          </div>
          <div class="blanks">${[0, 1, 2].map((i) => `<span class="blank" id="blank-${i}">Blank.</span>`).join("")}</div>
        </div>
        <div class="wipe" id="hook-wipe"></div>
      </div>

      <!-- 2 Hero: the new tab lands in 3D on yellow, the line sets beside it -->
      <div id="s-hero" class="clip scene sun" data-start="${T.open}" data-duration="${T.close - T.open}" data-track-index="2">
        <div class="cam" id="hero-cam">
          <div class="stage">
            ${card("hero-back-1", "list", CARDS)}
            ${card("hero-back-0", "dark", CARDS)}
            ${card("hero-card", "light", CARDS)}
          </div>
          <p class="type">${type}</p>
        </div>
      </div>

      <!-- 3 Showcase: close tilt across the light tab, match cut to the dark one, then the three fan out -->
      <div id="s-show" class="clip scene ink" data-start="${T.close}" data-duration="${T.end - T.close}" data-track-index="3">
        <div class="cam" id="show-cam">
          <div class="stage" id="show-stage">
            ${card("show-light", "light", CARDS)}
            ${card("show-dark", "dark", CARDS)}
            ${card("fan-0", "light", CARDS)}
            ${card("fan-2", "dark", CARDS)}
            ${card("fan-1", "list", CARDS)}
          </div>
          <div class="label"><span class="pill" id="label"><span class="logo">${logoSvg}</span>AI;DR for Chrome</span></div>
        </div>
      </div>

      <!-- 4 End card -->
      <div id="s-end" class="clip scene sun" data-start="${T.end}" data-duration="${TOTAL - T.end}" data-track-index="4">
        <div class="cam" id="end-cam">
          <div class="end">
            <div class="logo" id="end-logo">${logoSvg}</div>
            <p class="url" id="end-url">aidr.today<span class="c"><i id="end-mk"></i>/c</span></p>
            <p class="sub" id="end-sub">AI;DR for Chrome</p>
          </div>
        </div>
      </div>

      <div id="s-grain" class="clip scene" data-start="0" data-duration="${TOTAL}" data-track-index="9"><div class="grain" id="grain"></div></div>

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

/** A still cover: the headline large, one hero card, and the product and link. Snapshot it with `--at 0`. */
function cover(W, H) {
  const L = layout(W, H);
  const tall = H > W;
  const c = cardsFor(false).light;
  const cw = tall ? 1040 : 1080;
  const s = cw / c.w;
  const head = tall ? { x: 70, y: 170, size: 210 } : { x: 90, y: 110, size: 150 };
  const cardAt = tall ? { x: 30, y: 1010 } : { x: 760, y: 600 };
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js" integrity="sha384-sG0Hv1tP1lZCk9KQmrIbY/XNwi+OY84GQqhMscbnsoBFqAz8KNCil1kvfL3Hbbk2" crossorigin="anonymous"></script>
    <style>
${FONTS}
${css(W, H, L)}
      .cover-head { position: absolute; left: ${head.x}px; top: ${head.y}px; width: ${tall ? 960 : 1300}px; font-family: "EB Garamond Variable", serif;
        font-weight: 500; font-size: ${head.size}px; line-height: 0.95; letter-spacing: -0.02em; }
      .cover-head em { font-style: italic; }
      .cover-card { visibility: visible; opacity: 1; transform: translate(${cardAt.x}px, ${cardAt.y}px) perspective(2000px) rotateY(${tall ? -6 : -16}deg) rotateX(8deg) rotate(-3deg) scale(${s}); transform-origin: 0 0; }
      .cover-pill .pill { background: #0a0a0a; color: #f5c518; }
      .cover-pill { position: absolute; left: ${head.x}px; ${tall ? "bottom: 120px" : "top: 470px"}; }
    </style>
  </head>
  <body>
    <div id="root" class="sun" data-composition-id="main" data-start="0" data-duration="1" data-width="${W}" data-height="${H}">
      <div class="clip scene sun" data-start="0" data-duration="1" data-track-index="1">
        <div class="card cover-card" data-card="light" style="width:${c.w}px;height:${c.h}px">
          <div class="plate"></div>
          <div class="face"><img src="assets/shots/${c.id}.webp" alt="" style="left:${-c.x}px;top:${-c.y}px;width:${c.sw}px;height:${c.sh}px"></div>
        </div>
        <p class="cover-head">Your new tab,<br><em>worth looking at.</em></p>
        <div class="cover-pill"><span class="pill"><span class="logo">${logoSvg}</span>AI;DR for Chrome · aidr.today/c</span></div>
      </div>
    </div>
    <script>window.__timelines = { main: gsap.timeline({ paused: true }) };</script>
  </body>
</html>
`;
}

buildBed();
writeFileSync(join(ROOT, "index.html"), html(1920, 1080));
const TALL = join(ROOT, "9x16");
rmSync(join(TALL, "assets"), { recursive: true, force: true });
cpSync(join(ROOT, "assets"), join(TALL, "assets"), { recursive: true });
writeFileSync(join(TALL, "index.html"), html(1080, 1920));
for (const [dir, W, H] of [[ROOT, 1920, 1080], [TALL, 1080, 1920]]) {
  mkdirSync(join(dir, "cover"), { recursive: true });
  writeFileSync(join(dir, "cover/index.html"), cover(W, H));
  rmSync(join(dir, "cover/assets"), { recursive: true, force: true });
  cpSync(join(ROOT, "assets"), join(dir, "cover/assets"), { recursive: true });
}
console.log("built", JSON.stringify(T));
