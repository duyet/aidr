#!/usr/bin/env node
/**
 * Repeatable Core Web Vitals measurement. Issue #229.
 *
 * A single Lighthouse run is noise, so this runs it N times (default 3) on
 * mobile with default throttling and prints the median of the numbers the
 * issue tracks: LCP, LCP element render delay, CLS, TBT.
 *
 *   pnpm --filter @aidr/web run perf:lighthouse
 *   pnpm --filter @aidr/web run perf:lighthouse -- https://aidr.today/?lang=en --runs 5
 *
 * Needs Chrome/Chromium (set CHROME_PATH if it is not on the default path).
 * Lighthouse is fetched with `npx`, not added as a dependency.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).filter((a) => a !== "--");
const runsFlag = args.indexOf("--runs");
const runs = runsFlag >= 0 ? Number(args[runsFlag + 1]) : 3;
const url =
  args.find((a, i) => !a.startsWith("--") && i !== runsFlag + 1) ??
  "https://aidr.today/?lang=vi";

if (!Number.isInteger(runs) || runs < 1) {
  console.error("--runs must be a positive integer");
  process.exit(2);
}

type Audits = Record<
  string,
  {
    numericValue?: number;
    details?: {
      items?: Array<{ items?: Array<{ subpart?: string; duration?: number }> }>;
    };
  }
>;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function renderDelay(audits: Audits): number {
  const tables = audits["lcp-breakdown-insight"]?.details?.items ?? [];
  for (const table of tables) {
    for (const row of table.items ?? []) {
      if (row.subpart === "elementRenderDelay")
        return row.duration ?? Number.NaN;
    }
  }
  return Number.NaN;
}

const samples: Array<Record<string, number>> = [];
for (let i = 0; i < runs; i++) {
  const res = spawnSync(
    "npx",
    [
      "--yes",
      "lighthouse",
      url,
      "--output=json",
      "--quiet",
      "--form-factor=mobile",
      "--only-categories=performance",
      "--chrome-flags=--headless=new --no-sandbox",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (res.status !== 0) {
    console.error(res.stderr || `lighthouse exited ${res.status}`);
    process.exit(1);
  }
  const audits = (JSON.parse(res.stdout) as { audits: Audits }).audits;
  const sample = {
    lcpMs: audits["largest-contentful-paint"]?.numericValue ?? Number.NaN,
    lcpRenderDelayMs: renderDelay(audits),
    cls: audits["cumulative-layout-shift"]?.numericValue ?? Number.NaN,
    tbtMs: audits["total-blocking-time"]?.numericValue ?? Number.NaN,
  };
  samples.push(sample);
  console.log(`run ${i + 1}/${runs}`, sample);
}

console.log(`\nmedian of ${runs} runs for ${url}`);
for (const key of Object.keys(samples[0])) {
  const digits = key === "cls" ? 3 : 0;
  console.log(
    `  ${key}: ${median(samples.map((s) => s[key])).toFixed(digits)}`
  );
}
