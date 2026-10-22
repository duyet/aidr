#!/usr/bin/env node
// The voice check for a release film (aidr-video-review, vo.natural): every spoken part with its rate,
// then the problems rubric.mjs finds. Reads <v>/assets/audio/vo-<lang>.json, written by the film's build.
//
//   node scripts/vo-report.mjs v0.1.16 [en|vi]
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { voiceProblems } from "../../../.agents/skills/aidr-video-review/scripts/rubric.mjs";

const [v, lang = "en"] = process.argv.slice(2);
const parts = JSON.parse(readFileSync(join(resolve(import.meta.dirname, ".."), v, `assets/audio/vo-${lang}.json`), "utf8"));
for (const p of parts) {
  const span = p.words.at(-1).end - p.words[0].start;
  const n = p.text.trim().split(/\s+/).length;
  console.log(`${p.start.toFixed(2).padStart(6)} s  ${p.kind.padEnd(6)} ${p.host.padEnd(11)} ${span.toFixed(2)} s  ${(n / span).toFixed(2)} w/s  ${p.text}`);
}
const problems = voiceProblems(parts, lang);
console.log(problems.length ? `FAIL vo.natural\n  ${problems.join("\n  ")}` : "PASS vo.natural: no rushed part, no pause over 0.6 s inside a section, no long sentence, no list of three");
process.exitCode = problems.length ? 1 : 0;
