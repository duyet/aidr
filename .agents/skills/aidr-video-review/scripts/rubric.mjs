#!/usr/bin/env node
// The scored rubric's automatic items for one daily-news edition. Prints every RUBRIC row: PASS or FAIL with the
// reason for an automatic row, "judge" for a row the reviewer scores by watching. SKILL.md "Scored rubric" says
// how to total it.
// Usage: node rubric.mjs videos/daily-news/editions/<date> [--motion motion.json] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PACING,
  pacingProblems,
  validateScript,
} from "../../../../videos/daily-news/scripts/auto-script.mjs";
import {
  coverStory,
  thumbStory,
} from "../../../../videos/daily-news/scripts/look.mjs";

/** Every scored row: its area, points, and whether a script decides it. Points sum to 10. */
export const RUBRIC = [
  {
    id: "style.motion",
    area: "style",
    points: 1,
    auto: true,
    ask: "motion_report: no dead_stop or frozen flag",
  },
  {
    id: "style.focus",
    area: "style",
    points: 1,
    ask: "one focal point per frame; every line holds still 8+ frames after it lands",
  },
  {
    id: "style.sound",
    area: "style",
    points: 1,
    ask: "each effect peaks within one frame of its visual hit; the bed never fights the voice",
  },
  {
    id: "content.facts",
    area: "content",
    points: 1,
    auto: true,
    ask: "every number and claim on screen and in the voice is in the edition",
  },
  {
    id: "content.read",
    area: "content",
    points: 1,
    ask: "no clipped or overflowing text; the headline adds to the voice instead of repeating it",
  },
  {
    id: "vo.pacing",
    area: "vo",
    points: 1,
    auto: true,
    ask: `story opens in ${PACING.first} words or fewer, no sentence over ${PACING.sentence}, intro ${PACING.intro} or fewer`,
  },
  {
    id: "vo.length",
    area: "vo",
    points: 0.5,
    auto: true,
    ask: "voiced, and under the 90 s Reel limit",
  },
  {
    id: "vo.natural",
    area: "vo",
    points: 1.5,
    ask: "listen: hand-offs land, no rushed or clipped word, numbers read as a person says them, no list of three",
  },
  {
    id: "thumb.hook",
    area: "thumbnail",
    points: 0.5,
    auto: true,
    ask: `hook is ${PACING.hook.join("-")} words and comes from the story the picture shows`,
  },
  {
    id: "thumb.small",
    area: "thumbnail",
    points: 1,
    ask: "at 320 px wide the hook and the figure read, and one thing leads",
  },
  {
    id: "thumb.claim",
    area: "thumbnail",
    points: 0.5,
    ask: "the hook states a fact (a name, a number, an action), not a topic label",
  },
];

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const words = (t) =>
  String(t ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** { id: [] } for a pass, { id: [reasons] } for a fail, for each automatic row. */
export function autoChecks(dir, motion) {
  const script = read(join(dir, "script.json"));
  const edition = read(join(dir, "edition.json"));
  const timeline = read(join(dir, "timeline.json"));
  const inVideo = new Set(script.stories.map((s) => s.rank));
  const ed = {
    ...edition,
    stories: edition.stories.filter((s) => inVideo.has(s.rank)),
  };
  const pacing = pacingProblems(script);
  const hookWords = words(script.thumb?.hook).length;
  const [min, max] = PACING.hook;
  return {
    "style.motion": motion
      ? motion.issues
          .filter((f) => f.type === "dead_stop" || f.type === "frozen")
          .map((f) => `${f.type} at f ${f.frame}`)
      : ["no motion report given (--motion)"],
    "content.facts": validateScript(script, ed),
    "vo.pacing": pacing.filter((p) => !p.startsWith("thumb.hook")),
    "vo.length": [
      ...(timeline.voice === false ? ["rendered without voice"] : []),
      ...(timeline.total > 90 ? [`${timeline.total}s is over 90 s`] : []),
    ],
    "thumb.hook": [
      ...(hookWords < min || hookWords > max
        ? [`hook has ${hookWords} words`]
        : []),
      ...(coverStory(script) !== thumbStory(script)
        ? [
            "the thumb story has no picture, so the cover shows another story's kicker",
          ]
        : []),
    ],
  };
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const dir = resolve(argv[0] ?? "");
  const motion = flag("--motion") ? read(flag("--motion")) : null;
  const auto = autoChecks(dir, motion);
  const rows = RUBRIC.map((r) => {
    if (!r.auto) return { ...r, result: "judge" };
    const why = auto[r.id];
    return { ...r, result: why.length ? "FAIL" : "PASS", why };
  });
  for (const r of rows)
    console.log(
      `${r.result.padEnd(5)} ${String(r.points).padEnd(4)} ${r.id.padEnd(14)} ${r.ask}${r.why?.length ? `\n      ${r.why.join("\n      ")}` : ""}`
    );
  const earned = rows
    .filter((r) => r.result === "PASS")
    .reduce((a, r) => a + r.points, 0);
  const open = rows
    .filter((r) => r.result === "judge")
    .reduce((a, r) => a + r.points, 0);
  console.log(
    `automatic: ${earned} earned; ${open} to judge by watching; ships at 8 or more of 10`
  );
  if (flag("--json"))
    writeFileSync(flag("--json"), JSON.stringify(rows, null, 2));
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) main();
