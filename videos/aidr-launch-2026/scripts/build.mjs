#!/usr/bin/env node
// Build both cuts of the 2026 launch film from one scene list:
//   videos/aidr-launch-2026/index.html        16:9, 1920x1080 (rendered 3840x2160)
//   videos/aidr-launch-2026-9x16/index.html   9:16, 1080x1920 (rendered 2160x3840)
// and the music bed (assets/bgm/bed.mp3, ducked under the voice).
//
// Inputs: data/film.json (copy), data/script.json + assets/voice/*.words.json (voice and word
// times), assets/machine.svg + machine.json (the machine), assets/sfx/peaks.json, capture/ (live
// site stills from scripts/capture.mjs). Needs ffmpeg on PATH.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const VERTICAL = resolve(ROOT, "../aidr-launch-2026-9x16");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));

const film = json("data/film.json");
const script = json("data/script.json");
const machine = json("assets/machine.json");
const peaks = json("assets/sfx/peaks.json");
const machineSvg = read("assets/machine.svg").replace(/<\?xml[^>]*>\s*/, "");
const logoSvg = read("assets/logo.svg").replace(/<\?xml[^>]*>\s*/, "");

const FPS = 30;
const TOTAL = 76;
const round = (t) => Math.round(t * FPS) / FPS;

const VOICE_AT = { l1: 0.5, l2: 8.4, l3: 12.6, l4: 22.4, l5: 30.4, l6: 38.4, l7: 50.4, l8: 64.5 };
const words = Object.fromEntries(
  script.lines.map((l) => [l.id, json(`assets/voice/${l.id}.words.json`)]),
);
const voiceLength = Object.fromEntries(
  script.lines.map((l) => [
    l.id,
    Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(ROOT, `assets/voice/${l.id}.wav`)]).toString()),
  ]),
);
function word(id, key) {
  const list = words[id];
  const w = typeof key === "number" ? list[key] : list.find((x) => x.text.toLowerCase().startsWith(key.toLowerCase()));
  if (!w) throw new Error(`no word ${key} in ${id}`);
  return round(VOICE_AT[id] + w.start);
}

const T = {
  hookCards: [0.5, 1.0, 1.5, 2.0],
  markSame: word("l1", "same"),
  markNew: word("l1", 11),
  collapse: 6.6,
  wipe: 7.2,
  title: 8.0,
  titleLine: word("l2", "machine"),
  hatch: 11.4,
  machineIn: 11.5,
  toSources: 12.3,
  clock: word("l3", "thirty"),
  labels: ["Hacker", "Hugging", "GitHub", "Lobsters", "RSS"].map((w) => word("l3", w)),
  counter: 13.6,
  dataIn: 19.6,
  toDedupe: 21.9,
  merge: word("l4", "one"),
  toScore: word("l4", "Then") - 0.2,
  score: word("l4", "scores"),
  toRank: 27.4,
  rankLine: word("l5", "No"),
  rankCode: word("l5", "plain"),
  rankSlots: [30.5, 31.0, 31.5, 32.0, 32.5, 33.0, 33.5, 34.0],
  aboutIn: word("l5", "public") - 0.15,
  toTldr: 37.4,
  stamp: word("l6", "edition"),
  editionIn: 42.4,
  upTo: word("l6", "Up"),
  enCol: word("l6", "English"),
  viCol: word("l6", "Vietnamese"),
  toDispatch: 49.4,
  ports: 50.1,
  channels: [word("l7", "site"), word("l7", "email"), word("l7", "Telegram"), word("l7", "Facebook"), word("l7", "daily")],
  subscribeIn: 58.0,
  storyIn: 64.0,
  proofMark: word("l8", "links"),
  lockup: word("l8", 6),
  closingWords: [7, 8, 9, 10, 11].map((n) => word("l8", n)),
  url: 70.4,
  end: TOTAL,
};

// (effect, visual hit, volume). Each effect is placed so its measured peak lands on the hit.
const HITS = [
  ...T.hookCards.map((t) => ["click-soft", t + 0.1, 0.5]),
  ["whoosh-short", T.markSame + 0.2, 0.3],
  ["whoosh-short", T.markNew + 0.2, 0.3],
  ["whoosh-cinematic", T.wipe + 0.4, 0.4],
  ["impact-bass-1", T.title + 0.1, 0.5],
  ["whoosh-cinematic", T.hatch + 0.6, 0.4],
  ["key-press", T.clock + 0.1, 0.45],
  ...T.labels.map((t) => ["pop", t + 0.1, 0.32]),
  ["whoosh-short", T.dataIn + 0.1, 0.3],
  ["whoosh-short", T.toDedupe + 0.15, 0.22],
  ["click-soft", T.merge, 0.55],
  ["whoosh-short", T.toScore + 0.15, 0.22],
  ["key-press", T.score + 0.3, 0.5],
  ["whoosh-short", T.toRank + 0.15, 0.22],
  ...T.rankSlots.map((t) => ["click-soft", t + 0.25, 0.4]),
  ["whoosh-short", T.aboutIn + 0.1, 0.3],
  ["whoosh-short", T.toTldr + 0.15, 0.22],
  ["impact-bass-1", T.stamp, 0.45],
  ["pop", T.upTo + 0.1, 0.3],
  ["pop", T.enCol + 0.1, 0.3],
  ["pop", T.viCol + 0.1, 0.3],
  ["whoosh-short", T.toDispatch + 0.15, 0.25],
  ...[0, 1, 2, 3, 4].map((i) => ["click-soft", T.ports + i * 0.133 + 0.1, 0.35]),
  ...T.channels.map((t) => ["whoosh-short", t - 0.05, 0.35]),
  ["whoosh-short", T.subscribeIn + 0.05, 0.3],
  ["whoosh-cinematic", T.storyIn + 0.1, 0.35],
  ["whoosh-short", T.proofMark + 0.2, 0.3],
  ["impact-bass-1", T.lockup + 0.1, 0.55],
  ["pop", T.url + 0.1, 0.35],
];

function audioTags() {
  const tags = [];
  for (const l of script.lines) {
    tags.push(
      `<audio id="vo-${l.id}" src="assets/voice/${l.id}.wav" data-start="${VOICE_AT[l.id]}" data-duration="${voiceLength[l.id].toFixed(2)}" data-track-index="30" data-volume="1"></audio>`,
    );
  }
  tags.push(`<audio id="bgm" src="assets/bgm/bed.mp3" data-start="0" data-duration="${TOTAL}" data-track-index="31" data-volume="1"></audio>`);
  HITS.forEach(([name, hit, volume], i) => {
    const p = peaks[name];
    const start = round(hit - p.peak);
    tags.push(
      `<audio id="sfx-${i}" src="assets/sfx/${name}.mp3" data-start="${Math.max(0, start).toFixed(3)}" data-duration="${p.duration}" data-track-index="${40 + (i % 6)}" data-volume="${volume}"></audio>`,
    );
  });
  return tags.join("\n      ");
}

/** The music bed: News Theme entered 1.5 s in (bar accents on even seconds), ducked under every
 *  voice line with 0.15 s ramps, faded out over the last 2 s. */
function buildBed() {
  const out = join(ROOT, "assets/bgm/bed.mp3");
  mkdirSync(dirname(out), { recursive: true });
  const windows = script.lines.map((l) => [VOICE_AT[l.id] - 0.1, VOICE_AT[l.id] + voiceLength[l.id]]);
  const duck = windows
    .map(([a, b]) => `clip((t-${a.toFixed(2)})/0.15,0,1)*clip((${b.toFixed(2)}-t)/0.3,0,1)`)
    .join("+");
  const gain = `0.34-0.2*min(1,${duck})`;
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-ss", "1.5", "-t", String(TOTAL), "-i", resolve(ROOT, "../aidr-launch/assets/bgm/news-theme-source.mp3"),
    "-af", `volume='${gain}':eval=frame,afade=t=in:d=0.3,afade=t=out:st=${TOTAL - 2}:d=2`,
    "-ar", "48000", "-b:a", "256k", out,
  ]);
}

// Key sources block on the story capture, as fractions of the image [x, y, w, h].
const MARKS = { desktop: [0.155, 0.355, 0.5, 0.4], mobile: [0.06, 0.445, 0.88, 0.03] };

/** Pixel size of every capture, read from PNG/JPEG headers. */
function captureDims() {
  const dir = join(ROOT, "capture");
  const out = {};
  for (const f of readdirSync(dir)) {
    const b = readFileSync(join(dir, f));
    let wh = null;
    if (b[0] === 0x89) wh = [b.readUInt32BE(16), b.readUInt32BE(20)];
    else {
      for (let i = 2; i < b.length; ) {
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xc2) { wh = [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; break; }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
    if (wh) out[f.replace(/\.(png|jpg)$/, "")] = wh;
  }
  return out;
}

const SHAPES = {
  wide: { W: 1920, H: 1080, dir: ROOT, form: "desktop", fps: FPS },
  tall: { W: 1080, H: 1920, dir: VERTICAL, form: "mobile", fps: FPS },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONTS = readFileSync(join(ROOT, "scripts/fonts.css"), "utf8");

function html(shape) {
  const { W, H, form } = shape;
  const tall = H > W;
  const cfg = { W, H, tall, T, machine, film, form, dims: captureDims(), mark: MARKS[form] };
  const [vbW, vbH] = machine.viewBox;
  const hookCards = [...film.hookBack.map((c) => ({ ...c, back: true })), ...film.hook];
  const shots = {
    home: `capture/home-${form}.png`,
    email: `capture/email-${form}.png`,
    telegram: `capture/telegram-${form}.png`,
    daycard: "capture/daycard-2026-10-20.png",
    daily: "capture/daily-video-1.jpg",
  };
  const winFor = (c, i) => {
    const img = shots[c.shot];
    const url = { home: "aidr.today", email: "Email · AI;DR daily", telegram: "t.me/s/aidr_today", daycard: "Day card · aidr.today", daily: "Daily video" }[c.shot];
    const body =
      c.shot === "daily"
        ? `<div class="thumbs">${[1, 2, 3].map((n) => `<img class="thumb" id="thumb-${n}" src="capture/daily-video-${n}.jpg" alt="">`).join("")}</div>`
        : `<div class="shot ${c.shot === "daycard" ? "fit" : ""}"><img src="${img}" alt=""></div>`;
    return `<div class="win" id="win-${c.id}" style="z-index:${10 + i}"><div class="bar"><i></i><i></i><i></i><span>${esc(url)}</span></div>${body}</div>
          <div class="chan-label" id="chan-${c.id}"><b>${esc(c.label)}</b><span>${esc(c.note)}</span></div>`;
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js" integrity="sha384-sG0Hv1tP1lZCk9KQmrIbY/XNwi+OY84GQqhMscbnsoBFqAz8KNCil1kvfL3Hbbk2" crossorigin="anonymous"></script>
    <style>
${FONTS}
${css(shape)}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="${W}" data-height="${H}">

      <!-- 1 Hook: today's real headlines, the same stories twice -->
      <div id="s-hook" class="clip scene paper" data-start="0" data-duration="${T.title}" data-track-index="1">
        <div class="cam" id="hook-cam">
          ${hookCards
            .map(
              (c, i) => `<div class="card${c.back ? " back" : ""}" id="card-${i}"><div class="dom">${esc(c.domain)}</div><div class="hl">${c.back ? "" : `<i class="mkbar" id="mk-${i}"></i>`}<span>${esc(c.title)}</span></div></div>`,
            )
            .join("\n          ")}
        </div>
        <div class="wipe" id="hook-wipe"></div>
      </div>

      <!-- 2 Title on yellow; the hatch opens onto the machine -->
      <div id="s-title" class="clip scene" data-start="${T.title}" data-duration="${T.machineIn + 0.6 - T.title}" data-track-index="3">
        <div class="hatch top" id="hatch-top"></div>
        <div class="hatch bottom" id="hatch-bottom"></div>
        <div class="cam" id="title-cam">
          <div class="logo" id="title-logo">${logoSvg}</div>
          <p class="title-line" id="title-line">${esc(film.title)}</p>
        </div>
      </div>

      <!-- 3–7 The machine: one continuous shot, the camera travels station to station -->
      <div id="s-machine" class="clip scene paper" data-start="${T.machineIn}" data-duration="${T.channels[0] + 0.6 - T.machineIn}" data-track-index="2">
        <div class="grid"></div>
        <div class="push" id="machine-push">
          <div class="mcam" id="mcam" style="width:${vbW}px;height:${vbH}px">
            ${machineSvg}
            ${film.sources.map((s, i) => `<div class="plate" id="plate-${i}" style="left:${machine.hoppers[i][0]}px;top:${machine.hoppers[i][1]}px"><span>${esc(s)}</span><span class="short">${["HN", "HF", "GH", "LO", "RSS"][i]}</span></div>`).join("\n            ")}
            <div class="tag" id="tag-clock" style="left:${machine.pivots["needle-clock"][0]}px;top:${machine.pivots["needle-clock"][1]}px">every 30 min</div>
            ${[0, 1, 2, 3, 4, 5].map((i) => `<div class="pk" id="pk-${i}"><i></i><i></i></div>`).join("")}
            <div class="dup" id="dup-a"><b>${esc(film.hook[0].domain)}</b>${esc(film.hook[0].title)}</div>
            <div class="dup" id="dup-b"><b>${esc(film.hook[1].domain)}</b>${esc(film.hook[1].title)}</div>
            <div class="dup one" id="dup-one"><b>1 story · 2 sources</b>${esc(film.hook[1].title)}</div>
            ${machine.rankSlots.slice(0, 8).map((p, i) => `<div class="slot" id="slot-${i}" style="left:${p[0] - 40}px;top:${p[1] - 4}px"></div>`).join("")}
            <div class="plate2" id="plate-en">EN</div>
            <div class="plate2" id="plate-vi">VI</div>
          </div>
        </div>
        <div class="counter" id="counter"><b>${film.sourcesEnabled}</b> sources enabled · ${esc(film.date.replace(/^\w+, /, ""))}</div>
        <div class="kicker" id="rank-line">${esc(film.rankLine)}</div>
        <div class="code" id="rank-code">${esc(film.rankCode)}</div>
        <div class="win proof" id="win-data" data-layout-allow-overlap><div class="bar"><i></i><i></i><i></i><span>aidr.today/data</span></div><div class="shot"><img src="capture/data-${form}.png" alt=""></div></div>
        <div class="win proof" id="win-about" data-layout-allow-overlap><div class="bar"><i></i><i></i><i></i><span>aidr.today/about</span></div><div class="shot"><img src="capture/about-${form}.png" alt=""></div></div>
      </div>

      <!-- 6 The edition: English and Vietnamese, hinged on the semicolon -->
      <div id="s-edition" class="clip scene paper" data-start="${T.editionIn}" data-duration="${T.toDispatch + 0.7 - T.editionIn}" data-track-index="4">
        <div class="cam" id="edition-cam">
          <div class="ed-head" id="ed-head"><span class="date">${esc(film.date)}</span><span class="pill" id="ed-pill">Up to 16 bullets</span></div>
          <div class="ed-cols">
            <div class="ed-col" id="ed-en"><h3>English</h3>${film.edition.en.map((b, i) => `<p class="b" id="en-${i}"><em>${i + 1}</em>${esc(b)}</p>`).join("")}</div>
            <div class="ed-semi" id="ed-semi">;</div>
            <div class="ed-col" id="ed-vi"><h3>Tiếng Việt</h3>${film.edition.vi.map((b, i) => `<p class="b" id="vi-${i}"><em>${i + 1}</em>${esc(b)}</p>`).join("")}</div>
          </div>
          <div class="ed-note" id="ed-note">Written separately. Neither language fills in for the other.</div>
        </div>
      </div>

      <!-- 7 Channels: the real screens, each on its word -->
      <div id="s-channels" class="clip scene paper" data-start="${T.channels[0] - 0.15}" data-duration="${T.storyIn + 0.6 - (T.channels[0] - 0.15)}" data-track-index="5">
        <div class="cam" id="chan-cam">
          ${film.channels.map(winFor).join("\n          ")}
          <div class="win sub" id="win-sub" style="z-index:30"><div class="bar"><i></i><i></i><i></i><span>aidr.today/subscribe</span></div><div class="shot scroll"><img id="sub-img" src="capture/subscribe-${form}-full.png" alt=""></div></div>
          <div class="chan-label" id="chan-sub" style="z-index:31"><b>${esc(film.subscribe)}</b><span>Chrome new tab · Telegram · Facebook · Email</span></div>
        </div>
      </div>

      <!-- 8 Proof, then the lockup -->
      <div id="s-story" class="clip scene paper" data-start="${T.storyIn}" data-duration="${T.lockup + 0.4 - T.storyIn}" data-track-index="6">
        <div class="cam" id="story-cam">
          <div class="win story" id="win-story"><div class="bar"><i></i><i></i><i></i><span>aidr.today/be38b11f</span></div><div class="shot"><img src="capture/story-${form}.png" alt=""><div class="hl-box" id="story-mark"></div></div></div>
          <div class="chan-label" id="story-label"><b>${esc(film.proof)}</b><span>Key sources, under every story</span></div>
        </div>
      </div>
      <div id="s-lockup" class="clip scene yellow" data-start="${T.lockup}" data-duration="${TOTAL - T.lockup}" data-track-index="7">
        <div class="cam" id="lock-cam">
          <div class="logo" id="lock-logo">${logoSvg}</div>
          <p class="closing" id="closing">${film.closing.split(" ").map((w, i) => `<span id="cw-${i}">${esc(w)}</span>`).join(" ")}</p>
          <p class="url" id="url">${esc(film.url)}</p>
        </div>
      </div>

      ${audioTags()}
    </div>
    <script>
${runtime(cfg)}
    </script>
  </body>
</html>
`;
}

function css({ W, H }) {
  const tall = H > W;
  const u = tall ? W / 1080 : H / 1080; // 1 unit = 1px at 1080 short side
  const px = (n) => `${Math.round(n * u * 10) / 10}px`;
  return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #f7f7f5; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #f7f7f5;
        font-family: "Source Sans 3 Variable", sans-serif; color: #0a0a0a; }
      .scene { position: absolute; inset: 0; overflow: hidden; }
      .paper { background: #f7f7f5; }
      .yellow { background: #f5c518; }
      .cam, .push { position: absolute; inset: 0; transform-origin: 50% 50%; }
      .grid { position: absolute; inset: 0; opacity: .55;
        background-image: linear-gradient(#0a0a0a0d 1px, transparent 1px), linear-gradient(90deg, #0a0a0a0d 1px, transparent 1px);
        background-size: ${px(48)} ${px(48)}; }

      /* Hook cards */
      .card { position: absolute; width: ${tall ? px(900) : px(760)}; padding: ${px(26)} ${px(30)} ${px(30)};
        background: #fff; border: 1px solid #0a0a0a1f; border-radius: ${px(10)}; }
      .card.back { opacity: .5; }
      .card .dom { font-family: ui-monospace, monospace; font-size: ${px(19)}; letter-spacing: .02em; color: #b45309; margin-bottom: ${px(10)}; }
      .card .hl { font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${px(40)}; line-height: 1.16; }
      .hl { position: relative; }
      .hl span { position: relative; }
      .mkbar { position: absolute; left: -0.1em; right: -0.1em; top: 0.05em; bottom: 0; background: #f5c518; transform-origin: 0 50%; opacity: 0; }
      .wipe { position: absolute; left: 50%; top: 50%; width: ${px(160)}; height: ${px(160)}; margin: ${px(-80)} 0 0 ${px(-80)};
        border-radius: 50%; background: #f5c518; }

      /* Title */
      .hatch { position: absolute; left: 0; width: 100%; height: 50.5%; background: #f5c518; }
      .hatch.top { top: 0; } .hatch.bottom { bottom: 0; }
      .logo { position: absolute; left: 50%; top: ${tall ? "38%" : "33%"}; width: ${px(400)}; height: ${px(400)}; margin: ${px(-200)} 0 0 ${px(-200)}; }
      .logo { background: #f7f7f5; border: 2px solid #0a0a0a; border-radius: 14%; padding: 2%; }
      .logo svg { width: 100%; height: 100%; display: block; }
      .title-line { position: absolute; left: 0; right: 0; top: ${tall ? "56%" : "64%"}; text-align: center; padding: 0 ${px(60)};
        font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${px(tall ? 76 : 70)}; line-height: 1.1; }

      /* Machine */
      .mcam { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
      .mcam > svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
      .plate, .tag, .slot, .plate2, .pk, .dup { position: absolute; }
      .plate { width: 0; height: 0; }
      .plate span { position: absolute; left: 0; bottom: 0; transform: translateX(-50%); display: block; margin-bottom: 130px; padding: 8px 16px; white-space: nowrap; background: #0a0a0a; color: #f7f7f5;
        font-size: 40px; font-weight: 600; letter-spacing: .01em; border-radius: 4px; }
      .plate span.short { margin-bottom: 64px; padding: 4px 8px; font-size: 30px; font-family: ui-monospace, monospace; font-weight: 400; opacity: 0; }
      .tag { margin: -110px 0 0 40px; padding: 6px 14px; background: #f5c518; font-family: ui-monospace, monospace; font-size: 30px; white-space: nowrap; }
      .pk { left: 0; top: 0; width: 46px; height: 30px; margin: -15px 0 0 -23px; background: #fff; border: 2px solid #0a0a0a; border-radius: 3px; }
      .pk i { position: absolute; left: 7px; right: 7px; height: 3px; background: #0a0a0a; }
      .pk i:first-child { top: 7px; background: #f5c518; height: 5px; } .pk i:last-child { top: 17px; right: 16px; }
      .dup { left: 0; top: 0; width: 360px; z-index: 5; padding: 14px 16px; background: #fff; border: 2px solid #0a0a0a; border-radius: 6px;
        font-family: "EB Garamond Variable", serif; font-size: 25px; line-height: 1.15; }
      .dup b { display: block; font-family: ui-monospace, monospace; font-weight: 400; font-size: 16px; color: #b45309; margin-bottom: 6px; }
      .dup.one { border-color: #0a0a0a; box-shadow: inset 0 0 0 4px #f5c518; }
      .dup.one b { color: #0a0a0a; background: #f5c518; display: inline-block; padding: 2px 6px; }
      .slot { width: 80px; height: 8px; background: #f5c518; border: 1px solid #0a0a0a; transform-origin: 0 50%; }
      .plate2 { left: 0; top: 0; width: 120px; height: 80px; margin: -40px 0 0 -60px; background: #fff; border: 3px solid #0a0a0a;
        font-family: "EB Garamond Variable", serif; font-size: 40px; font-weight: 600; text-align: center; line-height: 74px; }
      .counter { position: absolute; left: ${px(64)}; bottom: ${tall ? px(400) : px(56)}; font-size: ${px(28)}; letter-spacing: .01em; }
      .counter b { font-family: ui-monospace, monospace; background: #f5c518; padding: 0 ${px(8)}; }
      .kicker { position: absolute; left: ${px(64)}; top: ${tall ? px(260) : px(70)}; right: ${px(64)};
        font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${px(tall ? 84 : 78)}; line-height: 1.05; }
      .code { position: absolute; left: ${px(64)}; top: ${tall ? px(460) : px(170)}; font-family: ui-monospace, monospace; font-size: ${px(28)};
        padding: ${px(4)} ${px(10)}; background: #0a0a0a; color: #f7f7f5; }

      /* Windows: a real capture in a quiet browser frame */
      .win { position: absolute; background: #fff; border: 1px solid #0a0a0a33; border-radius: ${px(14)}; overflow: hidden;
        box-shadow: 0 ${px(30)} ${px(80)} #0a0a0a1f; }
      .win .bar { height: ${px(44)}; display: flex; align-items: center; gap: ${px(8)}; padding: 0 ${px(16)}; border-bottom: 1px solid #0a0a0a14; background: #f7f7f5; }
      .win .bar i { width: ${px(12)}; height: ${px(12)}; border-radius: 50%; background: #0a0a0a26; }
      .win .bar span { margin-left: ${px(14)}; font-family: ui-monospace, monospace; font-size: ${px(18)}; color: #0a0a0a99; }
      .win .shot { position: relative; overflow: hidden; height: calc(100% - ${px(44)}); }
      .win .shot img { display: block; width: 100%; }
      .win .shot.fit { background: #0a0a0a; display: flex; align-items: center; }
      .chan-label { position: absolute; }
      .chan-label b { display: block; font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${px(tall ? 80 : 72)}; line-height: 1.04; }
      .chan-label span { display: block; margin-top: ${px(14)}; font-size: ${px(28)}; line-height: 1.3; color: #0a0a0acc; }
      .thumbs { position: relative; height: 100%; background: #0a0a0a; }
      .thumb { position: absolute; border-radius: ${px(8)}; border: ${px(3)} solid #f7f7f5; object-fit: cover; }
      .hl-box { position: absolute; background: #f5c51866; mix-blend-mode: multiply; transform-origin: 0 50%; }

      /* Edition */
      .ed-head { position: absolute; left: ${px(80)}; right: ${px(80)}; top: ${tall ? px(250) : px(70)}; display: flex; ${tall ? `flex-direction: column; gap:${px(18)}` : "justify-content: space-between"}; align-items: ${tall ? "flex-start" : "center"}; }
      .ed-head .date { font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${px(tall ? 64 : 60)}; }
      .pill { font-family: ui-monospace, monospace; font-size: ${px(28)}; padding: ${px(6)} ${px(14)}; background: #f5c518; }
      .ed-cols { position: absolute; left: ${px(80)}; right: ${px(80)}; top: ${tall ? px(470) : px(200)}; display: flex; ${tall ? "flex-direction: column;" : ""} gap: ${px(tall ? 10 : 40)}; }
      .ed-col { flex: 1; }
      .ed-col h3 { font-size: ${px(26)}; letter-spacing: .14em; text-transform: uppercase; color: #b45309; padding-bottom: ${px(12)}; border-bottom: 1px solid #0a0a0a1f; margin-bottom: ${px(8)}; }
      .ed-col .b { position: relative; padding: ${px(tall ? 12 : 16)} 0 ${px(tall ? 12 : 16)} ${px(46)}; border-bottom: 1px solid #0a0a0a14;
        font-family: "EB Garamond Variable", serif; font-size: ${px(tall ? 32 : 37)}; line-height: 1.22; }
      .ed-col .b em { position: absolute; left: 0; top: ${px(tall ? 12 : 16)}; font-style: normal; font-family: ui-monospace, monospace; font-size: ${px(24)}; color: #b45309; }
      .ed-semi { ${tall ? `align-self: center; height:${px(90)}; line-height:${px(90)}` : `width:${px(70)}; padding-top:${px(150)}`}; text-align: center;
        font-family: "EB Garamond Variable", serif; font-weight: 600; font-size: ${px(tall ? 120 : 150)}; color: #0a0a0a; }
      .ed-note { position: absolute; left: ${px(80)}; right: ${px(80)}; bottom: ${tall ? px(390) : px(58)}; font-size: ${px(28)}; color: #0a0a0acc; }

      /* Lockup */
      .closing { position: absolute; left: 0; right: 0; top: ${tall ? "56%" : "64%"}; text-align: center; padding: 0 ${px(50)};
        font-family: "EB Garamond Variable", serif; font-weight: 500; font-size: ${px(tall ? 86 : 84)}; line-height: 1.08; }
      .closing span { display: inline-block; }
      .url { position: absolute; left: 0; right: 0; top: ${tall ? "70%" : "79%"}; text-align: center; font-weight: 600; font-size: ${px(52)}; letter-spacing: .24em; padding-left: .24em; }
`;
}

function runtime(cfg) {
  return `const CFG = ${JSON.stringify(cfg)};
${readFileSync(join(ROOT, "scripts/timeline.js"), "utf8")}`;
}

buildBed();
for (const [name, shape] of Object.entries(SHAPES)) {
  mkdirSync(shape.dir, { recursive: true });
  if (shape.dir !== ROOT) {
    // The 9:16 project serves its own copy of the media (ignored by git; regenerated here).
    for (const sub of ["assets", "capture"]) cpSync(join(ROOT, sub), join(shape.dir, sub), { recursive: true });
    for (const f of ["package.json", "hyperframes.json"]) {
      const src = JSON.parse(read(f));
      if (src.name) src.name = "aidr-launch-2026-9x16";
      writeFileSync(join(shape.dir, f), `${JSON.stringify(src, null, 2)}\n`);
    }
  }
  writeFileSync(join(shape.dir, "index.html"), html(shape));
  console.log(`wrote ${name} ${shape.W}x${shape.H} → ${join(shape.dir, "index.html")}`);
}
if (!existsSync(join(ROOT, "capture")) || readdirSync(join(ROOT, "capture")).length === 0) {
  console.warn("capture/ is empty: run scripts/capture.mjs first");
}
