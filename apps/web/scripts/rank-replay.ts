#!/usr/bin/env tsx
/**
 * Read-only ranking replay: recompute rank at hourly `now` values over the
 * last N days of published items for several named formulas and print
 * comparable metrics. Nothing is written anywhere.
 *
 * Usage (from repo root):
 *   pnpm --filter @aidr/web rank-replay [--days 14] [--cache <file>] [--refresh]
 *     [--formulas production,base,base+K1,...] [--gold <file>] [--json]
 *     [--gold-candidates]
 *
 * Data comes from production D1 (SELECT only): published items, items
 * merged into them, reader vote nets and the `tldr_snapshots` rows.
 * `cf d1 query` is tried first; when the token gets a 403 the same SELECT
 * runs through `wrangler d1 execute --remote`. `--cache` stores the fetched
 * rows so formula experiments rerun without touching D1.
 *
 * Formulas. `production` calls `rankScore` itself, so it is the live code.
 * `base` is the formula in production on 2026-10-16, frozen here with its
 * own constants. Lever patches (`E1`, `K1`, `R`, `B75`, ...) stack on
 * `base` with `+`. On startup the script asserts that `base` plus
 * `PRODUCTION_LEVERS` equals `rankScore` on every live item at every
 * replay hour, so a change to `worker/ranking.ts` that this file does not
 * describe fails loudly instead of skewing the table. The older `current`
 * knob set (pre-2026-10-11) and its `V*`/`D`/`I`/`B`/`Q` patches are kept
 * for the record.
 *
 * KNOWN BIAS. Points, comments and vote nets are their final values, not the
 * values at each replayed hour, so every hour sees engagement the item had
 * not yet earned and a freshly published HN story looks as hot as it ended
 * up. TL;DR snapshots are read at their latest edit, and they were picked
 * by the formula live at the time, which favours it. A velocity rule
 * (N outlets within M hours) cannot be validated here for the same reason.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  hasReaderEngagement,
  rankScore,
  rankSignals,
  STORY_KIND_WEIGHTS,
  sourceBoost,
} from "../worker/ranking";
import { findSourceSpec } from "../worker/sources/catalog";
import { cf, D1_DATABASE_ID, d1ResultRows, wranglerSelect } from "./cf-d1";

const ACCOUNT_ID = "7df185a18b98382c3240fa7ac4a37075";

/** Points a story needed before its source fetched it at all (HN's
 *  `popularMinPoints`, 20 since migration 0069); 0 without a floor. The
 *  `E1` lever counts engagement above it. Rejected 2026-10-16: it moved
 *  no rise/fall share and raised duplicate slots in the top 30. */
function admissionFloor(sourceId: string): number {
  const floor = findSourceSpec(sourceId)?.config.popularMinPoints;
  return typeof floor === "number" && Number.isFinite(floor) && floor > 0
    ? floor
    : 0;
}

/** Headline words for the `R` drama lever: legal action, regulators,
 *  departures, leaks, breaches, backlash. Rejected 2026-10-16: 57 of the
 *  102 headlines it matched in 14 days were drama (gold set), under the
 *  85% bar. A narrower list (lawsuit, sues, subpoena, antitrust, fired,
 *  ousted, resigns, steps down, quits, leak, feud, whistleblower, accuses,
 *  boycott, scandal) was 21 of 24, too few to ship on. */
const DRAMA_RE =
  /\b(lawsuit|sues?|sued|suing|subpoena\w*|antitrust|probes?|investigat(?:es|ed|ion)|fires?d?|fired|ousts?|ousted|resigns?|resignation|steps? down|quits?|leak(?:s|ed)?|feud|backlash|boycott|scandal|whistleblower|fraud|breach(?:es|ed)?|hack(?:s|ed|ers?)?|ban(?:s|ned)?|revok\w+|accus\w+|alleg\w+|rogue|deleted? (?:the |its |a )?(?:production )?database|wiped)\b/i;

function storyKind(title: string): "drama" | "other" {
  return DRAMA_RE.test(title) ? "drama" : "other";
}
const RANK_WINDOW_HOURS = 72;
const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GOLD = path.join(here, "fixtures/rank-kinds/gold.json");

interface ReplayItem {
  id: string;
  title: string;
  sourceId: string;
  url: string;
  category: string;
  tags: string[];
  publishedAt: number;
  importance: number;
  quality: number;
  points: number;
  comments: number;
  voteNet: number;
  sourceCount: number;
  readerSourced: boolean;
  /** Points the cluster's reader source needed to be fetched at all. */
  engagementFloor: number;
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
  engagementFloor: number;
  category: string;
  title: string;
  tags: string[];
}

type Formula = (input: FormulaInput) => number;

// ---- pre-2026-10-11 knob formulas (kept for the record) -----------------

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

// ---- 2026-10-16 production formula and story-kind levers ---------------

/** How reader engagement enters the crowd factor.
 *  `raw`: 1 + log10(1 + points + 0.5·comments), the 2026-10-16 formula.
 *  `floor`: the same with points counted above the source's admission
 *  floor, so 20 HN points (the floor) read as none.
 *  `damped`: raw with the log weighted by `engagementWeight`. */
type EngagementMode = "raw" | "floor" | "damped";

interface Levers {
  engagement: EngagementMode;
  engagementWeight: number;
  /** `product`: min(engagement × sourceBoost, cap). `max`: the larger of
   *  the two, both already ≥ 1, so one loud thread and many outlets land
   *  on one scale instead of multiplying. */
  crowd: "product" | "max";
  /** Multiplier per category; a category not listed gets 1. */
  kindWeights: Readonly<Record<string, number>>;
  /** Multiplier for a headline `storyKind` reads as drama; 1 disables. */
  drama: number;
  breakingImportance: number;
  /** A story whose category weighs above 1 earns the breaking boost from
   *  this importance instead. `null` disables. */
  breakingRiseImportance: number | null;
}

/** The constants `worker/ranking.ts` carried on 2026-10-16, inline so the
 *  baseline survives edits to that file. */
const FROZEN = {
  importanceExponent: 1.5,
  decayHours: 36,
  rampStartHours: 24,
  rampHours: 24,
  engagementCap: 3.25,
  lowImportance: 4,
  lowImportanceCap: 1.3,
  breakingBoost: 0.4,
  breakingHours: 3,
  voteGain: 0.2,
  voteCap: 6,
  sourceWeight: 0.12,
  sourceCap: 8,
};

const BASE_LEVERS: Levers = {
  engagement: "raw",
  engagementWeight: 1,
  crowd: "product",
  kindWeights: {},
  drama: 1,
  breakingImportance: 8,
  breakingRiseImportance: null,
};

/** The first table (PR #917 head 8155e75c): Models, Open Source,
 *  Research, Chips, Tools, Agents and Frameworks carry the "new model /
 *  more tech" ask; Industry and Funding carry the markets, HR, ads and
 *  analyst pieces the owner wants lower. Literal, like every table here,
 *  so a retune of `STORY_KIND_WEIGHTS` cannot move a measured row. */
const KIND_MILD: Record<string, number> = {
  Models: 1.2,
  "Open Source": 1.15,
  Research: 1.1,
  Chips: 1.1,
  Tools: 1.1,
  Agents: 1.1,
  Frameworks: 1.05,
  Regulation: 1.05,
  Products: 1,
  Infra: 1,
  Releases: 1,
  Data: 1,
  Industry: 0.9,
  Funding: 0.85,
};

/** `KIND_MILD` with government action (Regulation) and agent incidents
 *  (Agents) lifted, so breaking and drama stories keep their top-10 share
 *  while the model and tech stories rise. What `STORY_KIND_WEIGHTS` ships. */
const KIND_BREAKING: Record<string, number> = {
  ...KIND_MILD,
  Regulation: 1.2,
  Agents: 1.15,
};

const KIND_STRONG: Record<string, number> = {
  Models: 1.35,
  "Open Source": 1.25,
  Research: 1.15,
  Chips: 1.2,
  Tools: 1.15,
  Agents: 1.15,
  Frameworks: 1.1,
  Regulation: 1.1,
  Industry: 0.85,
  Funding: 0.75,
};

const LEVER_PATCHES: Record<string, Partial<Levers>> = {
  E1: { engagement: "floor" },
  E2: { engagement: "damped", engagementWeight: 0.6 },
  E3: { crowd: "max" },
  K1: { kindWeights: KIND_MILD },
  K2: { kindWeights: KIND_STRONG },
  K3: { kindWeights: { ...KIND_MILD, Industry: 0.85, Funding: 0.8 } },
  K4: { kindWeights: KIND_BREAKING },
  K5: { kindWeights: { ...KIND_MILD, Industry: 1 } },
  K6: { kindWeights: { ...KIND_MILD, Regulation: 1.1 } },
  K7: { kindWeights: { ...KIND_BREAKING, Agents: 1.2, Models: 1.25 } },
  R: { drama: 1.2 },
  B75: { breakingImportance: 7.5 },
  BK: { breakingRiseImportance: 7 },
};

/** The lever set `worker/ranking.ts` implements today. Update it in the
 *  same commit as the formula, or the startup check fails. */
export const PRODUCTION_LEVERS = "base+K4";

function clamp10(value: number): number {
  return Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 0;
}

function buildLevers(levers: Levers): Formula {
  return (i) => {
    const age = Math.max(0, (i.now - i.publishedAt) / 3_600_000);
    const importance = clamp10(i.importance);
    const qualityFactor = 0.6 + 0.4 * (clamp10(i.quality) / 10);
    let decay = Math.exp(-age / FROZEN.decayHours);
    if (age > FROZEN.rampStartHours) {
      decay *= Math.exp(-(age - FROZEN.rampStartHours) / FROZEN.rampHours);
    }
    const points =
      levers.engagement === "floor"
        ? Math.max(0, i.points - i.engagementFloor)
        : i.points;
    const signal = points + 0.5 * i.comments;
    const weight = levers.engagement === "damped" ? levers.engagementWeight : 1;
    let engagement =
      Number.isFinite(signal) && signal >= 0
        ? 1 + weight * Math.log10(1 + signal)
        : 1;
    if (importance < FROZEN.lowImportance) {
      engagement = Math.min(engagement, FROZEN.lowImportanceCap);
    }
    const extra = Math.min(Math.max(i.sourceCount, 1), FROZEN.sourceCap) - 1;
    const boost = 1 + FROZEN.sourceWeight * extra;
    const crowd = Math.min(
      levers.crowd === "max" ? Math.max(engagement, boost) : engagement * boost,
      FROZEN.engagementCap
    );
    const steps =
      FROZEN.voteGain * Math.min(FROZEN.voteCap, Math.abs(i.voteNet));
    const votes = i.voteNet >= 0 ? 1 + steps : 1 / (1 + steps);
    const weighted =
      importance ** FROZEN.importanceExponent /
      10 ** (FROZEN.importanceExponent - 1);
    const kindWeight = Object.hasOwn(levers.kindWeights, i.category)
      ? levers.kindWeights[i.category]
      : 1;
    const drama =
      levers.drama !== 1 && storyKind(i.title) === "drama" ? levers.drama : 1;
    const breakingFrom =
      levers.breakingRiseImportance !== null && kindWeight > 1
        ? Math.min(levers.breakingImportance, levers.breakingRiseImportance)
        : levers.breakingImportance;
    const breaking =
      importance >= breakingFrom
        ? 1 + FROZEN.breakingBoost * Math.exp(-age / FROZEN.breakingHours)
        : 1;
    return (
      weighted *
      qualityFactor *
      decay *
      crowd *
      votes *
      kindWeight *
      drama *
      breaking
    );
  };
}

/** `production` (live `rankScore`), `current` (pre-2026-10-11 knobs), `base`
 *  (2026-10-16 formula), or a base joined with patches by `+` (`V3+D+B`,
 *  `base+E1+K1`). A lever patch on `base` and a knob patch on `current`
 *  never mix. */
export function formulaFromName(name: string): Formula | undefined {
  if (name === "production") return productionFormula;
  if (name === "current") return build(BASE);
  const parts = name.split("+");
  if (parts[0] === "base") {
    const levers = leversFromName(name);
    return levers && buildLevers(levers);
  }
  const knobs = { ...BASE };
  for (const part of parts) {
    const patch = PATCHES[part];
    if (!patch) return undefined;
    Object.assign(knobs, patch);
  }
  return build(knobs);
}

function leversFromName(name: string): Levers | undefined {
  const [head, ...patches] = name.split("+");
  if (head !== "base") return undefined;
  const levers = { ...BASE_LEVERS };
  for (const part of patches) {
    const patch = LEVER_PATCHES[part];
    if (!patch) return undefined;
    Object.assign(levers, patch);
  }
  return levers;
}

const productionFormula: Formula = (i) =>
  rankScore({
    importance: i.importance,
    quality: i.quality,
    points: i.points,
    comments: i.comments,
    publishedAt: i.publishedAt,
    now: i.now,
    sourceCount: i.sourceCount,
    voteNet: i.voteNet,
    category: i.category,
  });

// ---- data ---------------------------------------------------------------

interface RawData {
  fetchedAt: number;
  items: Array<Record<string, unknown>>;
  merged: Array<Record<string, unknown>>;
  votes: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
}

let useWrangler = false;

function query(sql: string): Array<Record<string, unknown>> {
  if (!useWrangler) {
    try {
      const out = cf(["d1", "query", D1_DATABASE_ID, "--sql", sql]);
      const rows = d1ResultRows(out);
      return Array.isArray(rows)
        ? (rows as Array<Record<string, unknown>>)
        : [];
    } catch (error) {
      console.error(
        `rank-replay: cf d1 query failed (${String(error).slice(0, 120)}); using wrangler d1 execute`
      );
      useWrangler = true;
    }
  }
  return wranglerSelect(sql);
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
        `SELECT id, title, source_id, url, category, tags, published_at, points, comments, llm_importance, llm_quality FROM items WHERE status = 'published' AND published_at >= ${from} AND published_at < ${to}`
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

/** `admissionFloor` of the reader source whose points `rankSignals` took. */
function engagementFloorOf(
  cluster: ReadonlyArray<{ sourceId: string; points: number }>
): number {
  let best: { sourceId: string; points: number } | undefined;
  for (const m of cluster) {
    if (!hasReaderEngagement(m.sourceId)) continue;
    if (!best || m.points >= best.points) best = m;
  }
  return best ? admissionFloor(best.sourceId) : 0;
}

function parseTags(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
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
      category: String(row.category ?? ""),
      tags: parseTags(row.tags),
      publishedAt: Number(row.published_at) * 1000,
      importance: Number(row.llm_importance ?? 5),
      quality: Number(row.llm_quality ?? 5),
      points: signals.points,
      comments: signals.comments,
      sourceCount: signals.sourceCount,
      voteNet: votes.get(id) ?? 0,
      readerSourced: cluster.some((m) => hasReaderEngagement(m.sourceId)),
      engagementFloor: engagementFloorOf(cluster),
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

// ---- gold set -----------------------------------------------------------

export type GoldLabel = "rise" | "fall" | "neutral";

interface GoldRow {
  id: string;
  title: string;
  label: GoldLabel;
  kind: string;
}

interface GoldFile {
  rules: unknown;
  items: GoldRow[];
}

function loadGold(file: string): Map<string, GoldRow> {
  if (!existsSync(file)) return new Map();
  const parsed = JSON.parse(readFileSync(file, "utf-8")) as GoldFile;
  return new Map(parsed.items.map((row) => [row.id, row]));
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
  top10OverlapVsBase: number;
  maxMoveOneVote: number;
  p99MoveOneVote: number;
  fiveVotesReachTop5: number;
  /** Gold-set shares; NaN when no gold item was live. */
  riseTop10: number;
  riseTop30: number;
  fallTop10: number;
  /** Mean over gold `rise` items of the best 1-based position they reach. */
  meanBestRise: number;
  /** `riseTop10` split by the gold row's `kind`, and the story-hours behind
   *  each share (slots summed over replay hours). */
  riseTop10ByKind: Record<string, { share: number; slots: number }>;
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
    engagementFloor: item.engagementFloor,
    category: item.category,
    title: item.title,
    tags: item.tags,
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
  baseTop10: Map<number, Set<string>>,
  gold: Map<string, GoldRow>
): Metrics {
  const overlap: number[] = [];
  const dups: number[] = [];
  const medAges: number[] = [];
  const stale: number[] = [];
  const overlapVsBase: number[] = [];
  const moves: number[] = [];
  const reach5: number[] = [];
  const rise10: number[] = [];
  const rise30: number[] = [];
  const fall10: number[] = [];
  const riseSlotsByKind = new Map<string, number>();
  const bestRise = new Map<string, number>();
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
    const reference = baseTop10.get(now);
    if (reference) {
      let hit = 0;
      for (const id of ids) if (reference.has(id)) hit++;
      overlapVsBase.push(hit / 10);
    }
    for (const p of top10) {
      if (p.item.importance >= 8 && !firstTop10.has(p.item.id)) {
        firstTop10.set(p.item.id, now);
      }
    }
    if (gold.size) {
      const label = (p: Prepared) => gold.get(p.item.id)?.label;
      rise10.push(top10.filter((p) => label(p) === "rise").length / 10);
      for (const p of top10) {
        const row = gold.get(p.item.id);
        if (row?.label !== "rise") continue;
        riseSlotsByKind.set(row.kind, (riseSlotsByKind.get(row.kind) ?? 0) + 1);
      }
      fall10.push(top10.filter((p) => label(p) === "fall").length / 10);
      rise30.push(top30.filter((p) => label(p) === "rise").length / 30);
      ordered.forEach((p, index) => {
        if (label(p) !== "rise") return;
        const best = bestRise.get(p.item.id);
        if (best === undefined || index + 1 < best) {
          bestRise.set(p.item.id, index + 1);
        }
      });
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
    top10OverlapVsBase: mean(overlapVsBase),
    maxMoveOneVote: moves.length ? moves[moves.length - 1] : 0,
    p99MoveOneVote: moves.length
      ? moves[Math.floor(0.99 * (moves.length - 1))]
      : 0,
    fiveVotesReachTop5: mean(reach5),
    riseTop10: mean(rise10),
    riseTop30: mean(rise30),
    fallTop10: mean(fall10),
    meanBestRise: mean([...bestRise.values()]),
    riseTop10ByKind: Object.fromEntries(
      [...riseSlotsByKind].map(([kind, slots]) => [
        kind,
        { share: slots / (10 * rise10.length), slots },
      ])
    ),
  };
}

/** `base` plus `PRODUCTION_LEVERS` must be `rankScore`, item for item, and
 *  its kind table must be `STORY_KIND_WEIGHTS` key for key (the item check
 *  misses a category no cached item carries). */
function checkProductionMatches(prepared: Prepared[], hours: number[]): void {
  const levers = leversFromName(PRODUCTION_LEVERS);
  if (!levers)
    throw new Error(`unknown PRODUCTION_LEVERS ${PRODUCTION_LEVERS}`);
  if (!isDeepStrictEqual({ ...STORY_KIND_WEIGHTS }, levers.kindWeights)) {
    throw new Error(
      `rank-replay: STORY_KIND_WEIGHTS differs from the "${PRODUCTION_LEVERS}" table; add the new table as a patch, measure it, and point PRODUCTION_LEVERS at it`
    );
  }
  const described = buildLevers(levers);
  let worst = 0;
  let checked = 0;
  for (const now of hours) {
    for (const p of prepared) {
      const age = now - p.item.publishedAt;
      if (age < 0 || age > RANK_WINDOW_HOURS * 3_600_000) continue;
      const input = toInput(p.item, now);
      worst = Math.max(
        worst,
        Math.abs(described(input) - productionFormula(input))
      );
      checked++;
    }
  }
  if (worst > 1e-9) {
    throw new Error(
      `rank-replay: "${PRODUCTION_LEVERS}" differs from rankScore by up to ${worst}; update PRODUCTION_LEVERS or the lever formula`
    );
  }
  console.error(
    `rank-replay: "${PRODUCTION_LEVERS}" equals rankScore on ${checked} item-hours (max |diff| ${worst.toExponential(1)})`
  );
}

// ---- cli ----------------------------------------------------------------

interface Args {
  days: number;
  cache?: string;
  refresh: boolean;
  formulas?: string[];
  json: boolean;
  gold: string;
  goldCandidates: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    days: 14,
    refresh: false,
    json: false,
    gold: DEFAULT_GOLD,
    goldCandidates: false,
  };
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
    else if (a === "--gold") args.gold = argv[++i];
    else if (a === "--gold-candidates") args.goldCandidates = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

/** The stories a gold set must cover: each replay day's top 40 under `base`
 *  at 12:00 UTC, every story with importance ≥ 8, and every headline
 *  `storyKind` reads as drama (so its precision can be measured). One JSON line each,
 *  unlabelled, for a human to label from the title. */
function printGoldCandidates(prepared: Prepared[], hours: number[]): void {
  const base = buildLevers(BASE_LEVERS);
  const picked = new Map<string, ReplayItem>();
  for (const now of hours) {
    if (new Date(now).getUTCHours() !== 12) continue;
    for (const p of rankAt(base, prepared, now).ordered.slice(0, 40)) {
      picked.set(p.item.id, p.item);
    }
  }
  for (const p of prepared) {
    if (p.item.importance >= 8 || storyKind(p.item.title) === "drama") {
      picked.set(p.item.id, p.item);
    }
  }
  for (const item of picked.values()) {
    console.log(
      JSON.stringify({
        id: item.id,
        title: item.title,
        category: item.category,
        importance: item.importance,
      })
    );
  }
}

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

  if (args.goldCandidates) {
    printGoldCandidates(prepared, hours);
    return;
  }
  checkProductionMatches(prepared, hours);
  const gold = loadGold(args.gold);

  const names = args.formulas ?? [
    "base",
    ...Object.keys(LEVER_PATCHES).map((p) => `base+${p}`),
    "production",
  ];
  const baseTop10 = new Map<number, Set<string>>();
  const base = buildLevers(BASE_LEVERS);
  for (const now of hours) {
    const { ordered } = rankAt(base, prepared, now);
    baseTop10.set(now, new Set(ordered.slice(0, 10).map((p) => p.item.id)));
  }
  const results: Record<string, Metrics> = {};
  for (const name of names) {
    const formula = formulaFromName(name);
    if (!formula) throw new Error(`unknown formula ${name}`);
    results[name] = evaluate(
      formula,
      prepared,
      hours,
      snapshots,
      baseTop10,
      gold
    );
  }

  const votedItems = items.filter((i) => i.voteNet !== 0).length;
  const labelled = items.filter((i) => gold.has(i.id)).length;
  console.error(
    `rank-replay: ${items.length} items, ${votedItems} with votes, ${labelled} gold-labelled, ${snapshots.size} snapshots, ${hours.length} hourly steps over ${args.days}d. Final engagement values: see the bias note in this file.`
  );
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  const cols: Array<[string, (m: Metrics) => string]> = [
    ["rise@10", (m) => m.riseTop10.toFixed(3)],
    ["rise@30", (m) => m.riseTop30.toFixed(3)],
    ["fall@10", (m) => m.fallTop10.toFixed(3)],
    ["bestRise", (m) => m.meanBestRise.toFixed(1)],
    ["tldr@8", (m) => m.tldrOverlapTop8.toFixed(3)],
    ["dup/30", (m) => m.dupSlotsTop30.toFixed(2)],
    ["medAge", (m) => m.medianAgeTop30.toFixed(1)],
    [">36h", (m) => m.over36hTop30.toFixed(2)],
    ["brk_h", (m) => m.breakingMedianHoursToTop10?.toFixed(1) ?? "-"],
    ["brk%", (m) => (100 * m.breakingReachedTop10).toFixed(0)],
    ["top10~base", (m) => m.top10OverlapVsBase.toFixed(3)],
    ["1vote_max", (m) => String(m.maxMoveOneVote)],
    ["1vote_p99", (m) => String(m.p99MoveOneVote)],
    ["5v->top5", (m) => m.fiveVotesReachTop5.toFixed(2)],
  ];
  const width = Math.max(...names.map((n) => n.length), 10);
  console.log(
    ["formula".padEnd(width), ...cols.map(([h]) => h.padStart(10))].join(" ")
  );
  for (const name of names) {
    console.log(
      [
        name.padEnd(width),
        ...cols.map(([, f]) => f(results[name]).padStart(10)),
      ].join(" ")
    );
  }
  const kinds = [
    ...new Set(
      [...gold.values()].filter((g) => g.label === "rise").map((g) => g.kind)
    ),
  ].sort();
  if (kinds.length === 0) return;
  console.log(
    `\nrise@10 by gold kind (share of top-10 slots, story-hours)\n${[
      "formula".padEnd(width),
      ...kinds.map((k) => k.padStart(14)),
    ].join(" ")}`
  );
  for (const name of names) {
    const byKind = results[name].riseTop10ByKind;
    console.log(
      [
        name.padEnd(width),
        ...kinds.map((k) => {
          const cell = byKind[k] ?? { share: 0, slots: 0 };
          return `${cell.share.toFixed(3)} ${String(cell.slots).padStart(4)}`.padStart(
            14
          );
        }),
      ].join(" ")
    );
  }
}

if (process.argv[1]?.endsWith("rank-replay.ts")) main();
