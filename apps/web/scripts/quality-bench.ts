#!/usr/bin/env tsx
/**
 * Offline feed-quality benchmark: one composite score (0..100) from a frozen
 * production snapshot plus hand-labelled gold sets, computed through the real
 * worker code (trending, entity extraction, keyword prefilter, source
 * diversity) so a change in those modules moves the score.
 *
 * Usage (from apps/web):
 *   pnpm bench [--snapshot <file>] [--out <file.json>]
 *   pnpm bench --compare <before.json> <after.json>
 *
 * Fixtures and labelling rules: scripts/fixtures/quality-bench/README.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capSourceShare } from "../src/lib/feed-queries";
import {
  familyCapFor,
  pickDiverse,
  sourceFamily,
} from "../worker/source-diversity";
import { isAiRelatedTitle } from "../worker/sources/keywords";
import {
  collectTrendingCandidates,
  extractTitleEntities,
  rankTrendingWithGrowth,
  trendingKey,
} from "../worker/topic-learning";

interface SnapshotItem {
  id: string;
  source_id: string;
  title: string;
  status: "published" | "merged" | "rejected";
  llm_importance: number | null;
  tags: string[];
  rank_score: number | null;
  published_at: number;
  source_count: number;
}

interface Snapshot {
  now: number;
  items: SnapshotItem[];
}

interface GoldTrending {
  entities: { name: string; aliases: string[] }[];
  junk: string[];
}

interface GoldEntities {
  titles: {
    title: string;
    entities: string[];
    aliases?: Record<string, string[]>;
    labs: string[];
  }[];
}

interface GoldKeyword {
  titles: { title: string; ai: boolean }[];
}

interface ImportanceEvalItem {
  id: string;
  expectedBand: [number, number];
}

interface Failure {
  kind: string;
  detail: string;
}

interface MetricResult {
  score: number;
  values: Record<string, number>;
  failures: Failure[];
}

interface BenchResult {
  snapshot: string;
  composite: number;
  metrics: Record<string, MetricResult>;
  info: Record<string, unknown>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, "fixtures/quality-bench");
const DAY = 86_400;

/** Composite weights (sum 100). Importance is stored LLM output, so no
 * code change in this repo moves it; it gets the smallest weight. */
const WEIGHTS: Record<string, number> = {
  trending: 30,
  entities: 25,
  keyword: 20,
  diversity: 15,
  importance: 10,
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const ratio = (a: number, b: number, empty = 0) => (b === 0 ? empty : a / b);

function byRank(items: SnapshotItem[]): SnapshotItem[] {
  return [...items].sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
}

function publishedBetween(snap: Snapshot, from: number, to: number) {
  return byRank(
    snap.items.filter(
      (it) =>
        it.status === "published" &&
        it.published_at >= from &&
        it.published_at < to
    )
  );
}

/** Mirrors `getFeed`: share cap, then trending over the last 24h. Yesterday's
 * counts come from the 24-48h items here; production reads `topic_daily`. */
function trendingMetric(snap: Snapshot, gold: GoldTrending): MetricResult {
  const toCandidates = (items: SnapshotItem[]) =>
    items.map((it) => ({
      title: it.title,
      tags: it.tags,
      published_at: it.published_at,
      sourceCount: it.source_count,
    }));
  const today = capSourceShare(
    publishedBetween(snap, snap.now - DAY, snap.now + 1).map((it) => ({
      ...it,
      rank_score: it.rank_score ?? 0,
    }))
  );
  const yesterday = publishedBetween(snap, snap.now - 2 * DAY, snap.now - DAY);
  const { counts, displayByKey, entityKeys } = collectTrendingCandidates(
    toCandidates(today),
    snap.now - DAY
  );
  const { counts: yesterdayCounts } = collectTrendingCandidates(
    toCandidates(yesterday),
    snap.now - 2 * DAY
  );
  const chips = rankTrendingWithGrowth(counts, yesterdayCounts, {
    entityKeys,
  }).map(({ tag, count }) => ({ tag: displayByKey.get(tag) ?? tag, count }));

  const goldOf = (chip: string) => {
    const key = trendingKey(chip);
    return gold.entities.find(
      (g) => trendingKey(g.name) === key || g.aliases.includes(key)
    );
  };
  const junk = new Set(gold.junk);
  const top10 = chips.slice(0, 10);
  const hits10 = top10.filter((c) => goldOf(c.tag)).length;
  const covered = new Set(
    chips.map((c) => goldOf(c.tag)?.name).filter(Boolean)
  );
  const junkChips = chips.filter((c) => junk.has(trendingKey(c.tag)));

  const precision = ratio(hits10, top10.length);
  const recall = ratio(covered.size, gold.entities.length);
  const junkRate = ratio(junkChips.length, chips.length);
  const failures: Failure[] = [
    ...junkChips.map((c) => ({
      kind: "trending junk chip",
      detail: `${c.tag} (count ${c.count})`,
    })),
    ...top10
      .filter((c) => !goldOf(c.tag) && !junk.has(trendingKey(c.tag)))
      .map((c) => ({
        kind: "trending non-gold chip in top 10",
        detail: `${c.tag} (count ${c.count})`,
      })),
    ...gold.entities
      .filter((g) => !covered.has(g.name))
      .map((g) => ({ kind: "trending missed gold", detail: g.name })),
  ];
  return {
    score: 0.45 * precision + 0.35 * recall + 0.2 * (1 - junkRate),
    values: {
      precision_at_10: precision,
      recall,
      junk_rate: junkRate,
      chips: chips.length,
    },
    failures,
  };
}

/** Exact trendingKey match against the gold name or an alias; a gold key
 * that only a shorter extraction prefixes counts as partial (still a miss). */
function entityMetric(gold: GoldEntities): MetricResult {
  let goldTotal = 0;
  let matched = 0;
  let partial = 0;
  let extractedTotal = 0;
  let extractedCorrect = 0;
  const failures: Failure[] = [];
  for (const row of gold.titles) {
    const extracted = extractTitleEntities(row.title).map(trendingKey);
    const keysFor = (name: string) => [
      trendingKey(name),
      ...(row.aliases?.[name] ?? []),
    ];
    const allGold = row.entities.flatMap(keysFor);
    extractedTotal += extracted.length;
    for (const key of extracted) {
      if (allGold.includes(key)) extractedCorrect++;
      else
        failures.push({
          kind: "entity false extraction",
          detail: `${key} ← "${row.title}"`,
        });
    }
    for (const name of row.entities) {
      goldTotal++;
      const keys = keysFor(name);
      if (extracted.some((k) => keys.includes(k))) {
        matched++;
        continue;
      }
      const isPartial = extracted.some((k) =>
        keys.some((g) => g.startsWith(`${k}-`))
      );
      if (isPartial) partial++;
      failures.push({
        kind: isPartial ? "entity partial" : "entity missed",
        detail: `${name} ← "${row.title}"`,
      });
    }
  }
  const recall = ratio(matched, goldTotal);
  const precision = ratio(extractedCorrect, extractedTotal, 1);
  return {
    score: 0.7 * recall + 0.3 * precision,
    values: {
      recall,
      precision,
      partial_rate: ratio(partial, goldTotal),
      gold: goldTotal,
    },
    failures,
  };
}

/** F2 (recall-weighted): a prefilter miss drops a real story for good. */
function keywordMetric(gold: GoldKeyword): MetricResult {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const failures: Failure[] = [];
  for (const { title, ai } of gold.titles) {
    const predicted = isAiRelatedTitle(title);
    if (predicted && ai) tp++;
    else if (predicted && !ai) {
      fp++;
      failures.push({ kind: "keyword false positive", detail: title });
    } else if (!predicted && ai) {
      fn++;
      failures.push({ kind: "keyword missed AI title", detail: title });
    }
  }
  const recall = ratio(tp, tp + fn);
  const precision = ratio(tp, tp + fp, 1);
  const f2 = ratio(5 * precision * recall, 4 * precision + recall);
  return { score: f2, values: { recall, precision, f2 }, failures };
}

function topFamilyShare(rows: SnapshotItem[]) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const f = sourceFamily(r.source_id);
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const [family, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [
    "",
    0,
  ];
  return {
    family,
    share: ratio(n, rows.length),
    families: counts.size,
    counts,
  };
}

/** TL;DR-style pick over the 24h window by rank. Score: share under the
 * family cap `pickDiverse` targets, and family coverage, for the top 16 and top 50. */
function diversityMetric(snap: Snapshot): MetricResult {
  const pool = publishedBetween(snap, snap.now - DAY, snap.now + 1);
  const raw = topFamilyShare(pool);
  const values: Record<string, number> = {};
  const failures: Failure[] = [];
  const parts: number[] = [];
  for (const limit of [16, 50]) {
    const picked = pickDiverse(pool, { limit });
    const top = topFamilyShare(picked);
    const cap = familyCapFor(limit) / limit;
    const capScore = top.share <= cap ? 1 : cap / top.share;
    const coverage = ratio(top.families, Math.min(limit, raw.families));
    values[`top${limit}_family_share`] = top.share;
    values[`top${limit}_families`] = top.families;
    parts.push(0.5 * capScore + 0.5 * coverage);
    if (top.share > cap)
      failures.push({
        kind: "diversity over cap",
        detail: `top ${limit}: ${top.family} holds ${round(top.share * 100, 1)}%`,
      });
  }
  values.raw_top_family_share = raw.share;
  if (raw.share > 0.3)
    failures.push({
      kind: "diversity raw flood",
      detail: `${raw.family} is ${round(raw.share * 100, 1)}% of 24h published (${raw.counts.get(raw.family)}/${pool.length})`,
    });
  return {
    score: parts.reduce((a, b) => a + b, 0) / parts.length,
    values,
    failures,
  };
}

/** Normalised entropy of importance (1..10) among published rows, plus
 * agreement with importance-eval bands for the ids the snapshot carries. */
function importanceMetric(
  snap: Snapshot,
  evalItems: ImportanceEvalItem[]
): MetricResult {
  const scores = snap.items
    .filter((it) => it.status === "published" && it.llm_importance != null)
    .map((it) => Math.round(it.llm_importance as number));
  const hist = new Map<number, number>();
  for (const s of scores) hist.set(s, (hist.get(s) ?? 0) + 1);
  let entropy = 0;
  for (const n of hist.values()) {
    const p = n / scores.length;
    entropy -= p * Math.log(p);
  }
  const spread = ratio(entropy, Math.log(10));

  const byId = new Map(snap.items.map((it) => [it.id, it]));
  let overlap = 0;
  let inBand = 0;
  const failures: Failure[] = [];
  for (const e of evalItems) {
    const it = byId.get(e.id);
    if (it?.llm_importance == null) continue;
    overlap++;
    const [lo, hi] = e.expectedBand;
    if (it.llm_importance >= lo && it.llm_importance <= hi) inBand++;
    else
      failures.push({
        kind: "importance outside band",
        detail: `${it.llm_importance} not in [${lo},${hi}] ← "${it.title}"`,
      });
  }
  const agreement = ratio(inBand, overlap);
  return {
    score: 0.5 * spread + 0.5 * agreement,
    values: { spread_entropy: spread, band_agreement: agreement, overlap },
    failures,
  };
}

function statusRates(snap: Snapshot) {
  const total = snap.items.length;
  const count = (s: string) =>
    snap.items.filter((it) => it.status === s).length;
  return {
    rows: total,
    merged_rate: round(ratio(count("merged"), total)),
    rejected_rate: round(ratio(count("rejected"), total)),
    note: "snapshot rows are sampled; rates describe the fixture, not prod",
  };
}

function runBench(snapshotPath: string): BenchResult {
  const snap = readJson<Snapshot>(snapshotPath);
  const metrics: Record<string, MetricResult> = {
    trending: trendingMetric(
      snap,
      readJson(path.join(fixtureDir, "gold-trending.json"))
    ),
    entities: entityMetric(
      readJson(path.join(fixtureDir, "gold-entities.json"))
    ),
    keyword: keywordMetric(
      readJson(path.join(fixtureDir, "gold-keyword.json"))
    ),
    diversity: diversityMetric(snap),
    importance: importanceMetric(
      snap,
      readJson(path.join(here, "fixtures/importance-eval.json"))
    ),
  };
  let composite = 0;
  for (const [name, m] of Object.entries(metrics)) {
    m.score = round(m.score);
    for (const k of Object.keys(m.values)) m.values[k] = round(m.values[k]);
    composite += (WEIGHTS[name] ?? 0) * m.score;
  }
  return {
    snapshot: path.relative(process.cwd(), snapshotPath),
    composite: round(composite, 1),
    metrics,
    info: statusRates(snap),
  };
}

function printResult(r: BenchResult) {
  console.log(`\nquality-bench  ${r.snapshot}\n`);
  console.log("metric       weight  score  values");
  for (const [name, m] of Object.entries(r.metrics)) {
    const vals = Object.entries(m.values)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(
      `${name.padEnd(12)} ${String(WEIGHTS[name]).padStart(6)}  ${m.score.toFixed(3)}  ${vals}`
    );
  }
  console.log(`\nCOMPOSITE ${r.composite} / 100`);
  console.log(`info: ${JSON.stringify(r.info)}`);
  console.log("\nfailures (first 5 per metric):");
  for (const [name, m] of Object.entries(r.metrics)) {
    for (const f of m.failures.slice(0, 5))
      console.log(`  [${name}] ${f.kind}: ${f.detail}`);
    if (m.failures.length > 5)
      console.log(`  [${name}] … ${m.failures.length - 5} more`);
  }
}

function compare(aPath: string, bPath: string) {
  const a = readJson<BenchResult>(aPath);
  const b = readJson<BenchResult>(bPath);
  const delta = (x: number, y: number) =>
    `${y - x >= 0 ? "+" : ""}${round(y - x)}`;
  console.log("metric       before  after   delta");
  for (const name of Object.keys(WEIGHTS)) {
    const x = a.metrics[name];
    const y = b.metrics[name];
    if (!x || !y) continue;
    console.log(
      `${name.padEnd(12)} ${x.score.toFixed(3)}   ${y.score.toFixed(3)}   ${delta(x.score, y.score)}`
    );
    for (const k of Object.keys(y.values)) {
      if (x.values[k] !== y.values[k])
        console.log(
          `  ${k}: ${x.values[k]} → ${y.values[k]} (${delta(x.values[k] ?? 0, y.values[k])})`
        );
    }
  }
  console.log(
    `\nCOMPOSITE ${a.composite} → ${b.composite} (${delta(a.composite, b.composite)})`
  );
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const cmpIdx = args.indexOf("--compare");
  if (cmpIdx >= 0) {
    const [a, b] = args.slice(cmpIdx + 1, cmpIdx + 3);
    if (!a || !b) throw new Error("--compare needs <before.json> <after.json>");
    compare(a, b);
    return;
  }
  const snapshot = path.resolve(
    flag("--snapshot") ?? path.join(fixtureDir, "snapshot.json")
  );
  const result = runBench(snapshot);
  printResult(result);
  const out = flag("--out");
  if (out) {
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nwrote ${out}`);
  }
}

main();
