#!/usr/bin/env tsx
/**
 * Freshness + trending check over live top stories (read-only).
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/freshness-eval.ts --out <dir> [--per-day 9] [--days 3]
 *        [--no-gnews]
 *
 * Reads the public https://aidr.today/api/feed, takes the top `--per-day`
 * stories by rank_score from each of the first `--days` days, and runs
 * `checkFreshness` with HN Algolia, Google News RSS (eval only: its terms
 * are personal use) and, when FIRECRAWL_API_KEY is set, Firecrawl. Writes
 * results.json and results.md to --out. Keyless providers cost $0.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  checkFreshness,
  type FreshnessProviders,
  type FreshnessResult,
  type FreshnessStory,
} from "../worker/freshness/check.js";
import {
  fetchArticleDate,
  searchFirecrawl,
  searchGoogleNews,
  searchHackerNews,
} from "../worker/freshness/providers.js";

interface FeedItem {
  id: string;
  url: string;
  title: string;
  published_at: number;
  rank_score: number;
  sources?: { kind: string; url: string; posted_at: number | null }[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const out = arg("--out");
  if (!out) throw new Error("--out <dir> is required");
  const perDay = Number(arg("--per-day") ?? 9);
  const days = Number(arg("--days") ?? 3);
  const feed = (await (await fetch("https://aidr.today/api/feed")).json()) as {
    days: { date: string; items: FeedItem[] }[];
  };
  const stories: (FreshnessStory & { day: string; rank: number })[] = [];
  for (const day of feed.days.slice(0, days)) {
    const top = [...day.items]
      .sort((a, b) => b.rank_score - a.rank_score)
      .slice(0, perDay);
    for (const it of top)
      stories.push({
        id: it.id,
        title: it.title,
        url: it.url,
        publishedAt: it.published_at,
        sourceUrls: (it.sources ?? [])
          .filter((s) => s.kind === "source")
          .map((s) => ({
            url: s.url,
            postedAt: s.posted_at,
          })),
        day: day.date,
        rank: it.rank_score,
      });
  }

  const search: FreshnessProviders["search"] = [
    { name: "hn", run: (q) => searchHackerNews(q) },
  ];
  if (!process.argv.includes("--no-gnews"))
    search.push({ name: "gnews", run: searchGoogleNews });
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey)
    search.push({
      name: "firecrawl",
      run: (q) => searchFirecrawl(q, firecrawlKey),
    });
  const providers: FreshnessProviders = {
    articleDate: fetchArticleDate,
    search,
  };

  const nowS = Math.floor(Date.now() / 1000);
  const rows: (FreshnessResult & { day: string; title: string })[] = [];
  for (const story of stories) {
    const result = await checkFreshness(story, providers, nowS);
    rows.push({ ...result, day: story.day, title: story.title });
    console.log(
      `${result.verdict.padEnd(14)} trend=${String(result.trendingSources).padStart(2)} ${result.latencyMs}ms ${story.title.slice(0, 70)}`
    );
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, "results.json"),
    `${JSON.stringify({ checkedAt: nowS, providers: search.map((p) => p.name), rows }, null, 2)}\n`
  );
  const iso = (s: number | null) =>
    s === null ? "-" : new Date(s * 1000).toISOString().slice(0, 10);
  const md = [
    "| day | story | verdict | trending | article date | latency ms | evidence |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.day} | ${r.title.slice(0, 80).replace(/\|/g, "/")} | ${r.verdict} | ${r.trendingSources} | ${iso(r.articlePublishedAt)} | ${r.latencyMs} | ${[...r.newerUrls, ...r.evidenceUrls].slice(0, 2).join(" ")} |`
    ),
  ].join("\n");
  writeFileSync(path.join(out, "results.md"), `${md}\n`);
  const lat = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  console.log(
    `n=${rows.length} p50=${lat[Math.floor(lat.length / 2)]}ms p95=${lat[Math.floor(lat.length * 0.95)]}ms cost=$0 (keyless)`
  );
}

await main();
