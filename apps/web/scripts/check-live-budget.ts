#!/usr/bin/env node
/**
 * Live latency budget check for #147. Fetches each public surface N times in
 * sequence against a deployed origin, twice: once on the normal edge-cache
 * path and once "cold" with a unique query string, which is a new cache key
 * and so reaches the Worker and D1. It compares p50 and p95 of total time
 * (headers plus full body) and body size with the budgets below.
 *
 *   pnpm --filter @aidr/web run check:live-budget
 *   pnpm --filter @aidr/web run check:live-budget -- --origin https://aidr.today --samples 20
 *   pnpm --filter @aidr/web run check:live-budget -- --report   # print only, never fail
 *
 * Not part of the PR checks: it needs the network and a deployed Worker. It
 * runs from `.github/workflows/live-budget.yml` (schedule or manual). Budgets
 * are documented in docs/decisions/performance-budgets.md; change both together.
 */

const DEFAULT_ORIGIN = "https://aidr.today";
const DEFAULT_SAMPLES = 20;

interface Surface {
  name: string;
  path: string;
  /** Edge-cache path: median and 95th percentile, in ms. */
  p50Ms: number;
  p95Ms: number;
  /** Cache bypassed (unique query string): median and 95th percentile, in ms. */
  coldP50Ms: number;
  coldP95Ms: number;
  /** Largest body allowed, in bytes. */
  maxBytes: number;
  /** Substring the body must contain, so an error page cannot pass. */
  mustContain: string;
}

// Story used for the media page and the .md alternate. Any published story with
// a media manifest works; override with --story <id8> if it ages out.
const DEFAULT_STORY = "15523a41";

export function surfaces(story: string): Surface[] {
  return [
    {
      name: "subscribe preview",
      path: "/api/subscribe/preview?lang=en",
      p50Ms: 300,
      p95Ms: 1000,
      coldP50Ms: 1500,
      coldP95Ms: 5000,
      maxBytes: 60_000,
      mustContain: "<html",
    },
    {
      name: "llms.txt",
      path: "/llms.txt",
      p50Ms: 300,
      p95Ms: 1000,
      coldP50Ms: 500,
      coldP95Ms: 1000,
      maxBytes: 20_000,
      mustContain: "AI;DR",
    },
    {
      name: "story markdown",
      path: `/api/story/${story}.md?lang=en`,
      p50Ms: 300,
      p95Ms: 1000,
      coldP50Ms: 500,
      coldP95Ms: 1000,
      maxBytes: 30_000,
      mustContain: "aidr-story-markdown",
    },
    {
      name: "sitemap index",
      path: "/sitemap.xml",
      p50Ms: 300,
      p95Ms: 1000,
      coldP50Ms: 500,
      coldP95Ms: 1000,
      maxBytes: 10_000,
      mustContain: "<sitemapindex",
    },
    {
      name: "public digest json",
      path: "/api/public?lang=en",
      p50Ms: 300,
      p95Ms: 1000,
      coldP50Ms: 700,
      coldP95Ms: 1500,
      maxBytes: 250_000,
      mustContain: '"tldr"',
    },
    {
      name: "story page (media)",
      path: `/${story}?lang=en`,
      p50Ms: 400,
      p95Ms: 1200,
      coldP50Ms: 1000,
      coldP95Ms: 8000,
      maxBytes: 400_000,
      mustContain: "<html",
    },
  ];
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

interface Result {
  p50: number;
  p95: number;
  bytes: number;
  cache: string;
  failures: string[];
}

async function sample(url: string, surface: Surface) {
  const start = performance.now();
  const res = await fetch(url, {
    headers: { "user-agent": "aidr-live-budget" },
  });
  const body = await res.text();
  const ms = performance.now() - start;
  const problems: string[] = [];
  if (res.status !== 200) problems.push(`status ${res.status}`);
  else if (!body.includes(surface.mustContain))
    problems.push(`body missing "${surface.mustContain}"`);
  return {
    ms,
    bytes: new TextEncoder().encode(body).length,
    cache: res.headers.get("cf-cache-status") ?? "none",
    problems,
  };
}

async function measure(
  origin: string,
  surface: Surface,
  samples: number,
  cold: boolean
): Promise<Result> {
  const budget50 = cold ? surface.coldP50Ms : surface.p50Ms;
  const budget95 = cold ? surface.coldP95Ms : surface.p95Ms;
  const times: number[] = [];
  const failures = new Set<string>();
  let bytes = 0;
  const cache: Record<string, number> = {};
  for (let i = 0; i < samples; i++) {
    // A unique query string is a new cache key, so it reaches the Worker.
    const bust = cold
      ? `${surface.path.includes("?") ? "&" : "?"}_budget=${Date.now()}${i}`
      : "";
    const s = await sample(origin + surface.path + bust, surface);
    times.push(s.ms);
    bytes = Math.max(bytes, s.bytes);
    cache[s.cache] = (cache[s.cache] ?? 0) + 1;
    for (const p of s.problems) failures.add(p);
  }
  times.sort((a, b) => a - b);
  const p50 = percentile(times, 50);
  const p95 = percentile(times, 95);
  if (p50 > budget50) failures.add(`p50 ${p50.toFixed(0)} ms > ${budget50} ms`);
  if (p95 > budget95) failures.add(`p95 ${p95.toFixed(0)} ms > ${budget95} ms`);
  if (bytes > surface.maxBytes)
    failures.add(`size ${bytes} B > ${surface.maxBytes} B`);
  const cacheLabel = Object.entries(cache)
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  return { p50, p95, bytes, cache: cacheLabel, failures: [...failures] };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const origin = (arg("--origin") ?? DEFAULT_ORIGIN).replace(/\/$/, "");
  const samples = Number(arg("--samples") ?? DEFAULT_SAMPLES);
  const story = arg("--story") ?? DEFAULT_STORY;
  const reportOnly = process.argv.includes("--report");

  console.log(`origin ${origin}, ${samples} samples each\n`);
  console.log(
    "surface | path | p50 ms | p95 ms | bytes | cf-cache-status | result"
  );
  let failed = false;
  for (const surface of surfaces(story)) {
    for (const cold of [false, true]) {
      const r = await measure(origin, surface, samples, cold);
      const verdict = r.failures.length
        ? `FAIL (${r.failures.join("; ")})`
        : "ok";
      if (r.failures.length) failed = true;
      console.log(
        `${surface.name} | ${cold ? "cold" : "edge"} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.bytes} | ${r.cache} | ${verdict}`
      );
    }
  }
  if (failed && !reportOnly) {
    console.error("\nOver budget. See docs/decisions/performance-budgets.md.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
