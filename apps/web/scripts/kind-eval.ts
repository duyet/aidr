#!/usr/bin/env tsx
/**
 * Story-kind eval (#919): can one extra Jev choice question, `kind`, label
 * drama and breaking news precisely enough for a rank factor to key off it?
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/kind-eval.ts freeze --gold <gold.json> --rows <rows.json>
 *   pnpm exec tsx scripts/kind-eval.ts run --split dev|held --variant <v> --cache <dir> [--limit N] [--cap 250] [--pace-ms 3000]
 *   pnpm exec tsx scripts/kind-eval.ts report --split dev|held --variant <v> --cache <dir> [--threshold P]
 *
 * `freeze` builds `fixtures/kind-eval/sample.json` from #917's gold set
 * (`fixtures/rank-kinds/gold.json`) and the same items' D1 rows (`SELECT id,
 * source_id, title, summary, llm_importance, category, fetched_at FROM items
 * WHERE id IN (...)`). `run` sends each item the request production scoring
 * sends (`jevScoreQuestions` with the production arguments) plus `kind`, one
 * call at a time. Variant `control` sends the production questions alone.
 * Answers are cached by a hash of the request body, so a rerun only calls for
 * items or definitions it has not seen. Every attempt is appended to
 * `<cache>/calls.log`; the run refuses to call past `--cap` attempts across
 * all runs and stops at the first 429 (#656). Reads ANYROUTER_LOCAL_API_KEY.
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { requireLlmKey } from "../../../videos/daily-news/scripts/local-llm-key.mjs";
import {
  BUILDER_CATEGORIES,
  CATEGORY_DEFINITIONS,
  CATEGORY_RULE,
  CORE_CATEGORIES,
  SCORE_JEV_TIMEOUT_MS,
} from "../worker/llm";
import {
  callSystemOne,
  JEV_DEFAULT_MODEL,
  jevScoreQuestions,
  type SystemOneAnswer,
  type SystemOneQuestions,
  scoreJudgmentFromJev,
} from "../worker/systemone";
import type { Env } from "../worker/types";

/** TypeSafe rejects a choice question with more than ten options. */
export const KIND_OPTIONS = [
  "release",
  "benchmark",
  "research",
  "product",
  "drama",
  "breaking",
  "policy",
  "business",
  "opinion",
  "other",
] as const;
export type Kind = (typeof KIND_OPTIONS)[number];

/** #917's gold kinds folded onto the options. Its rise and neutral
 * `research` are one option; the label (rise/neutral) is not asked. */
export const GOLD_TO_KIND: Record<string, Kind> = {
  release: "release",
  benchmark: "benchmark",
  research: "research",
  tech: "product",
  product: "product",
  drama: "drama",
  breaking: "breaking",
  policy: "policy",
  funding: "business",
  deal: "business",
  markets: "business",
  hr: "business",
  ads: "business",
  macro: "opinion",
  analyst: "opinion",
  trend: "opinion",
  other: "other",
};

interface KindVariant {
  instructions: string;
  definitions: Record<Kind, string>;
}

/** Option definitions per iteration. A variant is never edited after it
 * has been run: a revision is a new key, so cached answers stay valid. */
export const KIND_VARIANTS: Record<string, KindVariant> = {
  v0: {
    instructions: "Which single kind of story is this?",
    definitions: {
      release:
        "a new model, model version, or open-weights release from an AI lab of any size",
      benchmark:
        "a benchmark result, leaderboard placing, or head-to-head evaluation of models",
      research: "a paper, study, or research finding",
      product:
        "a launch or update of a product, feature, device, developer tool, chip, robot, or platform",
      drama:
        "conflict around AI companies or people: lawsuits, subpoenas, regulators probing a company, firings, resignations, ousters, leaks, public feuds and accusations, security incidents caused by or hitting AI agents and labs, boycotts, backlash, and safety rollbacks",
      breaking:
        "a government action already taken (a law passed, an order signed, an arrest, an appointment, export controls, a moratorium, an accord signed), a strike on infrastructure, or an outage of a major AI service",
      policy:
        "policy proposals, hearings, bills not yet law, and court decisions about parties other than AI labs",
      business:
        "funding, IPO plans, acquisitions, partnerships, deals, earnings, stock and market moves, layoffs, and the ad business",
      opinion:
        "analyst reports, surveys, forecasts, macro warnings, trend pieces, and essays",
      other: "anything that fits none of the above",
    },
  },
};

/** The #917 drama headline regex, rejected at 56% precision. Its matches
 * that gold calls something else are the hard negatives for `kind`. */
const DRAMA_RE =
  /\b(lawsuit|sues?|sued|suing|subpoena\w*|antitrust|probes?|investigat(?:es|ed|ion)|fires?d?|fired|ousts?|ousted|resigns?|resignation|steps? down|quits?|leak(?:s|ed)?|feud|backlash|boycott|scandal|whistleblower|fraud|breach(?:es|ed)?|hack(?:s|ed|ers?)?|ban(?:s|ned)?|revok\w+|accus\w+|alleg\w+|rogue|deleted? (?:the |its |a )?(?:production )?database|wiped)\b/i;

/** #813 importance bands were live in this window (merged 2026-10-15 19:37
 * UTC, reverted 23:01 UTC, plus deploy lag), so stored scores from it are
 * not comparable. */
const RUBRIC_813_WINDOW = [
  Date.parse("2026-10-15T19:30:00Z") / 1000,
  Date.parse("2026-10-16T00:00:00Z") / 1000,
] as const;

const SEED = "kind-919";
const DEV = { drama: 10, breaking: 5, regexRest: 4, otherRest: 11 };
const CONTROL_ITEMS = 15;
/** More held-out items than the call cap can ever reach. */
const HELD_ITEMS = 220;

interface GoldItem {
  id: string;
  title: string;
  label: string;
  kind: string;
}

interface D1Row {
  id: string;
  source_id: string;
  title: string;
  summary: string | null;
  llm_importance: number | null;
  category: string | null;
  fetched_at: number;
}

export interface SampleItem {
  id: string;
  split: "dev" | "held";
  /** Held-out items are consumed in this order until the budget runs out. */
  order: number;
  stratum: string;
  goldKind: string;
  regex: boolean;
  control: boolean;
  title: string;
  summary: string;
  source: string;
  storedImportance: number | null;
  storedCategory: string | null;
  fetchedAt: number;
}

interface Sample {
  rules: Record<string, string>;
  /** Gold-set size of each stratum, for reweighting sampled metrics. */
  strata: Record<string, number>;
  items: SampleItem[];
}

interface CachedAnswer {
  id: string;
  variant: string;
  upstreamModel: string;
  upstreamProvider: string;
  inputTokens: number;
  answers: Record<string, SystemOneAnswer>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FILE = path.join(here, "fixtures/kind-eval/sample.json");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function need(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function hashUnit(id: string): number {
  const hex = createHash("sha256").update(`${SEED}:${id}`).digest("hex");
  return Number.parseInt(hex.slice(0, 12), 16) / 2 ** 48;
}

export function stratumOf(goldKind: string, title: string): string {
  return DRAMA_RE.test(title) ? `${goldKind}+re` : goldKind;
}

/** Systematic stratified order: each stratum's items spread evenly through
 * the list, so any prefix holds every stratum in proportion. */
function stratifiedOrder<T extends { id: string; stratum: string }>(
  items: T[]
): T[] {
  const byStratum = new Map<string, T[]>();
  for (const item of items) {
    byStratum.set(item.stratum, [...(byStratum.get(item.stratum) ?? []), item]);
  }
  const placed: [number, T][] = [];
  for (const group of byStratum.values()) {
    const sorted = [...group].sort((a, b) => hashUnit(a.id) - hashUnit(b.id));
    sorted.forEach((item, rank) => {
      placed.push([(rank + hashUnit(`${item.id}:pos`)) / sorted.length, item]);
    });
  }
  return placed.sort((a, b) => a[0] - b[0]).map(([, item]) => item);
}

function freeze() {
  const gold = JSON.parse(readFileSync(need("--gold"), "utf-8")) as {
    items: GoldItem[];
  };
  const rows = new Map(
    (JSON.parse(readFileSync(need("--rows"), "utf-8")) as D1Row[]).map((r) => [
      r.id,
      r,
    ])
  );
  const all = gold.items.map((g) => {
    const row = rows.get(g.id);
    if (!row) throw new Error(`no D1 row for gold item ${g.id}`);
    if (!GOLD_TO_KIND[g.kind]) throw new Error(`unmapped gold kind ${g.kind}`);
    return {
      id: g.id,
      stratum: stratumOf(g.kind, g.title),
      goldKind: g.kind,
      regex: DRAMA_RE.test(g.title),
      title: row.title,
      summary: row.summary ?? "",
      source: row.source_id,
      storedImportance: row.llm_importance,
      storedCategory: row.category,
      fetchedAt: row.fetched_at,
    };
  });
  const strata: Record<string, number> = {};
  for (const item of all)
    strata[item.stratum] = (strata[item.stratum] ?? 0) + 1;

  const target = (item: (typeof all)[number]) =>
    item.goldKind === "drama" || item.goldKind === "breaking";
  const ordered = (pick: (item: (typeof all)[number]) => boolean) =>
    stratifiedOrder(all.filter(pick));
  const dev = new Set(
    [
      ...ordered((i) => i.goldKind === "drama").slice(0, DEV.drama),
      ...ordered((i) => i.goldKind === "breaking").slice(0, DEV.breaking),
      ...ordered((i) => !target(i) && i.regex).slice(0, DEV.regexRest),
      ...ordered((i) => !target(i) && !i.regex).slice(0, DEV.otherRest),
    ].map((i) => i.id)
  );
  // Held-out alternates one drama/breaking item with one of the rest, so a
  // prefix cut by the call budget keeps both precision and recall measurable.
  const heldTarget = ordered((i) => target(i) && !dev.has(i.id));
  const heldRest = ordered((i) => !target(i) && !dev.has(i.id));
  const held: typeof all = [];
  for (let k = 0; k < Math.max(heldTarget.length, heldRest.length); k++) {
    if (heldTarget[k]) held.push(heldTarget[k]);
    if (heldRest[k]) held.push(heldRest[k]);
  }
  const items: SampleItem[] = [
    ...all
      .filter((i) => dev.has(i.id))
      .map((i, order) => ({
        ...i,
        split: "dev" as const,
        order,
        control: false,
      })),
    ...held.slice(0, HELD_ITEMS).map((i, order) => ({
      ...i,
      split: "held" as const,
      order,
      control: order < CONTROL_ITEMS,
    })),
  ];
  const sample: Sample = {
    rules: {
      frozen:
        "2026-10-16, before any kind call. Gold: #917's rank-kinds gold set (659 stories, labelled from titles). Rows: production D1 items, same ids. Order is a seeded hash of the id; nothing here depends on a model answer.",
      dev: `${DEV.drama} drama, ${DEV.breaking} breaking, ${DEV.regexRest} drama-regex matches gold calls something else, ${DEV.otherRest} other. Option definitions may be revised at most twice on dev.`,
      held: `The next ${HELD_ITEMS} items, alternating drama/breaking with the rest, each stratified by gold kind and drama-regex match. Run in order until the 250-call cap minus a 5-call margin. The first 15 also get a control call without \`kind\`.`,
      passBar:
        "Per kind (drama, breaking) on held-out, at the decision rule chosen on dev: reweighted precision >= 0.85, raw Wilson 95% lower bound >= 0.70, and recall >= 0.50. Calibration: against the control, mean |delta importance| <= 0.2 and category agreement >= 95%.",
    },
    strata,
    items,
  };
  mkdirSync(path.dirname(SAMPLE_FILE), { recursive: true });
  writeFileSync(SAMPLE_FILE, `${JSON.stringify(sample, null, 2)}\n`);
  const count = (split: string) =>
    items.filter((i) => i.split === split).length;
  console.log(`dev ${count("dev")}, held ${count("held")} -> ${SAMPLE_FILE}`);
}

export function kindQuestions(variant: string): SystemOneQuestions {
  const production = jevScoreQuestions(
    CORE_CATEGORIES,
    BUILDER_CATEGORIES,
    CATEGORY_DEFINITIONS,
    CATEGORY_RULE
  );
  if (variant === "control") return production;
  const spec = KIND_VARIANTS[variant];
  if (!spec) throw new Error(`unknown variant ${variant}`);
  return {
    ...production,
    kind: {
      type: "choice",
      instructions: spec.instructions,
      criteria: { ...spec.definitions },
    },
  };
}

/** The production request body for one item (`scoreOneWithSystemOne`). */
function requestBody(item: SampleItem, variant: string) {
  return {
    state: {
      i: 0,
      title: item.title,
      summary: item.summary,
      source: item.source,
    },
    model: JEV_DEFAULT_MODEL,
    questions: kindQuestions(variant),
  };
}

function cacheFile(cache: string, item: SampleItem, variant: string): string {
  const key = createHash("sha256")
    .update(JSON.stringify(requestBody(item, variant)))
    .digest("hex");
  return path.join(cache, `${key}.json`);
}

function loadSample(): Sample {
  return JSON.parse(readFileSync(SAMPLE_FILE, "utf-8")) as Sample;
}

function splitItems(sample: Sample, split: string, variant: string) {
  return sample.items
    .filter((i) => i.split === split && (variant !== "control" || i.control))
    .sort((a, b) => a.order - b.order);
}

async function run() {
  const split = need("--split");
  const variant = need("--variant");
  const cache = need("--cache");
  const cap = Number(arg("--cap") ?? 250);
  // 72 back-to-back calls drew a 429 on 2026-10-16; space them out.
  const paceMs = Number(arg("--pace-ms") ?? 3000);
  const items = splitItems(loadSample(), split, variant).slice(
    0,
    Number(arg("--limit") ?? Number.POSITIVE_INFINITY)
  );
  mkdirSync(cache, { recursive: true });
  const ledger = path.join(cache, "calls.log");
  const spent = () =>
    existsSync(ledger)
      ? readFileSync(ledger, "utf-8").split("\n").filter(Boolean).length
      : 0;
  const env = { ANYROUTER_API_KEY: requireLlmKey() } as Env;

  // callSystemOne folds every failure into null; the status is read here.
  let lastStatus = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    lastStatus = 0;
    const res = await realFetch(...args);
    lastStatus = res.status;
    return res;
  };

  let called = 0;
  for (const item of items) {
    const file = cacheFile(cache, item, variant);
    if (existsSync(file)) continue;
    if (spent() >= cap) {
      console.log(`cap of ${cap} calls reached; stopping`);
      break;
    }
    if (called > 0) await new Promise((r) => setTimeout(r, paceMs));
    const body = requestBody(item, variant);
    const res = await callSystemOne(
      env,
      body.state,
      body.questions,
      "score",
      body.model,
      SCORE_JEV_TIMEOUT_MS
    );
    called++;
    appendFileSync(
      ledger,
      `${new Date().toISOString()}\t${variant}\t${item.id}\t${lastStatus}\t${res ? "ok" : "miss"}\n`
    );
    if (lastStatus === 429) {
      console.log("429 from AnyRouter; stopping (#656)");
      break;
    }
    if (!res) continue;
    const row: CachedAnswer = {
      id: item.id,
      variant,
      upstreamModel: res.upstreamModel,
      upstreamProvider: res.upstreamProvider,
      inputTokens: res.inputTokens,
      answers: res.answers,
    };
    writeFileSync(file, JSON.stringify(row));
  }
  console.log(`${called} calls this run, ${spent()} of ${cap} in ${ledger}`);
}

/** P(option) from a choice answer; Jev sends probabilities keyed by option
 * or as an array in criteria order. */
export function choiceProb(
  answer: SystemOneAnswer | undefined,
  option: string,
  options: readonly string[]
): number {
  if (!answer) return 0;
  const probs = answer.probabilities;
  if (Array.isArray(probs) && probs.length === options.length) {
    return probs[options.indexOf(option)] ?? 0;
  }
  if (probs && typeof probs === "object" && !Array.isArray(probs)) {
    return probs[option] ?? 0;
  }
  return answer.choice === option ? 1 : 0;
}

export function predictedKind(
  answer: SystemOneAnswer | undefined
): Kind | null {
  if (!answer) return null;
  if (KIND_OPTIONS.includes(answer.choice as Kind))
    return answer.choice as Kind;
  let best: Kind | null = null;
  let bestP = 0;
  for (const option of KIND_OPTIONS) {
    const p = choiceProb(answer, option, KIND_OPTIONS);
    if (p > bestP) {
      bestP = p;
      best = option;
    }
  }
  return best;
}

/** Wilson score interval at 95%. */
export function wilson(hits: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = hits / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const denom = 1 + (z * z) / n;
  return [(centre - margin) / denom, (centre + margin) / denom];
}

interface Scored {
  item: SampleItem;
  gold: Kind;
  pred: Kind | null;
  probs: Record<Kind, number>;
  importance: number | null;
  category: string;
  /** Sampling weight: gold-set stratum size over evaluated count. */
  weight: number;
}

const pct = (x: number) =>
  Number.isFinite(x) ? Number((100 * x).toFixed(1)) : null;

/** Precision and recall of one rule, raw and reweighted to the gold set. */
export function rulePR<T extends { gold: Kind; weight: number }>(
  rows: T[],
  gold: Kind,
  hit: (r: T) => boolean
) {
  const pred = rows.filter(hit);
  const tp = pred.filter((r) => r.gold === gold);
  const pos = rows.filter((r) => r.gold === gold);
  const w = (xs: T[]) => xs.reduce((a, r) => a + r.weight, 0);
  const [lo, hi] = wilson(tp.length, pred.length);
  return {
    predicted: pred.length,
    tp: tp.length,
    gold: pos.length,
    precision: pct(tp.length / pred.length),
    wilson95: `${pct(lo)}-${pct(hi)}`,
    recall: pct(tp.length / pos.length),
    wPrecision: pct(w(tp) / w(pred)),
    wRecall: pct(w(tp) / w(pos)),
  };
}

function scoreRows(
  sample: Sample,
  split: string,
  variant: string,
  cache: string
) {
  const items = splitItems(sample, split, variant);
  const answered = items.flatMap((item) => {
    const file = cacheFile(cache, item, variant);
    return existsSync(file)
      ? [{ item, row: JSON.parse(readFileSync(file, "utf-8")) as CachedAnswer }]
      : [];
  });
  const evaluated: Record<string, number> = {};
  for (const { item } of answered) {
    evaluated[item.stratum] = (evaluated[item.stratum] ?? 0) + 1;
  }
  const rows: Scored[] = answered.map(({ item, row }) => {
    const judgment = scoreJudgmentFromJev(
      row.answers,
      CORE_CATEGORIES,
      BUILDER_CATEGORIES
    );
    const kind = row.answers.kind;
    return {
      item,
      gold: GOLD_TO_KIND[item.goldKind] as Kind,
      pred: predictedKind(kind),
      probs: Object.fromEntries(
        KIND_OPTIONS.map((o) => [o, choiceProb(kind, o, KIND_OPTIONS)])
      ) as Record<Kind, number>,
      importance: judgment?.importance ?? null,
      category: judgment?.category ?? "",
      weight:
        (sample.strata[item.stratum] ?? 0) / (evaluated[item.stratum] ?? 1),
    };
  });
  const servedByJev = answered.filter(({ row }) =>
    /^(?:jev\b|typesafe\/jev\b)/i.test(row.upstreamModel)
  ).length;
  return { items, rows, servedByJev };
}

function drift(
  rows: { importance: number | null; category: string }[],
  base: { importance: number | null; category: string | null }[]
) {
  const pairs = rows
    .map((r, i) => [r, base[i]] as const)
    .filter(
      ([r, b]) =>
        r.importance !== null && b?.importance !== null && b !== undefined
    );
  const deltas = pairs.map(
    ([r, b]) => (r.importance ?? 0) - (b.importance ?? 0)
  );
  const mean = (xs: number[]) =>
    xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return {
    n: pairs.length,
    meanAbsDelta: Number(mean(deltas.map(Math.abs)).toFixed(3)),
    meanDelta: Number(mean(deltas).toFixed(3)),
    maxAbsDelta: Number(Math.max(0, ...deltas.map(Math.abs)).toFixed(2)),
    categoryAgreement: `${pairs.filter(([r, b]) => r.category === b.category).length}/${pairs.length}`,
  };
}

function report() {
  const split = need("--split");
  const variant = need("--variant");
  const cache = need("--cache");
  const sample = loadSample();
  const { items, rows, servedByJev } = scoreRows(sample, split, variant, cache);
  console.log(
    `${split} ${variant}: ${rows.length}/${items.length} answered, ${servedByJev} served by Jev, ${rows.filter((r) => r.pred === null).length} without a kind answer`
  );

  console.table(
    Object.fromEntries(
      KIND_OPTIONS.map((k) => [k, rulePR(rows, k, (r) => r.pred === k)])
    )
  );

  const threshold = arg("--threshold");
  const cuts = [
    0.3,
    0.4,
    0.5,
    0.6,
    0.7,
    0.8,
    ...(threshold ? [Number(threshold)] : []),
  ];
  for (const k of ["drama", "breaking"] as const) {
    console.log(`${k}: argmax, then P(${k}) >= t`);
    console.table({
      argmax: rulePR(rows, k, (r) => r.pred === k),
      ...Object.fromEntries(
        cuts.map((t) => [`p>=${t}`, rulePR(rows, k, (r) => r.probs[k] >= t)])
      ),
    });
  }
  console.log("drama or breaking, argmax");
  const either = rows.map((r) => ({
    ...r,
    gold: (r.gold === "drama" || r.gold === "breaking"
      ? "drama"
      : r.gold) as Kind,
    pred: (r.pred === "drama" || r.pred === "breaking"
      ? "drama"
      : r.pred) as Kind,
  }));
  console.table({ either: rulePR(either, "drama", (r) => r.pred === "drama") });

  console.log("confusion: gold (rows) x predicted (columns)");
  console.table(
    Object.fromEntries(
      KIND_OPTIONS.map((g) => [
        g,
        Object.fromEntries(
          [...KIND_OPTIONS, null].map((p) => [
            p ?? "none",
            rows.filter((r) => r.gold === g && r.pred === p).length,
          ])
        ),
      ])
    )
  );

  console.log(
    "hard negatives: drama-regex matches gold calls neither drama nor breaking"
  );
  const hard = rows.filter(
    (r) => r.item.regex && r.gold !== "drama" && r.gold !== "breaking"
  );
  console.table({
    hard: {
      n: hard.length,
      predictedDrama: hard.filter((r) => r.pred === "drama").length,
      predictedBreaking: hard.filter((r) => r.pred === "breaking").length,
    },
  });

  console.log("drama/breaking errors");
  console.table(
    rows
      .filter(
        (r) =>
          (r.gold === "drama" ||
            r.gold === "breaking" ||
            r.pred === "drama" ||
            r.pred === "breaking") &&
          r.gold !== r.pred
      )
      .map((r) => ({
        gold: r.item.goldKind,
        pred: r.pred,
        pDrama: Number(r.probs.drama.toFixed(2)),
        pBreaking: Number(r.probs.breaking.toFixed(2)),
        title: r.item.title.slice(0, 80),
      }))
  );

  const outside813 = rows.filter(
    (r) =>
      r.item.fetchedAt < RUBRIC_813_WINDOW[0] ||
      r.item.fetchedAt >= RUBRIC_813_WINDOW[1]
  );
  console.log("calibration drift");
  const control =
    variant === "control" ? null : scoreRows(sample, split, "control", cache);
  const controlById = new Map(control?.rows.map((r) => [r.item.id, r]));
  const paired = rows.filter((r) => controlById.has(r.item.id));
  console.table({
    "vs stored (outside #813 window)": drift(
      outside813,
      outside813.map((r) => ({
        importance: r.item.storedImportance,
        category: r.item.storedCategory,
      }))
    ),
    ...(control && {
      "control vs stored": drift(
        control.rows,
        control.rows.map((r) => ({
          importance: r.item.storedImportance,
          category: r.item.storedCategory,
        }))
      ),
      "vs control (same items, today)": drift(
        paired,
        paired.map(
          (r) =>
            controlById.get(r.item.id) ?? { importance: null, category: null }
        )
      ),
    }),
  });
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const command = process.argv[2];
  const main =
    command === "freeze"
      ? async () => freeze()
      : command === "run"
        ? run
        : command === "report"
          ? async () => report()
          : null;
  if (!main) {
    console.error("usage: kind-eval.ts freeze|run|report ...");
    process.exit(1);
  }
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
