#!/usr/bin/env node
// Pull today's edition (English, plus the Vietnamese bullet and title for the vi cut) from the public API and download each story's real post media.
// Writes editions/<date>/edition.json (tracked) and editions/<date>/assets/ (ignored, third-party).
// Usage: node scripts/fetch.mjs [--count 6]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const countIdx = process.argv.indexOf("--count");
const count = countIdx > 0 ? Number(process.argv[countIdx + 1]) : config.count;
const UA = {
  "user-agent":
    "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Safari/537.36",
};

const data = await (await fetch(config.api, { headers: UA })).json();
const { date, bullets_en, bullets_vi = [] } = data.tldr;
const byId = Object.fromEntries(data.stories.map((s) => [s.id, s]));
const dir = join(ROOT, "editions", date);
// A written script is tied to the edition it was written from. Later runs the same day can re-rank
// the edition; refetching then would pair yesterday's script with other stories' media.
const written = ["script.json", "script.vi.json"].some((f) => {
  const p = join(dir, f);
  return existsSync(p) && !/TODO|"_bullet"/.test(readFileSync(p, "utf8"));
});
if (written && !process.argv.includes("--force")) {
  console.error(`editions/${date} already has a written script; refusing to refetch (the edition may have changed). Use --force to refetch anyway.`);
  process.exit(1);
}
mkdirSync(join(dir, "assets"), { recursive: true });

const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function download(url, base) {
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !EXT[type]) return null;
    const file = `${base}.${EXT[type]}`;
    writeFileSync(
      join(dir, "assets", file),
      Buffer.from(await res.arrayBuffer())
    );
    return `assets/${file}`;
  } catch {
    return null;
  }
}

const stories = [];
for (const [i, bullet] of bullets_en.slice(0, count).entries()) {
  const rank = i + 1;
  const sources = bullet.item_ids.map((id) => byId[id]).filter(Boolean);
  const lead = sources[0] ?? {};
  const urls = [
    bullet.image_url,
    ...sources.flatMap((s) => [
      s.image_url,
      ...(s.media_manifest?.assets ?? [])
        .filter((a) => a.type === "image")
        .map((a) => a.url),
    ]),
  ].filter(Boolean);
  const images = [];
  for (const url of [...new Set(urls)].slice(0, 3)) {
    const local = await download(url, `s${rank}-${images.length + 1}`);
    if (local) images.push({ url, local });
  }
  stories.push({
    rank,
    text: bullet.text,
    text_vi: bullets_vi[i]?.text ?? null,
    category: lead.category ?? null,
    title: lead.title ?? null,
    title_vi: lead.title_vi ?? null,
    url: lead.url ?? null,
    source: lead.url ? new URL(lead.url).hostname.replace(/^www\./, "") : null,
    permalink: lead.id ? `https://aidr.today/${lead.id.slice(0, 8)}` : null,
    images,
  });
  console.log(
    `#${rank} ${lead.category ?? "-"} · ${stories.at(-1).source ?? "-"} · ${images.length} image(s)`
  );
}

writeFileSync(
  join(dir, "edition.json"),
  `${JSON.stringify({ date, fetchedAt: new Date().toISOString(), stories }, null, 2)}\n`
);
console.log(`✓ editions/${date}/edition.json`);
