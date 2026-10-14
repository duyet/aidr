#!/usr/bin/env node
// Pull a weekly edition from the public API and download each story's media.
// Writes editions/week-<week>/edition.json (tracked) and editions/week-<week>/assets/ (ignored, third-party).
// The week is an ISO week of Asia/Ho_Chi_Minh dates (the Worker's snapshot key); default is the last closed week.
// Usage: node scripts/fetch-week.mjs [--week 2026-W41] [--count 8] [--force]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { download, hasWrittenScript, UA } from "./media.mjs";
import { lastClosedWeek, parseWeek } from "./week.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const arg = (n) =>
  process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null;
const week = arg("--week") ?? lastClosedWeek();
parseWeek(week);
const count = Number(arg("--count") ?? config.weekCount);

const res = await fetch(`${config.weekApi}/${week}`, { headers: UA });
if (!res.ok) {
  console.error(
    `${config.weekApi}/${week}: HTTP ${res.status} (no weekly snapshot for ${week} yet?)`
  );
  process.exit(1);
}
const data = await res.json();
const date = `week-${week}`;
const dir = join(ROOT, "editions", date);
// Same guard as fetch.mjs: a written script is tied to the edition it was written from.
if (hasWrittenScript(dir) && !process.argv.includes("--force")) {
  console.error(
    `editions/${date} already has a written script; refusing to refetch (the edition may have changed). Use --force to refetch anyway.`
  );
  process.exit(1);
}
mkdirSync(join(dir, "assets"), { recursive: true });

const stories = [];
for (const s of data.stories.slice(0, count)) {
  const urls = [s.image_url, ...(s.media_images ?? [])].filter(Boolean);
  const images = [];
  for (const url of [...new Set(urls)].slice(0, 3)) {
    const local = await download(dir, url, `s${s.rank}-${images.length + 1}`);
    if (local) images.push({ url, local });
  }
  stories.push({
    rank: s.rank,
    text: s.text_en,
    text_vi: s.text_vi ?? null,
    category: s.category ?? null,
    title: s.title ?? null,
    title_vi: s.title_vi ?? null,
    url: s.url ?? null,
    source:
      s.source ??
      (s.url ? new URL(s.url).hostname.replace(/^www\./, "") : null),
    permalink: s.path ? `https://aidr.today${s.path}` : null,
    days: s.days ?? null,
    votes: s.votes ?? null,
    images,
  });
  console.log(
    `#${s.rank} ${s.category ?? "-"} · ${stories.at(-1).source ?? "-"} · ${images.length} image(s)`
  );
}

writeFileSync(
  join(dir, "edition.json"),
  `${JSON.stringify(
    {
      date,
      kind: "weekly",
      week: data.week,
      issue: data.issue,
      start_date: data.start_date,
      end_date: data.end_date,
      intro_en: data.intro_en ?? "",
      intro_vi: data.intro_vi ?? "",
      fetchedAt: new Date().toISOString(),
      stories,
    },
    null,
    2
  )}\n`
);
console.log(`✓ editions/${date}/edition.json`);
