#!/usr/bin/env node
// Render an edition at 4K: both formats to MP4, and both cover stills to PNG.
// Writes editions/<date>/renders/ (ignored by git). Renders run one at a time (4K Chrome is heavy).
// Usage: node scripts/render.mjs 2026-10-02 [--only 9x16] [--quality draft]
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HF = ["--yes", "hyperframes@0.8.96"];
const date = process.argv[2];
if (!date)
  throw new Error("usage: render.mjs <date> [--only fmt] [--quality q]");
const arg = (n) =>
  process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null;
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const dir = join(ROOT, "editions", date);
const renders = join(dir, "renders");
mkdirSync(renders, { recursive: true });

for (const [fmt, f] of Object.entries(config.formats)) {
  if (arg("--only") && arg("--only") !== fmt) continue;
  const cover = join(dir, "out", `cover-${fmt}`);
  const seq = join(dir, "out", `cover-${fmt}-frames`);
  rmSync(seq, { recursive: true, force: true });
  execFileSync(
    "npx",
    [
      ...HF,
      "render",
      "--resolution",
      f.resolution,
      "--format",
      "png-sequence",
      "--fps",
      "1",
      "--output",
      seq,
    ],
    { cwd: cover, stdio: "inherit" }
  );
  const png = readdirSync(seq)
    .filter((n) => n.endsWith(".png"))
    .sort()[0];
  copyFileSync(join(seq, png), join(renders, `cover-${date}-${fmt}.png`));

  const out = join(renders, `aidr-daily-${date}-${fmt}-4k.mp4`);
  execFileSync(
    "npx",
    [
      ...HF,
      "render",
      "--resolution",
      f.resolution,
      "--quality",
      arg("--quality") ?? "high",
      "--fps",
      String(config.fps),
      "--output",
      out,
    ],
    {
      cwd: join(dir, "out", fmt),
      stdio: "inherit",
    }
  );
  console.log(`✓ ${out}`);
}
