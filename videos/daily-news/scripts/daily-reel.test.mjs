// node --test videos/daily-news/scripts/*.test.mjs
// .github/workflows/daily-reel.yml: which steps run when one fails, read from the workflow's own `if:` conditions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const workflow = readFileSync(resolve(import.meta.dirname, "../../../.github/workflows/daily-reel.yml"), "utf8");

const steps = workflow
  .split(/^ {4}steps:\n/m)[1]
  .split(/^ {6}- /m)
  .filter(Boolean)
  .map((block) => ({
    name: block.match(/^\s*name: (.+)$/m)?.[1] ?? block.match(/^\s*uses: (.+)$/m)?.[1],
    id: block.match(/^\s*id: (\S+)$/m)?.[1],
    if: block.match(/^\s*if: (.+)$/m)?.[1],
    continueOnError: /^\s*continue-on-error: true$/m.test(block),
    block,
  }));

const STATUS_FN = /\b(always|success|failure|cancelled)\(\)/;

/** GitHub's `if:` for one step: implicit `success() &&` unless the expression calls a status function. */
function condition(expr) {
  const body = (expr ?? "success()").replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  const js = (STATUS_FN.test(body) ? body : `success() && (${body})`)
    .replace(/\bsteps\.(\w+)\.outcome\b/g, 'S("$1").outcome')
    .replace(/\bsteps\.(\w+)\.outputs\.(\w+)\b/g, 'S("$1").outputs.$2')
    .replace(/\benv\.(\w+)\b/g, "E.$1");
  return new Function("S", "E", "always", "success", "failure", "cancelled", `return ${js};`);
}

/** Run the job: each step's outcome by name ("skipped" when its `if:` is false). `fail` names the steps that fail. */
function simulate({ live = true, hand = false, fail = [], cancelled = false } = {}) {
  const byId = new Map();
  const outcomes = new Map();
  let jobFailed = false;
  const S = (id) => byId.get(id) ?? { outcome: "", outputs: {} };
  const E = { LIVE: live ? "true" : "false" };
  for (const step of steps) {
    const runs = condition(step.if)(S, E, () => true, () => !jobFailed, () => jobFailed, () => cancelled);
    const outcome = !runs ? "skipped" : fail.includes(step.name) || step.name.startsWith("Fail when") ? "failure" : "success";
    if (outcome === "failure" && !step.continueOnError) jobFailed = true;
    outcomes.set(step.name, outcome);
    if (step.id) byId.set(step.id, { outcome, outputs: step.id === "check" && hand ? { hand: "true" } : {} });
  }
  return outcomes;
}

const EN_POSTS = ["YouTube upload + day page", "Facebook Reel", "Telegram"];
const VI_POSTS = ["YouTube upload + day page (Vietnamese subtitles)", "Telegram (Vietnamese subtitles)"];
const ran = (outcomes, name) => {
  assert.ok(outcomes.has(name), `no step named ${name}`);
  return outcomes.get(name) !== "skipped";
};

test("a rerun renders cuts already on the day page, so the gate and Telegram have the file", () => {
  const renders = steps.filter((s) => /publish\.mjs .*--steps \S*\brender\b/.test(s.block));
  assert.deepEqual(
    renders.map((s) => s.name),
    ["Render", "Vietnamese subtitles cut"]
  );
  for (const s of renders) assert.match(s.block, /--render-published/, `${s.name} skips a published cut, then its gate fails`);
});

test("a live day posts every channel", () => {
  const o = simulate();
  for (const name of [...EN_POSTS, ...VI_POSTS]) assert.equal(o.get(name), "success", name);
  assert.equal(ran(o, "Fail when the Reel did not post"), false);
  assert.equal(ran(o, "Fail when the Vietnamese subtitles cut did not post"), false);
});

test("the Vietnamese channel still gets its video when an English post fails", () => {
  for (const failed of ["YouTube upload + day page", "Telegram"]) {
    const o = simulate({ fail: [failed] });
    for (const name of VI_POSTS) assert.equal(o.get(name), "success", `${name} after ${failed} failed`);
  }
});

test("a failed YouTube upload still posts the Reel and Telegram, then fails the job naming YouTube", () => {
  const o = simulate({ fail: ["YouTube upload + day page"] });
  assert.equal(o.get("Facebook Reel"), "success");
  assert.equal(o.get("Telegram"), "success");
  assert.equal(o.get("Telegram (Vietnamese subtitles)"), "success");
  assert.equal(ran(o, "Fail when the YouTube upload did not post"), true);
  assert.equal(ran(o, "Fail when the Reel did not post"), false);
});

test("a failed Facebook Reel or Telegram does not stop the other English posts", () => {
  for (const failed of ["Facebook Reel", "Telegram"]) {
    const o = simulate({ fail: [failed] });
    for (const name of EN_POSTS.filter((n) => n !== failed)) assert.equal(o.get(name), "success", `${name} after ${failed} failed`);
  }
});

test("no English post runs when the render or gate fails", () => {
  for (const failed of ["Render", "Gate"]) {
    const o = simulate({ fail: [failed] });
    for (const name of EN_POSTS) assert.equal(ran(o, name), false, `${name} after ${failed} failed`);
  }
});

test("a cancelled run posts nothing", () => {
  const o = simulate({ cancelled: true });
  for (const name of [...EN_POSTS, ...VI_POSTS]) assert.equal(ran(o, name), false, name);
});

test("visub needs the English render", () => {
  const o = simulate({ fail: ["Render"] });
  assert.equal(ran(o, "Vietnamese subtitles cut"), false);
  for (const name of VI_POSTS) assert.equal(ran(o, name), false, name);
});

test("a visub failure never blocks an English post", () => {
  const o = simulate({ fail: ["Vietnamese subtitles cut"] });
  for (const name of EN_POSTS) assert.equal(o.get(name), "success", name);
  for (const name of VI_POSTS) assert.equal(ran(o, name), false, name);
});

test("the log names every channel that failed", () => {
  const o = simulate({ fail: ["Facebook Reel", "Telegram (Vietnamese subtitles)"] });
  assert.equal(ran(o, "Fail when the Vietnamese subtitles cut did not post"), true);
  assert.equal(ran(o, "Fail when the Reel did not post"), true);
});

test("a failed Vietnamese Telegram post fails the job and still saves the day's state", () => {
  const o = simulate({ fail: ["Telegram (Vietnamese subtitles)"] });
  assert.equal(steps.find((s) => s.name === "Telegram (Vietnamese subtitles)").continueOnError, false, "the jobs API would report the failure as success");
  for (const name of EN_POSTS) assert.equal(o.get(name), "success", name);
  for (const name of ["Upload Vietnamese subtitles artifact", "Save STATUS.json", "Fail when the Vietnamese subtitles cut did not post"])
    assert.equal(ran(o, name), true, name);
});

test("a hand-published day posts no Telegram, in either language", () => {
  const o = simulate({ hand: true });
  assert.equal(ran(o, "Telegram"), false);
  assert.equal(ran(o, "Telegram (Vietnamese subtitles)"), false);
  assert.equal(o.get("Facebook Reel"), "success");
});

test("a dry run posts nothing", () => {
  const o = simulate({ live: false });
  for (const name of [...EN_POSTS, ...VI_POSTS]) assert.equal(ran(o, name), false, name);
  assert.equal(o.get("Vietnamese subtitles posting plan (dry run)"), "success");
});
