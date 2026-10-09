#!/usr/bin/env node
// Start today's edition: fetch the edition and media, make a contact sheet of the media, and draft
// script.json from the bullets. The draft is a starting point: the agent rewrites every voice line and
// screen line (see the aidr-daily-news skill) before voicing.
// Theme choices rotate against the previous edition so two days in a row never look the same.
// Usage: node scripts/new.mjs [--count 6] [--force]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hostOrder, loadCast } from "./cast.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const passthrough = process.argv.slice(2).filter((a) => a !== "--force");
execFileSync(
  process.execPath,
  [join(ROOT, "scripts/fetch.mjs"), ...passthrough],
  { stdio: "inherit" }
);

const editions = readdirSync(join(ROOT, "editions"))
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .sort();
const date = editions.at(-1);
const dir = join(ROOT, "editions", date);
const edition = JSON.parse(readFileSync(join(dir, "edition.json"), "utf8"));

// Contact sheet of every downloaded image for curation, row by row in the printed order
// (this ffmpeg may lack drawtext, so tiles carry no labels).
const imgs = edition.stories.flatMap((s) => s.images.map((im) => im.local));
if (imgs.length) {
  const cols = 4;
  const inputs = imgs.flatMap((p) => ["-i", join(dir, p)]);
  const cells = imgs
    .map(
      (p, i) =>
        `[${i}:v]scale=480:270:force_original_aspect_ratio=increase,crop=480:270[c${i}]`
    )
    .join(";");
  const pad = (cols - (imgs.length % cols)) % cols;
  const blanks = Array.from(
    { length: pad },
    (_, k) => `color=c=black:s=480x270:d=1[b${k}]`
  ).join(";");
  const all = [
    ...imgs.map((_, i) => `[c${i}]`),
    ...Array.from({ length: pad }, (_, k) => `[b${k}]`),
  ];
  const layout = all
    .map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`)
    .join("|");
  const graph = [
    cells,
    blanks,
    `${all.join("")}xstack=inputs=${all.length}:layout=${layout}[out]`,
  ]
    .filter(Boolean)
    .join(";");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    join(dir, "assets-sheet.jpg"),
  ]);
  console.log(
    `✓ editions/${date}/assets-sheet.jpg, ${cols} per row: ${imgs.map((p) => p.replace("assets/", "")).join(" ")}`
  );
}

const scriptPath = join(dir, "script.json");
if (existsSync(scriptPath) && !process.argv.includes("--force")) {
  console.log(
    `= editions/${date}/script.json exists, left as is (--force to redraft)`
  );
  process.exit(0);
}

const prevDate = editions.filter((d) => d < date).at(-1);
const prev =
  prevDate && existsSync(join(ROOT, "editions", prevDate, "script.json"))
    ? JSON.parse(
        readFileSync(join(ROOT, "editions", prevDate, "script.json"), "utf8")
      )
    : null;
const next = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
const theme = {
  intro: "grid",
  transition: next(
    ["wipe", "ink", "shutter"],
    prev?.theme?.transition ?? "shutter"
  ),
  background: next(
    ["paper", "soft", "grid"],
    prev?.theme?.background ?? "grid"
  ),
};

const d = new Date(`${date}T12:00:00Z`);
const DOW = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
const MON = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
// Hosts take turns in the seeded cast order, in speaking order (intro, stories, outro).
const order = hostOrder(Object.keys(loadCast(config).hosts), date);
let turn = 0;
const host = () => order[turn++ % order.length];
const introHosts = [host(), host()];
const money = (t) => t.match(/\$[\d.,]+\s?[BMKT]?/)?.[0];
const thumb = edition.stories.find((s) => money(s.text)) ?? edition.stories[0];

let lastLayout = "";
const stories = edition.stories.map((s, i) => {
  const sentences = s.text
    .split(/(?<=[.!?])\s+|,\s(?=plus|while|as|and)\s?/)
    .filter(Boolean);
  let layout = !s.images.length
    ? "split"
    : money(s.text)
      ? "stat"
      : i % 2
        ? "full"
        : "split";
  if (layout === lastLayout && layout !== "split") layout = "split";
  lastLayout = layout;
  return {
    rank: s.rank,
    category: s.category,
    kicker: "TODO 2–5 words",
    headline: "TODO 5–9 words with *marker*",
    stat: money(s.text) ?? "TODO",
    statLabel: "TODO",
    statWord: "TODO",
    layout,
    images: s.images.map((im) => im.local),
    ...(s.images.length ? {} : { paper: { venue: s.source, title: s.title } }),
    voice: sentences.map((text) => ({
      anchor: host(),
      text,
    })),
    _bullet: s.text,
  };
});

const signOff = host();
let closer = host();
if (closer === introHosts[0]) closer = host();

const draft = {
  date,
  dateline: `${DOW}, ${MON} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
  theme,
  thumb: { story: thumb.rank, hook: "TODO 3–7 words" },
  post: {
    hook: "TODO one sentence",
    hashtags: ["AI", "AINews", "TechNews"],
    tiktok: "TODO",
    facebook: "TODO",
  },
  intro: {
    voice: [
      {
        anchor: introHosts[0],
        text: `This is AI DR, your AI news for ${DOW}, ${MON} ${d.getUTCDate()}.`,
      },
      {
        anchor: introHosts[1],
        text: "TODO a fresh line about today",
      },
    ],
    title: `${["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"][stories.length] ?? stories.length} stories that matter today`,
  },
  stories,
  outro: {
    voice: [
      {
        anchor: signOff,
        text: "That's AI DR for today. Every story, ranked and summarized, at aidr dot today.",
      },
      { anchor: closer, text: "See you tomorrow." },
    ],
    title: "What's happening in AI today?",
  },
};
writeFileSync(scriptPath, `${JSON.stringify(draft, null, 2)}\n`);
console.log(
  `✓ editions/${date}/script.json drafted (theme ${theme.transition}/${theme.background}; replace every TODO, rewrite voice, delete _bullet)`
);
