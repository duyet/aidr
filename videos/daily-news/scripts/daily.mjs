#!/usr/bin/env node
// Run an edition end to end once script.json is written: check it, voice, build, lint, snapshot, and
// (with --render) render both formats at 4K.
// Usage: node scripts/daily.mjs <date> [--render]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HF = ["--yes", "hyperframes@0.8.96"];
const date = process.argv[2];
if (!date) throw new Error("usage: daily.mjs <date> [--render]");
const dir = join(ROOT, "editions", date);
const node = (script, ...args) =>
  execFileSync(
    process.execPath,
    [join(ROOT, "scripts", script), date, ...args],
    { stdio: "inherit" }
  );
const hf = (cwd, ...args) =>
  execFileSync("npx", [...HF, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

// 1. The script must be finished: no TODO left, no draft-only fields.
const raw = readFileSync(join(dir, "script.json"), "utf8");
const todo = raw
  .split("\n")
  .filter((l) => l.includes("TODO") || l.includes('"_bullet"'));
if (todo.length) {
  console.error(`✗ script.json is still a draft:\n${todo.join("\n")}`);
  process.exit(1);
}

// 2. Voice (cached per sentence), 3. build.
const auth = (() => {
  try {
    return hf(ROOT, "auth", "status");
  } catch (e) {
    return e.stdout ?? "";
  }
})();
if (!/valid/.test(auth))
  console.warn(
    "! HeyGen sign-in looks expired: run `npx hyperframes auth login` if voicing fails"
  );
node("voice.mjs");
node("build.mjs");

// 4. Lint and snapshot both formats.
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const timeline = JSON.parse(readFileSync(join(dir, "timeline.json"), "utf8"));
const at = [
  0,
  ...timeline.segments
    .filter((s) => s.id.startsWith("s"))
    .map((s) => (s.start + s.dur * 0.7).toFixed(1)),
  (timeline.total - 1).toFixed(1),
].join(",");
for (const fmt of Object.keys(config.formats)) {
  const cwd = join(dir, "out", fmt);
  const lint = hf(cwd, "lint");
  const errors = Number(lint.match(/(\d+) error/)?.[1] ?? 0);
  console.log(`${errors ? "✗" : "✓"} lint ${fmt}: ${errors} error(s)`);
  if (errors) {
    console.error(lint);
    process.exit(1);
  }
  hf(
    cwd,
    "snapshot",
    "--at",
    at,
    "--no-end",
    "--describe",
    "false",
    "-o",
    `../../snap-${fmt}`
  );
  console.log(`✓ editions/${date}/snap-${fmt}/contact-sheet.jpg`);
}

// 5. Render.
if (process.argv.includes("--render")) node("render.mjs");
else
  console.log(
    "Look at both contact sheets, then: node scripts/daily.mjs <date> --render (or scripts/render.mjs <date>)"
  );
