#!/usr/bin/env node
/**
 * stories.json -> one HyperFrames variables file per story PER LANGUAGE.
 *
 *   node build-vars.mjs
 *
 * Writes vars/<n>-en.json and vars/<n>-vi.json. Each story ships as two videos.
 * No HTML is ever generated; this file is the entire per-story surface.
 */
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.argv[2] || process.cwd();
const reel = JSON.parse(await readFile(join(OUT, "stories.json"), "utf8"));
const dir = join(OUT, "vars");
await mkdir(dir, { recursive: true });
// clean, do not zero: a stale {} row would sail through a truthiness guard and
// then explode on the first key lookup
for (const f of await readdir(dir).catch(() => [])) {
  if (f.endsWith(".json")) await rm(join(dir, f));
}

const str = (v, fb = "") => (v === null || v === undefined || v === "" ? fb : String(v));
const score = (v) => (typeof v === "number" ? v.toFixed(1) : "");

const rows = [];
const payloads = [];
for (const s of reel.stories) {
  // the best real pull-quote this story has, if any
  const q = (s.quotesList || []).find((x) => x.quote && x.quote.trim().length > 24);
  for (const lang of ["en", "vi"]) {
    const vars = {
      lang,
      photo: s.image || "",
      photoBoxW: s.photoBoxW || 900,
      photoBoxH: s.photoBoxH || 474,
      favicon: s.favicon || "",
      sourceName: str(s.sourceName, "AI;DR"),
      digestDate: str(s.tldrDate, ""),
      kicker: "AI;DR · ranked",
      score: score(s.score),
      category: str(s.category, "AI"),
      points: str(s.points, "0"),
      comments: str(s.comments, "0"),
      quotes: str(s.quotes, "0"),
      headlineEn: str(s.title, "Untitled story"),
      headlineVi: str(s.titleVi, ""),
      quote: q ? q.quote.trim() : "",
      quoteAuthor: q ? str(q.author, "") : "",
      summaryEn: str(s.summary, ""),
      summaryVi: str(s.summaryVi, ""),
      tagsText: (s.tags || []).join(","),
      host: str(s.sourceHost, "aidr.today"),
      url: "aidr.today",
      tagline: "AI news, ranked hourly.",
      outName: `story-${s.n}-${lang}`,
    };
    await writeFile(join(dir, `${s.n}-${lang}.json`), JSON.stringify(vars, null, 2));
    payloads.push(vars);
    rows.push({ n: s.n, lang, file: `${s.n}-${lang}` });
  }
}

// the image caption carries the real favicon; give it its own file so the
// renderer never sees two media nodes with an identical signature
{
  const first = reel.stories.find((s) => s.favicon);
  if (first) await writeFile(join(OUT, "assets", "stories", "brand-fav.png"), await readFile(join(OUT, first.favicon)));
}

await writeFile(join(OUT, "batch.json"), JSON.stringify(payloads, null, 1));
console.log(`${rows.length} variables files -> ${dir}  (${reel.stories.length} stories x 2 languages)`);
for (const s of reel.stories) {
  const v = JSON.parse(await readFile(join(dir, `${s.n}-en.json`), "utf8"));
  console.log(`  ${s.n}  box ${String(v.photoBoxW).padStart(3)}x${String(v.photoBoxH).padEnd(3)} quote=${v.quote ? "y" : "n"} summary=${v.summaryEn ? "y" : "n"} vi=${v.headlineVi ? "y" : "n"}`);
}
