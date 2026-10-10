#!/usr/bin/env node
// Build one edition into renderable HyperFrames projects, one per format, plus its sound, captions,
// cover stills and post copy. Inputs: config.json, editions/<date>/{edition,script}.json, voice/.
// Usage: node scripts/build.mjs 2026-10-02 [--lang vi] [--no-audio] [--no-voice]
// No-voice cut (--no-voice, or voice.mjs left voice/mode.json at { "voice": false }): durations and word
// times come from a reading-speed estimate (config.timing.noVoice), captions are burned from the script
// text, and the mix is the music bed (not ducked) plus sfx.
//
// Output (ignored by git):  editions/<date>/out/<fmt>/        HyperFrames project (index.html, assets, audio)
//                           editions/<date>/out/cover-<fmt>/  one-frame project for the cover still
// Output (tracked):         editions/<date>/captions.srt, posts.md, timeline.json
// With --lang vi: script.vi.json in; voice-vi/, out-vi/, captions.vi.srt, timeline.vi.json and the vi block of posts.md out.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { cutOf } from "./lang.mjs";
import { estimateWords, partsOf } from "./novoice.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const BRAND = resolve(ROOT, "../brand");
const date = process.argv[2];
if (!date) throw new Error("usage: build.mjs <date> [--no-audio]");
const withAudio = !process.argv.includes("--no-audio");
const cut = cutOf(process.argv);

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const config = read(join(ROOT, "config.json"));
const dir = join(ROOT, "editions", date);
const edition = read(join(dir, "edition.json"));
const script = read(join(dir, cut.script));
const modeFile = join(dir, cut.voice, "mode.json");
const noVoice =
  process.argv.includes("--no-voice") ||
  (existsSync(modeFile) && read(modeFile).voice === false);

// Screen and post copy per language (facts and headlines come from the script).
const UI = {
  en: {
    locale: "en-US",
    daily: "AI;DR DAILY",
    topIn: (n) => `TOP ${n} IN AI`,
    brief: "DAILY BRIEF",
    topToday: (n) => `TOP ${n} TODAY`,
    via: "via",
    follow: "A new brief every day. Follow for tomorrow's.",
    intro: "Intro",
    outro: "Outro",
    stories: (n) => `${n} AI stories that matter today.`,
    tags: ["AI", "AINews", "TechNews"],
    ytTitle: (lead, date) => `AI News Today: ${lead} & more | ${date}`,
    chapters: "Chapters",
    sources: "Sources",
    today: "Today's stories:",
    daily2: "Every story, ranked and summarized daily:",
    ytTags: ["AI news today", "artificial intelligence", "AI;DR"],
    captions: "English",
    ask: "Which one matters most to you? 👇",
    bio: "Full brief: link in bio · aidr.today",
    read: "Read every story, ranked and summarized:",
    more: "more",
    query: "",
  },
  vi: {
    locale: "vi-VN",
    daily: "AI;DR MỖI NGÀY",
    topIn: (n) => `TOP ${n} TIN AI`,
    brief: "BẢN TIN NGÀY",
    topToday: (n) => `TOP ${n} HÔM NAY`,
    via: "nguồn",
    follow: "Bản tin mới mỗi ngày. Theo dõi để xem ngày mai.",
    intro: "Mở đầu",
    outro: "Kết",
    stories: (n) => `${n} tin AI đáng chú ý hôm nay.`,
    tags: ["AI", "TinAI", "CongNghe"],
    ytTitle: (lead, date) => `Tin AI hôm nay: ${lead} và hơn nữa | ${date}`,
    chapters: "Mục lục",
    sources: "Nguồn",
    today: "Tin hôm nay:",
    daily2: "Mọi tin AI, xếp hạng và tóm tắt mỗi ngày:",
    ytTags: ["tin AI hôm nay", "trí tuệ nhân tạo", "AI;DR"],
    captions: "tiếng Việt",
    ask: "Tin nào đáng chú ý nhất với bạn? 👇",
    bio: "Bản tin đầy đủ: link ở bio · aidr.today",
    read: "Đọc mọi tin, xếp hạng và tóm tắt:",
    more: "tin khác",
    query: "?lang=vi",
  },
}[cut.lang];
const theme = {
  intro: "grid",
  transition: "wipe",
  background: "paper",
  ...script.theme,
};
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const r3 = (n) => Math.round(n * 1000) / 1000;
const pad2 = (n) => String(n).padStart(2, "0");

function dayOfYear(d) {
  const t = new Date(`${d}T00:00:00Z`);
  return Math.floor((t - Date.UTC(t.getUTCFullYear(), 0, 0)) / 864e5);
}
function probe(file) {
  return Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ])
      .toString()
      .trim()
  );
}

// ---------------------------------------------------------------- timeline
const segs = [
  { id: "intro", kind: "intro", timing: config.timing.intro },
  ...script.stories.map((s) => ({
    id: `s${s.rank}`,
    kind: "story",
    story: s,
    timing: config.timing.story,
  })),
  { id: "outro", kind: "outro", timing: config.timing.outro },
];
let clock = 0;
for (const seg of segs) {
  if (noVoice) {
    const line = {
      intro: script.intro,
      outro: script.outro,
    }[seg.id]?.voice ?? seg.story.voice;
    seg.words = estimateWords(
      partsOf(line),
      { wordsPerSecond: config.timing.noVoice.wordsPerSecond, gap: config.voice.gap },
      cut.lang
    );
    seg.voiceDur = seg.words.at(-1).end;
  } else {
    const wav = join(dir, cut.voice, `${seg.id}.wav`);
    if (!existsSync(wav))
      throw new Error(`missing voice ${seg.id}: run scripts/voice.mjs ${date}`);
    seg.voiceDur = probe(wav);
    seg.words = read(join(dir, cut.voice, `${seg.id}.words.json`));
  }
  seg.start = clock;
  seg.voiceStart = clock + seg.timing.lead;
  seg.dur = seg.timing.lead + seg.voiceDur + seg.timing.tail;
  clock += seg.dur;
}
const total = r3(clock);
const intro = segs[0];
const outro = segs.at(-1);
const storySegs = segs.filter((s) => s.kind === "story");

// Spoken words compare without case, punctuation or Vietnamese diacritics.
const norm = (t) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

// The stat lands on its spoken word (script: statWord), else 40% into the line.
for (const seg of storySegs) {
  const key = seg.story.statWord && norm(seg.story.statWord);
  const hit = key && seg.words.find((w) => norm(w.text).startsWith(key));
  seg.statAt =
    seg.voiceStart +
    (hit ? Math.max(0.6, hit.start - 0.15) : Math.min(2.4, seg.voiceDur * 0.4));
}

// Intro focus: a grid tile lifts on the word that names its story (script.intro.focus: [{ rank, word }]).
let fromWord = 0;
const introFocus = (script.intro.focus ?? []).map((f) => {
  const k = intro.words.findIndex(
    (w, i) => i >= fromWord && norm(w.text).startsWith(norm(f.word))
  );
  if (k < 0)
    throw new Error(`intro.focus: "${f.word}" is not in the intro line`);
  fromWord = k + 1;
  return { rank: f.rank, at: r3(intro.voiceStart + intro.words[k].start) };
});

// ---------------------------------------------------------------- captions
function captionChunks(segList) {
  const out = [];
  for (const seg of segList) {
    const words = seg.words.map((w) => ({
      text: w.text,
      s: seg.voiceStart + w.start,
      e: seg.voiceStart + w.end,
    }));
    for (const [spoken, shown] of config.captions.replace) {
      const parts = spoken.toLowerCase().split(" ");
      for (let i = 0; i + parts.length <= words.length; i++) {
        const slice = words.slice(i, i + parts.length);
        if (
          slice.every(
            (w, k) => w.text.toLowerCase().replace(/[.,!?]/g, "") === parts[k]
          )
        ) {
          const tail = slice.at(-1).text.match(/[.,!?]+$/)?.[0] ?? "";
          words.splice(i, parts.length, {
            text: shown + tail,
            s: slice[0].s,
            e: slice.at(-1).e,
          });
        }
      }
    }
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      out.push({ seg: seg.id, words: cur });
      cur = [];
    };
    for (const w of words) {
      cur.push(w);
      if (cur.length >= config.captions.maxWords || /[.,!?;:]$/.test(w.text))
        flush();
    }
    flush();
  }
  for (const c of out) c.start = c.words[0].s;
  out.forEach((c, i) => {
    const next = out[i + 1];
    c.end = Math.min(
      c.words.at(-1).e + 0.5,
      next && next.seg === c.seg ? next.start : Infinity
    );
  });
  return out;
}
const allCaps = captionChunks(segs);
const burnCaps = allCaps.filter((c) => c.seg.startsWith("s"));

const srtTime = (t) => {
  const ms = Math.round(t * 1000);
  return `${pad2(Math.floor(ms / 3600000))}:${pad2(Math.floor(ms / 60000) % 60)}:${pad2(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, "0")}`;
};
writeFileSync(
  join(dir, cut.captions),
  allCaps
    .map(
      (c, i) =>
        `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.words.map((w) => w.text).join(" ")}\n`
    )
    .join("\n")
);

// ---------------------------------------------------------------- html pieces
const fontFaces = readFileSync(join(BRAND, "frame.md"), "utf8")
  .split("\n")
  .filter((l) => l.startsWith("@font-face"))
  .join("\n")
  .replace(
    /font-family:EB Garamond Variable/g,
    'font-family:"EB Garamond Variable"'
  );
const logoSvg = readFileSync(join(BRAND, "assets/logo.svg"), "utf8").replace(
  /<!--.*?-->\s*/s,
  ""
);
const logo = (cls) => logoSvg.replace("<svg ", `<svg class="${cls}" `);
const d = new Date(`${date}T12:00:00Z`);
const DOW = d.toLocaleDateString(UI.locale, {
  weekday: "long",
  timeZone: "UTC",
});
const MON = d.toLocaleDateString(UI.locale, { month: "long", timeZone: "UTC" });
const DAY = d.getUTCDate();
const dateline =
  script.dateline ?? `${DOW}, ${MON} ${DAY}, ${d.getUTCFullYear()}`;
const byRank = Object.fromEntries(edition.stories.map((s) => [s.rank, s]));

// Wrap *starred* phrases in the yellow marker; default marks the whole headline.
const marked = (h) =>
  h.includes("*")
    ? esc(h).replace(/\*(.+?)\*/g, '<span class="mk">$1</span>')
    : `<span class="mk">${esc(h)}</span>`;

function introHtml() {
  const v = theme.intro;
  let body;
  if (v === "grid") {
    // The summary grid: every story at once, fully drawn on frame 0 (the auto-thumbnail frame).
    const tiles = script.stories
      .map((s) => {
        const img = (s.images ??
          byRank[s.rank]?.images?.map((im) => im.local) ??
          [])[0];
        const face = img
          ? `<img id="g${s.rank}-img" src="${esc(img)}" alt="" /><div class="tshade"></div>`
          : `<div class="tpaper"><span>${esc(s.paper?.venue ?? byRank[s.rank]?.source ?? "")}</span><b>${esc(s.paper?.title ?? s.kicker)}</b></div>`;
        return `<div class="tile${img ? "" : " noimg"}" data-rank="${s.rank}">${face}<span class="tr">${s.rank}</span><div class="tt"><div class="tk">${esc(s.kicker)}</div><div class="th">${esc(s.headline.replace(/\*/g, ""))}</div></div><span class="tbar"></span></div>`;
      })
      .join("");
    body = `<div class="ghead"><div class="gdate"><span class="gday">${pad2(DAY)}</span><span class="gmon">${esc(DOW.toUpperCase())}<br/>${esc(MON.toUpperCase())} ${d.getUTCFullYear()}</span></div><div class="gbrand">${logo("")}<span>${esc(UI.daily)}<br/>${esc(UI.topIn(script.stories.length))}</span></div></div><div class="tiles">${tiles}</div><div class="gfoot">${esc(script.intro.title)}</div>`;
  } else if (v === "date-slam") {
    body = `<div class="slam"><span class="dow">${esc(DOW.toUpperCase())}</span><span class="day">${pad2(DAY)}</span><span class="mon">${esc(MON.toUpperCase())}</span></div>
      <div class="slam-tail"><div class="title">${esc(script.intro.title)}</div><div class="with">${logo("")}<span>AI;DR ${esc(UI.brief)}</span></div></div>`;
  } else if (v === "headline-stack") {
    body = `<div class="hstack"><div class="hdate"><span>${esc(DOW.toUpperCase())} ${pad2(DAY)} ${esc(MON.toUpperCase())}</span><span>AI;DR TOP ${script.stories.length}</span></div>${script.stories.map((s) => `<div class="row"><span class="n">${s.rank}</span><span class="t">${esc(s.kicker)}</span></div>`).join("")}</div>`;
  } else {
    body = `<div class="stack">${logo("biglogo")}<div class="eyebrow">AI;DR ${esc(UI.brief)}</div><div class="title">${esc(script.intro.title)}</div><div class="date">${esc(dateline)}</div>
      <div class="dots">${script.stories.map((s) => `<span>${s.rank}</span>`).join("")}</div></div>`;
  }
  return `<section id="intro" class="clip scene" data-start="0" data-duration="${r3(intro.dur + 0.05)}" data-track-index="1">
    <div class="field"></div><div class="cam"><div class="semi">;</div>${body}</div></section>`;
}

function storyHtml(seg, i) {
  const s = seg.story;
  const ed = byRank[s.rank] ?? {};
  const layout = s.layout ?? "split";
  const images = s.images ?? ed.images?.map((im) => im.local) ?? [];
  const source = s.source ?? ed.source ?? "";
  let media;
  if (images.length) {
    media =
      images
        .map(
          (src, k) => `<img id="s${s.rank}-img${k}" src="${esc(src)}" alt="" />`
        )
        .join("") +
      `<div class="shade"></div><div class="credit">${esc(source)}</div>`;
  } else {
    const p = s.paper ?? {};
    media = `<div class="paper"><div class="venue">${esc(p.venue ?? source)}</div><div class="ptitle">${esc(p.title ?? (cut.lang === "en" ? ed.title : ed.title_vi) ?? s.kicker)}</div><div class="rule"></div><div class="abs">${esc(p.abstract ?? (cut.lang === "en" ? ed.text : ed.text_vi) ?? "")}</div></div>`;
  }
  const stat =
    layout === "stat" ? `<span class="hl">${esc(s.stat)}</span>` : esc(s.stat);
  return `<section id="story-${s.rank}" class="clip scene l-${layout}" data-start="${r3(seg.start)}" data-duration="${r3(seg.dur + 0.05)}" data-track-index="${2 + (i % 2)}">
    <div class="cam">
      <div class="media">${media}</div>
      <div class="rank">${s.rank}</div>
      <div class="copy">
        <div class="cat">${esc(s.category ?? ed.category ?? "")}</div>
        <div class="kicker">${esc(s.kicker)}</div>
        <div class="head">${marked(s.headline)}</div>
        <div class="statrow"><span class="stat">${stat}</span><span class="stat-label">${esc(s.statLabel ?? "")}</span></div>
        ${source ? `<span class="src">${UI.via} <b>${esc(source)}</b></span>` : ""}
      </div>
    </div></section>`;
}

function chromeHtml() {
  const n = storySegs.length;
  const items = script.stories
    .map(
      (s) =>
        `<b>${s.rank}</b><span>${esc(s.kicker)}: ${esc(s.headline.replace(/\*/g, ""))}</span>`
    )
    .join("");
  return `<div id="chrome" class="clip" data-start="${r3(intro.dur)}" data-duration="${r3(outro.start - intro.dur)}" data-track-index="4" style="z-index:10">
    <div class="bar">${logo("logo")}<span class="show">AI;DR</span><span class="live"><span class="dot"></span>${esc(UI.brief)}</span><span class="spacer"></span>
      <span class="dateline">${esc(dateline)}</span><span class="counter">${Array.from({ length: n }, () => '<span class="seg"><span class="fill"></span></span>').join("")}<span class="num">01/${pad2(n)}</span></span></div>
    <div class="ticker"><div class="crawl">${items}${items}</div><div class="label">${esc(UI.topToday(n))}</div></div>
    <div class="footer">AIDR.TODAY</div></div>`;
}

function outroHtml() {
  return `<section id="outro" class="clip scene" data-start="${r3(outro.start)}" data-duration="${r3(outro.dur)}" data-track-index="1">
    <div class="field"></div><div class="cam"><div class="semi">;</div>
    <div class="stack">${logo("biglogo")}<div class="title">${esc(script.outro.title)}</div>
    <div class="url"><span class="mk2">aidr.today</span></div><div class="follow">${esc(script.outro.follow ?? UI.follow)}</div></div></div></section>`;
}

const wipes = segs.slice(1).map((seg) => ({
  at: r3(seg.start),
  label: seg.kind === "story" ? String(seg.story.rank) : ";",
}));
function wipesHtml() {
  return wipes
    .map((w, i) => {
      const inner =
        theme.transition === "shutter"
          ? `<div class="half top"></div><div class="half bot"></div>`
          : theme.transition === "ink"
            ? `<div class="ink-panel"><span class="n">${esc(w.label)}</span><div class="edge" style="background:#f5c518"></div></div>`
            : `<div class="panel"><span class="n">${esc(w.label)}</span><div class="edge"></div></div>`;
      return `<div id="wipe-${i}" class="clip wipe" data-start="${r3(w.at - 0.34)}" data-duration="0.82" data-track-index="5">${inner}</div>`;
    })
    .join("\n");
}

function capsHtml() {
  if (!config.captions.burn) return "";
  return burnCaps
    .map(
      (c, i) =>
        `<div id="cap-${i}" class="clip cap" data-start="${r3(c.start)}" data-duration="${r3(c.end - c.start)}" data-track-index="6"><div class="line">${c.words.map((w) => `<span class="w">${esc(w.text)}</span>`).join("")}</div></div>`
    )
    .join("\n");
}

function page(fmt, body, duration, extraHead = "") {
  const f = config.formats[fmt];
  return `<!doctype html>
<html lang="${cut.lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${f.width}, height=${f.height}" />
<title>AI;DR Daily ${date} ${fmt}</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
${fontFaces}
${readFileSync(join(ROOT, "template/style.css"), "utf8")}
${theme.accent ? `:root{--yellow:${theme.accent}}` : ""}
</style>
${extraHead}
</head>
<body>
<div id="root" class="f-${fmt} bg-${theme.background}" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${f.width}" data-height="${f.height}" data-fps="${config.fps}">
<div class="ground"></div>
${body}
</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------- audio
function buildMix(outFile) {
  const sfxDir = resolve(ROOT, config.sfx.dir);
  const sfxMeta = read(join(sfxDir, "manifest.json"));
  // Seconds from the start of each effect file to its loudest point, so the PEAK lands on the hit.
  const PEAK = {
    whoosh: 0.164,
    "whoosh-short": 0.164,
    "impact-bass-1": 0.077,
    "impact-bass-2": 0.6,
    "click-soft": 0.053,
    pop: 0.122,
    ping: 0.03,
    chime: 0.05,
  };
  const C = config.sfx.cues;
  const cues = [
    [C.open, 0.25, 1.0],
    ...wipes.map((w) => [C.storyIn, w.at, 0.8]),
    ...storySegs.map((s) => [C.rankHit, s.start + 0.3, 0.55]),
    ...storySegs.map((s) => [C.statHit, s.statAt + 0.1, 0.5]),
    [C.outro, outro.start + 0.4, 0.8],
  ];
  if (theme.intro === "countdown")
    for (const [i] of script.stories.entries())
      cues.push([C.tick, 1.3 + i * 0.2 + 0.1, 0.7]);
  if (theme.intro === "headline-stack")
    for (const [i] of script.stories.entries())
      cues.push([C.tick, 0.25 + i * 0.22 + 0.1, 0.7]);
  if (theme.intro === "grid") {
    for (const [i] of script.stories.entries())
      cues.push([C.tick, 0.8 + i * 0.3, 0.7]);
    for (const f of introFocus) cues.push([C.tick, f.at - 0.05, 0.8]);
  }
  if (theme.intro === "date-slam") cues.push([C.rankHit, 0.45, 0.9]);

  const inputs = [];
  const filters = [];
  // No-voice: no voice inputs, so the music index starts at 0.
  const nv = noVoice ? 0 : segs.length;
  if (!noVoice) {
    segs.forEach((seg, i) => {
      inputs.push("-i", join(dir, cut.voice, `${seg.id}.wav`));
      filters.push(
        `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(seg.voiceStart * 1000)}:all=1[v${i}]`
      );
    });
    filters.push(
      `${segs.map((_, i) => `[v${i}]`).join("")}amix=inputs=${nv}:normalize=0,volume=${config.voice.volume},apad=whole_dur=${total}[voice]`
    );
  }
  inputs.push("-i", resolve(ROOT, config.music.file));
  filters.push(
    `[${nv}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total},volume=${config.music.volume},afade=t=in:d=0.4,afade=t=out:st=${r3(total - 2.5)}:d=2.5[bgm]`
  );
  if (!noVoice) {
    filters.push(`[voice]asplit=2[vmix][vkey]`);
    const duckRatio = Math.max(
      2,
      (config.music.volume / config.music.duckedVolume) * 2
    );
    filters.push(
      `[bgm][vkey]sidechaincompress=threshold=0.02:ratio=${r3(duckRatio)}:attack=15:release=350[duck]`
    );
  }
  cues.forEach(([name, at, gain], k) => {
    const idx = nv + 1 + k;
    inputs.push("-i", join(sfxDir, sfxMeta[name].file));
    const startMs = Math.max(0, Math.round((at - (PEAK[name] ?? 0)) * 1000));
    filters.push(
      `[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${r3(config.sfx.volume * gain)},adelay=${startMs}:all=1[x${k}]`
    );
  });
  filters.push(
    `${cues.map((_, k) => `[x${k}]`).join("")}amix=inputs=${cues.length}:normalize=0[sfx]`
  );
  filters.push(
    noVoice
      ? `[bgm][sfx]amix=inputs=2:normalize=0,atrim=0:${total},loudnorm=I=-14:TP=-1.5:LRA=11[out]`
      : `[vmix][duck][sfx]amix=inputs=3:normalize=0,atrim=0:${total},loudnorm=I=-14:TP=-1.5:LRA=11[out]`
  );
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-ar",
    "48000",
    "-ac",
    "2",
    outFile,
  ]);
}

// ---------------------------------------------------------------- cover still
function coverHtml(fmt) {
  const t = script.thumb ?? {};
  const lead =
    script.stories.find((s) => s.rank === (t.story ?? 1)) ?? script.stories[0];
  const img = (lead.images ??
    byRank[lead.rank]?.images?.map((im) => im.local) ??
    [])[0];
  const list = script.stories
    .slice(0, fmt === "9x16" ? 4 : 3)
    .map((s) => `<li><b>${s.rank}</b>${esc(s.kicker)}</li>`)
    .join("");
  const css = `
  .cv{position:absolute;inset:0;background:var(--yellow);overflow:hidden}
  .cv .img{position:absolute;object-fit:cover;display:block}
  .cv .date{position:absolute;font-family:var(--serif);font-weight:600;line-height:.85;letter-spacing:-.04em}
  .cv .mon{position:absolute;font-weight:800;letter-spacing:.3em}
  .cv .hook{position:absolute;font-family:var(--serif);font-weight:500;line-height:1.2;letter-spacing:-.01em}
  .cv .hook span{background:var(--ink);color:var(--yellow);padding:0 14px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  .cv ul{position:absolute;list-style:none;font-weight:700}
  .cv li{display:flex;gap:18px;align-items:baseline;border-top:2px solid var(--ink);padding:10px 0}
  .cv li b{font-family:var(--serif);font-weight:600}
  .cv .brand{position:absolute;display:flex;align-items:center;gap:16px;font-weight:800;letter-spacing:.14em;background:var(--ink);color:var(--paper);padding:12px 22px 12px 12px}
  .cv .brand svg{display:block}
  .f-16x9 .cv .img{right:0;top:0;width:44%;height:100%}
  .f-16x9 .cv .date{left:70px;top:60px;font-size:330px}
  .f-16x9 .cv .mon{left:84px;top:350px;font-size:48px}
  .f-16x9 .cv .hook{left:70px;top:450px;width:960px;font-size:92px}
  .f-16x9 .cv ul{left:70px;top:800px;width:960px;font-size:30px}
  .f-16x9 .cv li{padding:6px 0}
  .f-16x9 .cv .brand{right:30px;bottom:30px;font-size:28px}
  .f-16x9 .cv .brand svg{width:56px;height:56px}
  .f-9x16 .cv .img{left:0;top:0;width:100%;height:36%}
  .f-9x16 .cv .date{left:60px;top:740px;font-size:360px}
  .f-9x16 .cv .mon{left:76px;top:1050px;font-size:52px}
  .f-9x16 .cv .hook{left:60px;top:1150px;width:960px;font-size:96px}
  .f-9x16 .cv ul{left:60px;top:1520px;width:960px;font-size:34px}
  .f-9x16 .cv .brand{left:60px;top:620px;font-size:30px}
  .f-9x16 .cv .brand svg{width:64px;height:64px}`;
  const body = `<div class="clip cv" id="cover" data-start="0" data-duration="1">
    ${img ? `<img class="img" id="cover-img" src="${esc(img)}" alt="" />` : ""}
    <div class="date">${pad2(DAY)}</div><div class="mon">${esc(MON.toUpperCase())} ${d.getUTCFullYear()}</div>
    <div class="hook"><span>${esc(t.hook ?? lead.kicker)}</span></div>
    <ul>${list}</ul>
    <div class="brand">${logo("")}${esc(UI.daily)}</div></div>
    <script>document.fonts.ready.then(()=>{const h=document.querySelector('.hook');let p=parseFloat(getComputedStyle(h).fontSize);while(h.scrollHeight>p*1.0*3+4&&p>40){p-=2;h.style.fontSize=p+'px'}window.__timelines.main=gsap.timeline({paused:true});});</script>`;
  return page(fmt, body, 1, `<style>${css}</style>`);
}

// ---------------------------------------------------------------- write projects
const outRoot = join(dir, cut.out);
const mixShared = join(outRoot, "mix.wav");
mkdirSync(outRoot, { recursive: true });
if (withAudio) buildMix(mixShared);

const motion = readFileSync(join(ROOT, "template/motion.js"), "utf8");
for (const fmt of Object.keys(config.formats)) {
  const D = {
    fmt,
    total,
    transition: theme.transition,
    intro: {
      variant: theme.intro,
      start: 0,
      dur: r3(intro.dur),
      focus: introFocus,
    },
    chrome: { start: r3(intro.dur), dur: r3(outro.start - intro.dur) },
    stories: storySegs.map((s) => ({
      start: r3(s.start),
      dur: r3(s.dur),
      layout: s.story.layout ?? "split",
      statAt: r3(s.statAt),
    })),
    outro: { start: r3(outro.start), dur: r3(outro.dur) },
    wipes,
    caps: config.captions.burn
      ? burnCaps.map((c) => ({
          start: r3(c.start),
          words: c.words.map((w) => ({ s: r3(w.s) })),
        }))
      : [],
  };
  const body = [
    introHtml(),
    ...storySegs.map(storyHtml),
    outroHtml(),
    chromeHtml(),
    wipesHtml(),
    capsHtml(),
    withAudio
      ? `<audio id="mix" src="audio/mix.wav" data-start="0" data-duration="${total}" data-track-index="9" data-volume="1"></audio>`
      : "",
    `<script>window.__DN=${JSON.stringify(D)};</script>`,
    `<script>${motion}</script>`,
  ].join("\n");

  for (const [name, html] of [
    [fmt, page(fmt, body, total)],
    [`cover-${fmt}`, coverHtml(fmt)],
  ]) {
    const out = join(outRoot, name);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, "assets"), { recursive: true });
    cpSync(join(BRAND, "assets/fonts"), join(out, "assets/fonts"), {
      recursive: true,
    });
    if (existsSync(join(dir, "assets")))
      cpSync(join(dir, "assets"), join(out, "assets"), { recursive: true });
    writeFileSync(join(out, "index.html"), html);
    writeFileSync(
      join(out, "hyperframes.json"),
      `${JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { assets: "assets" } }, null, 2)}\n`
    );
    if (withAudio && !name.startsWith("cover")) {
      mkdirSync(join(out, "audio"), { recursive: true });
      cpSync(mixShared, join(out, "audio/mix.wav"));
    }
  }
}

// ---------------------------------------------------------------- timeline + posts
const mmss = (t) => `${Math.floor(t / 60)}:${pad2(Math.floor(t % 60))}`;
writeFileSync(
  join(dir, cut.timeline),
  `${JSON.stringify({ date, total, voice: !noVoice, theme, segments: segs.map((s) => ({ id: s.id, start: r3(s.start), dur: r3(s.dur), voice: r3(s.voiceDur) })) }, null, 2)}\n`
);

const P = script.post ?? {};
const hook = P.hook ?? UI.stories(script.stories.length);
const tags = P.hashtags ?? UI.tags;
const hashtags = (n) =>
  tags
    .slice(0, n)
    .map((t) => `#${t}`)
    .join(" ");
const shortDate =
  cut.lang === "en"
    ? `${MON.slice(0, 3)} ${DAY}, ${d.getUTCFullYear()}`
    : `${DAY}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
const list = script.stories
  .map((s) => `${s.rank}. ${s.kicker}: ${s.headline.replace(/\*/g, "")}`)
  .join("\n");
const sources = script.stories
  .filter((s) => byRank[s.rank]?.url)
  .map((s) => `${s.rank}. ${byRank[s.rank].url}`)
  .join("\n");
// YouTube rejects chapters shorter than 10 s: a short intro takes the first story's title at 0:00,
// any other short chapter folds into the one before it.
const marks = [
  { t: 0, label: UI.intro },
  ...storySegs.map((s) => ({ t: s.start, label: s.story.kicker })),
  { t: outro.start, label: UI.outro },
];
for (let i = 0; i < marks.length; ) {
  const end = marks[i + 1]?.t ?? total;
  if (end - marks[i].t >= 10 || marks.length === 1) i++;
  else if (i === 0) marks.splice(0, 2, { t: 0, label: marks[1].label });
  else marks.splice(i, 1);
}
const chapters = marks.map((m) => `${mmss(m.t)} ${m.label}`).join("\n");
const dayUrl = `https://aidr.today/date/${date}${UI.query}`;
const home = `https://aidr.today${UI.query ? `/${UI.query}` : ""}`;
const ytTitle = (
  P.youtubeTitle ??
  UI.ytTitle(
    script.stories
      .slice(0, 2)
      .map((s) => s.kicker)
      .join(", "),
    shortDate
  )
).slice(0, 100);

// posts.md holds one block per language; a build rewrites only its own block.
const block = `<!-- posts:${cut.lang} -->
# Posts (${cut.lang.toUpperCase()}) — AI;DR Daily ${date}

Files: \`renders/${cut.video(date, "16x9")}\`, \`renders/${cut.video(date, "9x16")}\`, covers \`renders/${cut.cover(date, "16x9")}\`, \`renders/${cut.cover(date, "9x16")}\`, captions \`${cut.captions}\`. Length ${mmss(total)} (${total}s).

## YouTube (16:9)

**Title** (${ytTitle.length}/100)

${ytTitle}

**Description**

${hook} ${dateline}.

${list}

${UI.chapters}
${chapters}

${UI.sources}
${sources}

${UI.today} ${dayUrl}
${UI.daily2} ${home}

${hashtags(5)}

**Tags:** ${[...tags, ...UI.ytTags].join(", ")}
**Captions:** upload \`${cut.captions}\` (${UI.captions}). **Thumbnail:** \`${cut.cover(date, "16x9")}\`.

## YouTube Shorts (9:16)

**Title**

${(P.shortsTitle ?? `${hook} ${shortDate}`).slice(0, 92)} #Shorts

**Description**

${list}

${dayUrl} · ${home} ${hashtags(4)}

## TikTok (9:16)

${P.tiktok ?? `${hook} ${UI.ask}`}

${hashtags(5)}

Cover: \`${cut.cover(date, "9x16")}\`. Captions are burned in.

## Instagram Reels (9:16)

${hook}

${list}

${UI.bio}

${hashtags(8)}

## Facebook Page (post the 16:9, or the 9:16 as a Reel)

${P.facebook ?? `${hook} ${dateline}.`}

${list}

${UI.today} ${dayUrl}
${UI.read} ${home}

${hashtags(4)}

## X / Threads

${hook} ${shortDate}

${script.stories
  .slice(0, 3)
  .map((s) => `${s.rank}. ${s.kicker}`)
  .join("\n")}
+${Math.max(0, script.stories.length - 3)} ${UI.more} → ${dayUrl}
<!-- /posts:${cut.lang} -->
`;
const postsPath = join(dir, "posts.md");
const blocks = Object.fromEntries(
  [
    ...(existsSync(postsPath) ? readFileSync(postsPath, "utf8") : "").matchAll(
      /<!-- posts:(\w+) -->[\s\S]*?<!-- \/posts:\1 -->\n/g
    ),
  ].map((m) => [m[1], m[0]])
);
blocks[cut.lang] = block;
writeFileSync(
  postsPath,
  ["en", "vi"]
    .filter((l) => blocks[l])
    .map((l) => blocks[l])
    .join("\n")
);

console.log(
  `✓ ${date}: ${total}s${noVoice ? " · NO VOICE (estimated read-along timing)" : ""} · intro=${theme.intro} · transition=${theme.transition} · bg=${theme.background}`
);
console.log(
  `  ${cut.out}/${Object.keys(config.formats).join(`, ${cut.out}/`)} · ${cut.captions} (${allCaps.length} cues) · posts.md (${cut.lang})`
);
