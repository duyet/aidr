#!/usr/bin/env tsx
/**
 * Read-only ranking replay: recompute rank at hourly `now` values over the
 * last N days of published items for several named formulas and print
 * comparable metrics. Nothing is written anywhere.
 *
 * Usage (from repo root):
 *   pnpm --filter @aidr/web rank-replay [--days 14] [--cache <file>] [--refresh]
 *     [--formulas current,V,D,...] [--json]
 *
 * Data comes from production D1 through `cf d1 query` (SELECT only):
 * published items, items merged into them, reader vote nets and the
 * `tldr_snapshots` rows. `--cache` stores the fetched rows so formula
 * experiments rerun without touching D1.
 *
 * KNOWN BIAS. Points, comments and vote nets are their final values, not the
 * values at each replayed hour, so every hour sees engagement the item had
 * not yet earned and a freshly published HN story looks as hot as it ended
 * up. TL;DR snapshots are read at their latest edit, and they were picked
 * by the formula live at the time (usually `current`), which favours it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  hasReaderEngagement,
  rankScore,
  rankSignals,
  sourceBoost,
} from "../worker/ranking";
import { cf, D1_DATABASE_ID, d1ResultRows } from "./cf-d1";

const ACCOUNT_ID = "7df185a18b98382c3240fa7ac4a37075";
const RANK_WINDOW_HOURS = 72;

interface ReplayItem {
  id: string;
  title: string;
  sourceId: string;
  url: string;
  publishedAt: number;
  importance: number;
  quality: number;
  points: number;
  comments: number;
  voteNet: number;
  sourceCount: number;
  readerSourced: boolean;
}

/** What a formula sees: `rankScore` inputs plus whether a reader source
 *  (HN, Lobsters) is in the cluster. `now` and `publishedAt` are ms. */
export interface FormulaInput {
  importance: number;
  quality: number;
  points: number;
  comments: number;
  publishedAt: number;
  now: number;
  sourceCount: number;
  voteNet: number;
  readerSourced: boolean;
}

type Formula = (input: FormulaInput) => number;

// ---- formulas -----------------------------------------------------------

interface Knobs {
  voteWeight: number;
  voteCap: number;
  voteFactor?: { gain: number; cap: number };
  decayRamp: boolean;
  engagementCap: number;
  importancePower: number;
  lowImportanceEngagementCap: boolean;
  breaking: boolean;
  readerQualityFloor: number;
}

/** The formula in production before this change, frozen as the baseline. */
const BASE: Knobs = {
  voteWeight: 10,
  voteCap: Number.POSITIVE_INFINITY,
  decayRamp: false,
  engagementCap: Number.POSITIVE_INFINITY,
  importancePower: 1,
  lowImportanceEngagementCap: false,
  breaking: false,
  readerQualityFloor: 0,
};

function build(knobs: Knobs): Formula {
  return (i) => {
    const age = Math.max(0, (i.now - i.publishedAt) / 3_600_000);
    const quality = i.readerSourced
      ? Math.max(i.quality, knobs.readerQualityFloor)
      : i.quality;
    const qualityFactor = 0.6 + 0.4 * (quality / 10);
    let decay = Math.exp(-age / 36);
    if (knobs.decayRamp && age > 24) decay *= Math.exp(-(age - 24) / 24);
    const votes = Math.max(
      -knobs.voteCap,
      Math.min(knobs.voteCap, knobs.voteWeight * i.voteNet)
    );
    const signal = i.points + votes + 0.5 * i.comments;
    let engagement =
      signal >= 0
        ? 1 + Math.log10(1 + signal)
        : 1 / (1 + Math.log10(1 - signal));
    if (knobs.lowImportanceEngagementCap && i.importance < 4) {
      engagement = Math.min(engagement, 1.3);
    }
    let boosted = engagement * sourceBoost(i.sourceCount);
    boosted = Math.min(boosted, knobs.engagementCap);
    if (knobs.voteFactor) {
      const { gain, cap } = knobs.voteFactor;
      const steps = gain * Math.min(cap, Math.abs(i.voteNet));
      boosted *= i.voteNet >= 0 ? 1 + steps : 1 / (1 + steps);
    }
    const importance =
      knobs.importancePower === 1
        ? i.importance
        : i.importance ** knobs.importancePower /
          10 ** (knobs.importancePower - 1);
    const breaking =
      knobs.breaking && i.importance >= 8 ? 1 + 0.4 * Math.exp(-age / 3) : 1;
    return importance * qualityFactor * decay * boosted * breaking;
  };
}

const PATCHES: Record<string, Partial<Knobs>> = {
  V1: { voteWeight: 5, voteCap: 30 },
  V2: { voteWeight: 5, voteCap: 20 },
  V3: { voteWeight: 0, voteFactor: { gain: 0.12, cap: 8 } },
  V4: { voteWeight: 0, voteFactor: { gain: 0.2, cap: 5 } },
  V5: { voteWeight: 0, voteFactor: { gain: 0.3, cap: 5 } },
  V6: { voteWeight: 0, voteFactor: { gain: 0.15, cap: 8 } },
  V7: { voteWeight: 0, voteFactor: { gain: 0.25, cap: 4 } },
  V8: { voteWeight: 0, voteFactor: { gain: 0.18, cap: 8 } },
  V9: { voteWeight: 0, voteFactor: { gain: 0.2, cap: 6 } },
  D: { decayRamp: true, engagementCap: 3.25 },
  I: { importancePower: 1.5, lowImportanceEngagementCap: true },
  B: { breaking: true },
  Q: { readerQualityFloor: 4 },
};

/** `current`, a patch name (`D`), or patches joined with `+` (`V3+D+B`). */
export function formulaFromName(name: string): Formula | undefined {
  if (name === "current") return build(BASE);
  const knobs = { ...BASE };
  for (const part of name.split("+")) {
    const patch = PATCHES[part];
    if (!patch) return undefined;
    Object.assign(knobs, patch);
  }
  return build(knobs);
}

// ---- data ---------------------------------------------------------------

interface RawData {
  fetchedAt: number;
  items: Array<Record<string, unknown>>;
  merged: Array<Record<string, unknown>>;
  votes: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
}

function query(sql: string): Array<Record<string, unknown>> {
  const out = cf(["d1", "query", D1_DATABASE_ID, "--sql", sql]);
  const rows = d1ResultRows(out);
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function fetchRaw(days: number): RawData {
  process.env.CLOUDFLARE_ACCOUNT_ID ??= ACCOUNT_ID;
  const since = Math.floor(Date.now() / 1000) - (days + 3) * 86_400;
  const items: Array<Record<string, unknown>> = [];
  const merged: Array<Record<string, unknown>> = [];
  for (let day = 0; day < days + 3; day++) {
    const from = since + day * 86_400;
    const to = from + 86_400;
    items.push(
      ...query(
        `SELECT id, title, source_id, url, published_at, points, comments, llm_importance, llm_quality FROM items WHERE status = 'published' AND published_at >= ${from} AND published_at < ${to}`
      )
    );
    merged.push(
      ...query(
        `SELECT duplicate_of, source_id, points, comments, url FROM items WHERE status = 'merged' AND published_at >= ${from - 86_400} AND published_at < ${to + 86_400}`
      )
    );
  }
  const votes = query(
    "SELECT item_id, SUM(value) AS vote_net FROM item_votes GROUP BY item_id"
  );
  const snapshots = query(
    `SELECT date, bullets_en FROM tldr_snapshots WHERE date >= date('now', '-${days + 4} day')`
  );
  return { fetchedAt: Date.now(), items, merged, votes, snapshots };
}

function loadRaw(args: Args): RawData {
  const cache = args.cache;
  if (cache && !args.refresh && existsSync(cache)) {
    return JSON.parse(readFileSync(cache, "utf-8")) as RawData;
  }
  const raw = fetchRaw(args.days);
  if (cache) writeFileSync(cache, JSON.stringify(raw));
  return raw;
}

function buildItems(raw: RawData): ReplayItem[] {
  const votes = new Map(
    raw.votes.map((v) => [String(v.item_id), Number(v.vote_net ?? 0)])
  );
  const members = new Map<string, Array<Record<string, unknown>>>();
  for (const m of raw.merged) {
    const key = String(m.duplicate_of);
    const list = members.get(key) ?? [];
    list.push(m);
    members.set(key, list);
  }
  return raw.items.map((row) => {
    const id = String(row.id);
    const cluster = [row, ...(members.get(id) ?? [])].map((m) => ({
      sourceId: String(m.source_id),
      points: Number(m.points ?? 0),
      comments: Number(m.comments ?? 0),
      url: m.url ? String(m.url) : undefined,
    }));
    const signals = rankSignals(cluster);
    return {
      id,
      title: String(row.title ?? ""),
      sourceId: String(row.source_id),
      url: String(row.url ?? ""),
      publishedAt: Number(row.published_at) * 1000,
      importance: Number(row.llm_importance ?? 5),
      quality: Number(row.llm_quality ?? 5),
      points: signals.points,
      comments: signals.comments,
      sourceCount: signals.sourceCount,
      voteNet: votes.get(id) ?? 0,
      readerSourced: cluster.some((m) => hasReaderEngagement(m.sourceId)),
    };
  });
}

/** ICT calendar day (`tldr_snapshots.date`) of an epoch-ms instant. */
function ictDate(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

function snapshotIds(raw: RawData): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const row of raw.snapshots) {
    const ids = new Set<string>();
    try {
      const bullets = JSON.parse(String(row.bullets_en ?? "[]")) as Array<{
        item_ids?: string[];
      }>;
      for (const b of bullets) for (const id of b.item_ids ?? []) ids.add(id);
    } catch {
      continue;
    }
    out.set(String(row.date), ids);
  }
  return out;
}

// ---- duplicate-event heuristic -----------------------------------------

const STOP = new Set(
  "a an the of to in on for and or with as at by from is are was be its it this that new how why what after over into out up about via vs says say will can could more than not you your our we i".split(
    " "
  )
);

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t))
  );
}

function entities(title: string): Set<string> {
  const out = new Set<string>();
  const words = title.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const w = words[i].replace(/[^\p{L}\p{N}]/gu, "");
    if (w.length >= 3 && /^[\p{Lu}]/u.test(w)) out.add(w.toLowerCase());
  }
  return out;
}

function sameEvent(a: Prepared, b: Prepared): boolean {
  let inter = 0;
  for (const t of a.tokens) if (b.tokens.has(t)) inter++;
  const jaccard = inter / (a.tokens.size + b.tokens.size - inter || 1);
  if (jaccard >= 0.5) return true;
  let sharedEntities = 0;
  for (const e of a.entities) if (b.entities.has(e)) sharedEntities++;
  return sharedEntities >= 2 && jaccard >= 0.2;
}

interface Prepared {
  item: ReplayItem;
  tokens: Set<string>;
  entities: Set<string>;
}

function duplicateSlots(top: Prepared[]): number {
  const parent = top.map((_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    return root;
  };
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      if (sameEvent(top[i], top[j])) parent[find(j)] = find(i);
    }
  }
  const roots = new Set(top.map((_, i) => find(i)));
  return top.length - roots.size;
}

// ---- metrics ------------------------------------------------------------

export interface Metrics {
  tldrOverlapTop8: number;
  dupSlotsTop30: number;
  medianAgeTop30: number;
  over36hTop30: number;
  breakingMedianHoursToTop10: number | null;
  breakingReachedTop10: number;
  top10OverlapVsCurrent: number;
  maxMoveOneVote: number;
  p99MoveOneVote: number;
  fiveVotesReachTop5: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;

function toInput(item: ReplayItem, now: number): FormulaInput {
  return {
    importance: item.importance,
    quality: item.quality,
    points: item.points,
    comments: item.comments,
    publishedAt: item.publishedAt,
    now,
    sourceCount: item.sourceCount,
    voteNet: item.voteNet,
    readerSourced: item.readerSourced,
  };
}

function rankAt(
  formula: Formula,
  pool: Prepared[],
  now: number
): { ordered: Prepared[]; scores: Map<string, number> } {
  const live = pool.filter(
    (p) =>
      p.item.publishedAt <= now &&
      now - p.item.publishedAt <= RANK_WINDOW_HOURS * 3_600_000
  );
  const scores = new Map(
    live.map((p) => [p.item.id, formula(toInput(p.item, now))])
  );
  const ordered = [...live].sort(
    (a, b) => (scores.get(b.item.id) ?? 0) - (scores.get(a.item.id) ?? 0)
  );
  return { ordered, scores };
}

/** Positions item `target` moves when its vote net changes by `delta`. */
function positionMove(
  formula: Formula,
  ordered: Prepared[],
  scores: Map<string, number>,
  target: Prepared,
  now: number,
  delta: number
): { before: number; after: number } {
  const own = scores.get(target.item.id) ?? 0;
  const next = formula({
    ...toInput(target.item, now),
    voteNet: target.item.voteNet + delta,
  });
  let before = 0;
  let after = 0;
  for (const other of ordered) {
    if (other === target) continue;
    const s = scores.get(other.item.id) ?? 0;
    if (s > own) before++;
    if (s > next) after++;
  }
  return { before, after };
}

export function evaluate(
  formula: Formula,
  prepared: Prepared[],
  hours: number[],
  snapshots: Map<string, Set<string>>,
  currentTop10: Map<number, Set<string>>
): Metrics {
  const overlap: number[] = [];
  const dups: number[] = [];
  const medAges: number[] = [];
  const stale: number[] = [];
  const overlapVsCurrent: number[] = [];
  const moves: number[] = [];
  const reach5: number[] = [];
  const firstTop10 = new Map<string, number>();

  for (const now of hours) {
    const { ordered, scores } = rankAt(formula, prepared, now);
    if (ordered.length < 10) continue;
    const snap = snapshots.get(ictDate(now));
    if (snap?.size) {
      const hit = ordered.slice(0, 8).filter((p) => snap.has(p.item.id)).length;
      overlap.push(hit / 8);
    }
    const top30 = ordered.slice(0, 30);
    dups.push(duplicateSlots(top30));
    const ages = top30.map((p) => (now - p.item.publishedAt) / 3_600_000);
    medAges.push(median(ages));
    stale.push(ages.filter((a) => a > 36).length);

    const top10 = ordered.slice(0, 10);
    const ids = new Set(top10.map((p) => p.item.id));
    const reference = currentTop10.get(now);
    if (reference) {
      let hit = 0;
      for (const id of ids) if (reference.has(id)) hit++;
      overlapVsCurrent.push(hit / 10);
    }
    for (const p of top10) {
      if (p.item.importance >= 8 && !firstTop10.has(p.item.id)) {
        firstTop10.set(p.item.id, now);
      }
    }

    if (((now / 3_600_000) | 0) % 3 === 0) {
      for (const p of ordered.slice(0, 40)) {
        for (const delta of [1, -1]) {
          const { before, after } = positionMove(
            formula,
            ordered,
            scores,
            p,
            now,
            delta
          );
          if (Math.min(before, after) < 10) {
            moves.push(Math.abs(before - after));
          }
        }
      }
      const candidates = ordered
        .slice(0, 30)
        .filter(
          (p) =>
            p.item.importance >= 6 &&
            p.item.voteNet === 0 &&
            now - p.item.publishedAt <= 12 * 3_600_000
        );
      for (const p of candidates) {
        const { after } = positionMove(formula, ordered, scores, p, now, 5);
        reach5.push(after < 5 ? 1 : 0);
      }
    }
  }

  const breaking = prepared.filter(
    (p) => p.item.importance >= 8 && hours.some((h) => h >= p.item.publishedAt)
  );
  const wait: number[] = [];
  let reached = 0;
  for (const p of breaking) {
    const first = firstTop10.get(p.item.id);
    if (first === undefined) continue;
    reached++;
    wait.push((first - p.item.publishedAt) / 3_600_000);
  }
  moves.sort((a, b) => a - b);
  return {
    tldrOverlapTop8: mean(overlap),
    dupSlotsTop30: mean(dups),
    medianAgeTop30: mean(medAges),
    over36hTop30: mean(stale),
    breakingMedianHoursToTop10: wait.length ? median(wait) : null,
    breakingReachedTop10: breaking.length ? reached / breaking.length : 0,
    top10OverlapVsCurrent: mean(overlapVsCurrent),
    maxMoveOneVote: moves.length ? moves[moves.length - 1] : 0,
    p99MoveOneVote: moves.length
      ? moves[Math.floor(0.99 * (moves.length - 1))]
      : 0,
    fiveVotesReachTop5: mean(reach5),
  };
}

// ---- cli ----------------------------------------------------------------

interface Args {
  days: number;
  cache?: string;
  refresh: boolean;
  formulas?: string[];
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { days: 14, refresh: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") {
      args.days = Number(argv[++i]);
      if (!Number.isInteger(args.days) || args.days < 1)
        throw new Error("--days must be a positive integer");
    } else if (a === "--cache") args.cache = argv[++i];
    else if (a === "--refresh") args.refresh = true;
    else if (a === "--json") args.json = true;
    else if (a === "--formulas") args.formulas = argv[++i].split(",");
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

function formulaByName(name: string): Formula | undefined {
  return name === "final" ? finalFormula : formulaFromName(name);
}

const finalFormula: Formula = (i) =>
  rankScore({
    importance: i.importance,
    quality: i.quality,
    points: i.points,
    comments: i.comments,
    publishedAt: i.publishedAt,
    now: i.now,
    sourceCount: i.sourceCount,
    voteNet: i.voteNet,
  });

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const raw = loadRaw(args);
  const items = buildItems(raw);
  const prepared: Prepared[] = items.map((item) => ({
    item,
    tokens: tokens(item.title),
    entities: entities(item.title),
  }));
  const snapshots = snapshotIds(raw);
  const end = Math.floor(raw.fetchedAt / 3_600_000) * 3_600_000;
  const start = end - args.days * 24 * 3_600_000;
  const hours: number[] = [];
  for (let t = start; t <= end; t += 3_600_000) hours.push(t);

  const names = args.formulas ?? ["current", ...Object.keys(PATCHES), "final"];
  const currentTop10 = new Map<number, Set<string>>();
  for (const now of hours) {
    const { ordered } = rankAt(build(BASE), prepared, now);
    currentTop10.set(now, new Set(ordered.slice(0, 10).map((p) => p.item.id)));
  }
  const results: Record<string, Metrics> = {};
  for (const name of names) {
    const formula = formulaByName(name);
    if (!formula) throw new Error(`unknown formula ${name}`);
    results[name] = evaluate(formula, prepared, hours, snapshots, currentTop10);
  }

  const votedItems = items.filter((i) => i.voteNet !== 0).length;
  console.error(
    `rank-replay: ${items.length} items, ${votedItems} with votes, ${snapshots.size} snapshots, ${hours.length} hourly steps over ${args.days}d. Final engagement values: see the bias note in this file.`
  );
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  const cols: Array<[string, (m: Metrics) => string]> = [
    ["tldr@8", (m) => m.tldrOverlapTop8.toFixed(3)],
    ["dup/30", (m) => m.dupSlotsTop30.toFixed(2)],
    ["medAge", (m) => m.medianAgeTop30.toFixed(1)],
    [">36h", (m) => m.over36hTop30.toFixed(2)],
    ["brk_h", (m) => m.breakingMedianHoursToTop10?.toFixed(1) ?? "-"],
    ["brk%", (m) => (100 * m.breakingReachedTop10).toFixed(0)],
    ["top10~cur", (m) => m.top10OverlapVsCurrent.toFixed(3)],
    ["1vote_max", (m) => String(m.maxMoveOneVote)],
    ["1vote_p99", (m) => String(m.p99MoveOneVote)],
    ["5v->top5", (m) => m.fiveVotesReachTop5.toFixed(2)],
  ];
  const width = Math.max(...names.map((n) => n.length), 8);
  console.log(
    ["formula".padEnd(width), ...cols.map(([h]) => h.padStart(9))].join(" ")
  );
  for (const name of names) {
    console.log(
      [
        name.padEnd(width),
        ...cols.map(([, f]) => f(results[name]).padStart(9)),
      ].join(" ")
    );
  }
}

if (process.argv[1]?.endsWith("rank-replay.ts")) main();
