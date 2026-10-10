#!/usr/bin/env tsx
/**
 * EN→VI translation QA eval over 30 real production pairs
 * (`scripts/fixtures/translation-eval.json`).
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/translation-eval.ts guard [--fixture <file.json>]
 *   pnpm exec tsx scripts/translation-eval.ts run --out <file.json>
 *        [--candidates <earlier-run.json>] [--generate] [--limit N]
 *        [--model <id[,fallback...]>] [--fixture <file.json>]
 *   pnpm exec tsx scripts/translation-eval.ts compare <before.json> <after.json>
 *
 * `guard` makes no LLM calls: it runs the deterministic guards with an
 * all-pass review, so its failures are guard false positives or real
 * misses, separate from the reviewer.
 *
 * `run` takes each candidate (the production VI text by default, the
 * candidates of an earlier run with --candidates, or a fresh translateItems
 * call with --generate), then runs the production review → one repair →
 * re-review path (`requestReview` / `requestRepair`). A blind back-translation
 * of the final VI text, made by the reviewer chain from the VI text alone,
 * is the fidelity instrument; it is not part of the pipeline.
 *
 * `--model` pins ANYROUTER_TRANSLATE_MODEL (generation and repair) for a
 * model bake-off. `--fixture` swaps the item set, e.g.
 * `scripts/fixtures/translation-eval-bullets.json` (30 real TL;DR bullets).
 * Every run reports generator latency and AnyRouter-billed cost, the
 * reviewer's naturalness, and the VI/EN summary length ratio.
 *
 * Reads ANYROUTER_API_KEY from the repo-root `.env.local`; never prints it.
 * Provider failures are counted apart from quality failures.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type LlmCallLogEntry,
  setLlmCallLogger,
  translateItems,
  withLlmCallContext,
} from "../worker/llm";
import {
  detectHardSemanticFailures,
  requestRepair,
  requestReview,
  reviewPasses,
  SEMANTIC_CHECKS,
  type TranslationPair,
  type TranslationReview,
  type TranslationText,
} from "../worker/translation-qa";
import {
  extractProtectedTerms,
  missingProtectedTerms,
} from "../worker/translation-terms";
import type { Env } from "../worker/types";
import {
  benchEnv,
  blindBackTranslate,
  scoreBackTranslation,
  stubDb,
} from "./bench-env";

interface FixtureItem {
  id: string;
  source: string;
  title: string;
  summary: string;
  vi_title: string;
  vi_summary: string;
}

interface TermScore {
  total: number;
  missing: string[];
}

interface ItemResult {
  id: string;
  title: string;
  candidate: TranslationText | null;
  providerFailure: string | null;
  initial: {
    verdict: string;
    fidelity: number;
    hardFailures: string[];
    passed: boolean;
    naturalness: number;
  } | null;
  repaired: boolean;
  final: TranslationText | null;
  finalPassed: boolean;
  termsInitial: TermScore | null;
  termsFinal: TermScore | null;
  backTranslation: TranslationText | null;
  bt: {
    names: number;
    namesTotal: number;
    numbersMatch: boolean;
    contentRecall: number;
  } | null;
  calls: number;
  /** Generator wall time and billed USD for the candidate (with --generate). */
  genMs: number | null;
  genCostUsd: number | null;
  /** VI summary chars / EN summary chars of the candidate. */
  lengthRatio: number | null;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function readEnv(): Env {
  const model = arg("--model");
  return benchEnv(model ? { ANYROUTER_TRANSLATE_MODEL: model } : {}, stubDb());
}

/** Billed USD per LLM call context (one context per generated item). */
const costByContext = new Map<string, number>();
function logCost(entry: LlmCallLogEntry): void {
  if (!entry.runId || entry.costUsd == null) return;
  costByContext.set(
    entry.runId,
    (costByContext.get(entry.runId) ?? 0) + entry.costUsd
  );
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadFixture(): FixtureItem[] {
  const raw = JSON.parse(
    readFileSync(
      arg("--fixture") ?? path.join(here, "fixtures/translation-eval.json"),
      "utf-8"
    )
  ) as { items: FixtureItem[] };
  const limit = Number(arg("--limit") ?? raw.items.length);
  return raw.items.slice(0, limit);
}

function pairFor(
  item: FixtureItem,
  candidate: TranslationText
): TranslationPair {
  return {
    source: { title: item.title, summary: item.summary },
    candidate,
    sourceLang: "en",
    targetLang: "vi",
    direction: "en-vi",
  };
}

function allPassReview(item: FixtureItem): TranslationReview {
  return {
    schema_version: 3,
    direction: "en-vi",
    verdict: "accept",
    fidelity: 1,
    naturalness: 1,
    confidence: 1,
    checks: Object.fromEntries(SEMANTIC_CHECKS.map((c) => [c, "pass"])),
    reason: "all pass",
    // A perfect round trip, so only the candidate-side guards can fail.
    back_translation: { title: item.title, summary: item.summary },
  } as unknown as TranslationReview;
}

function termScore(item: FixtureItem, candidate: TranslationText): TermScore {
  const source = { title: item.title, summary: item.summary };
  const all = extractProtectedTerms(source);
  const miss = missingProtectedTerms(source, candidate);
  return {
    total: all.names.length + all.jargon.length,
    missing: [...miss.names, ...miss.jargon],
  };
}

// ---- modes ---------------------------------------------------------------

function guardMode(): void {
  const items = loadFixture();
  const counts: Record<string, number> = {};
  let clean = 0;
  let termsTotal = 0;
  let termsMissing = 0;
  for (const item of items) {
    const candidate = { title: item.vi_title, summary: item.vi_summary };
    const failures = detectHardSemanticFailures(
      pairFor(item, candidate),
      allPassReview(item)
    );
    for (const f of failures) counts[f] = (counts[f] ?? 0) + 1;
    if (failures.length === 0) clean++;
    const terms = termScore(item, candidate);
    termsTotal += terms.total;
    termsMissing += terms.missing.length;
    console.log(
      `${failures.length ? "FAIL" : "ok  "} ${item.title.slice(0, 60).padEnd(60)} ${failures.join(",")}${terms.missing.length ? ` missing=[${terms.missing.join(", ")}]` : ""}`
    );
  }
  console.log(
    JSON.stringify(
      {
        items: items.length,
        guardClean: clean,
        guardFailures: counts,
        termPreservation: termsTotal
          ? Number((1 - termsMissing / termsTotal).toFixed(3))
          : 1,
        termsTotal,
        termsMissing,
      },
      null,
      2
    )
  );
}

async function mapLimit<T, R>(
  xs: T[],
  limit: number,
  fn: (x: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, xs.length) }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await fn(xs[i] as T);
      }
    })
  );
  return out;
}

function safe(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 120);
}

async function evalItem(
  env: Env,
  item: FixtureItem,
  given: TranslationText | null
): Promise<ItemResult> {
  const result: ItemResult = {
    id: item.id,
    title: item.title,
    candidate: given,
    providerFailure: null,
    initial: null,
    repaired: false,
    final: null,
    finalPassed: false,
    termsInitial: null,
    termsFinal: null,
    backTranslation: null,
    bt: null,
    calls: 0,
    genMs: null,
    genCostUsd: null,
    lengthRatio: null,
  };
  if (!result.candidate) {
    result.calls++;
    const context = `gen:${item.id}`;
    const started = Date.now();
    const [row] = await withLlmCallContext(context, () =>
      translateItems(env, [
        { i: 0, title: item.title, summary: item.summary, sourceLang: "en" },
      ])
    ).catch(() => []);
    result.genMs = Date.now() - started;
    result.genCostUsd = costByContext.get(context) ?? null;
    if (!row?.summary) {
      result.providerFailure = "translate";
      return result;
    }
    result.candidate = { title: row.title, summary: row.summary };
  }
  const candidate = result.candidate;
  if (item.summary)
    result.lengthRatio = Number(
      (candidate.summary.length / item.summary.length).toFixed(3)
    );
  result.termsInitial = termScore(item, candidate);
  const pair = pairFor(item, candidate);
  let review: Awaited<ReturnType<typeof requestReview>>;
  try {
    result.calls++;
    review = await requestReview(
      env,
      pair,
      env.ANYROUTER_REVIEW_MODEL ?? "",
      45_000
    );
  } catch (error) {
    result.providerFailure = `review: ${safe(error)}`;
    return result;
  }
  const failures = detectHardSemanticFailures(pair, review.review);
  const passed = reviewPasses(review.review, failures);
  result.initial = {
    verdict: review.review.verdict,
    fidelity: review.review.fidelity,
    hardFailures: failures,
    passed,
    naturalness: review.review.naturalness,
  };
  result.final = candidate;
  result.finalPassed = passed;
  if (!passed && review.review.verdict !== "abstain") {
    try {
      result.calls++;
      const repaired = await requestRepair(
        env,
        pair,
        review.review,
        failures,
        env.ANYROUTER_TRANSLATE_MODEL ?? "",
        60_000
      );
      const repairedPair = pairFor(item, repaired.candidate);
      result.calls++;
      const recheck = await requestReview(
        env,
        repairedPair,
        env.ANYROUTER_REVIEW_MODEL ?? "",
        45_000
      );
      const again = detectHardSemanticFailures(repairedPair, recheck.review);
      if (reviewPasses(recheck.review, again)) {
        result.repaired = true;
        result.final = repaired.candidate;
        result.finalPassed = true;
      }
    } catch (error) {
      result.providerFailure = `repair: ${safe(error)}`;
    }
  }
  result.termsFinal = termScore(item, result.final ?? candidate);
  try {
    result.calls++;
    result.backTranslation = await blindBackTranslate(
      env,
      result.final ?? candidate
    );
    result.bt = scoreBackTranslation(
      { title: item.title, summary: item.summary },
      result.backTranslation
    );
  } catch (error) {
    result.providerFailure ??= `back-translate: ${safe(error)}`;
  }
  return result;
}

function summarize(rows: ItemResult[]) {
  const reviewed = rows.filter((r) => r.initial);
  const terms = (key: "termsInitial" | "termsFinal") => {
    const scored = rows.filter((r) => r[key]);
    const total = scored.reduce((s, r) => s + (r[key]?.total ?? 0), 0);
    const missing = scored.reduce(
      (s, r) => s + (r[key]?.missing.length ?? 0),
      0
    );
    return total ? Number((1 - missing / total).toFixed(3)) : 1;
  };
  const bts = rows.filter((r) => r.bt);
  const avg = (xs: number[]) =>
    xs.length
      ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3))
      : null;
  const hard: Record<string, number> = {};
  for (const r of reviewed)
    for (const f of r.initial?.hardFailures ?? []) hard[f] = (hard[f] ?? 0) + 1;
  return {
    items: rows.length,
    providerFailures: rows.filter((r) => r.providerFailure).length,
    reviewed: reviewed.length,
    initialAcceptRate: reviewed.length
      ? Number(
          (
            reviewed.filter((r) => r.initial?.passed).length / reviewed.length
          ).toFixed(3)
        )
      : null,
    finalAcceptRate: reviewed.length
      ? Number(
          (
            reviewed.filter((r) => r.finalPassed).length / reviewed.length
          ).toFixed(3)
        )
      : null,
    repaired: rows.filter((r) => r.repaired).length,
    meanReviewerFidelity: avg(reviewed.map((r) => r.initial?.fidelity ?? 0)),
    meanReviewerNaturalness: avg(
      reviewed.map((r) => r.initial?.naturalness ?? 0)
    ),
    meanLengthRatio: avg(
      rows.flatMap((r) => (r.lengthRatio === null ? [] : [r.lengthRatio]))
    ),
    shortSummaries: rows.filter(
      (r) => r.lengthRatio !== null && r.lengthRatio < 0.8
    ).length,
    generation: (() => {
      const ms = rows
        .flatMap((r) => (r.genMs === null ? [] : [r.genMs]))
        .sort((a, b) => a - b);
      const costs = rows.flatMap((r) =>
        r.genCostUsd === null ? [] : [r.genCostUsd]
      );
      return {
        p50Ms: ms.length ? ms[Math.floor(ms.length / 2)] : null,
        p95Ms: ms.length
          ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))]
          : null,
        billedUsd: costs.length
          ? Number(costs.reduce((a, b) => a + b, 0).toFixed(5))
          : null,
      };
    })(),
    hardFailures: hard,
    termPreservationInitial: terms("termsInitial"),
    termPreservationFinal: terms("termsFinal"),
    backTranslation: {
      scored: bts.length,
      nameRecall: (() => {
        const t = bts.reduce((s, r) => s + (r.bt?.namesTotal ?? 0), 0);
        const k = bts.reduce((s, r) => s + (r.bt?.names ?? 0), 0);
        return t ? Number((k / t).toFixed(3)) : null;
      })(),
      numbersMatchRate: bts.length
        ? Number(
            (bts.filter((r) => r.bt?.numbersMatch).length / bts.length).toFixed(
              3
            )
          )
        : null,
      meanContentRecall: avg(bts.map((r) => r.bt?.contentRecall ?? 0)),
    },
    calls: rows.reduce((s, r) => s + r.calls, 0),
  };
}

async function runMode(): Promise<void> {
  const out = arg("--out");
  if (!out) throw new Error("--out <file.json> is required");
  const env = readEnv();
  const items = loadFixture();
  const prior = arg("--candidates");
  const priorRows = prior
    ? new Map(
        (JSON.parse(readFileSync(prior, "utf-8")).rows as ItemResult[]).map(
          (r) => [r.id, r.candidate]
        )
      )
    : null;
  const generate = process.argv.includes("--generate");
  setLlmCallLogger(logCost);
  const rows = await mapLimit(items, 3, (item) =>
    evalItem(
      env,
      item,
      priorRows
        ? (priorRows.get(item.id) ?? null)
        : generate
          ? null
          : { title: item.vi_title, summary: item.vi_summary }
    )
  );
  setLlmCallLogger(null);
  const summary = summarize(rows);
  writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  for (const r of rows) {
    console.log(
      `${r.providerFailure ? "ERR " : r.finalPassed ? "PASS" : "FAIL"} ${r.title.slice(0, 55).padEnd(55)} ${r.initial?.hardFailures.join(",") ?? r.providerFailure ?? ""}`
    );
  }
}

function compareMode(): void {
  const [a, b] = process.argv.slice(3);
  if (!a || !b) throw new Error("compare <before.json> <after.json>");
  const before = JSON.parse(readFileSync(a, "utf-8")).summary;
  const after = JSON.parse(readFileSync(b, "utf-8")).summary;
  console.log(JSON.stringify({ before, after }, null, 2));
}

const mode = process.argv[2];
if (mode === "guard") guardMode();
else if (mode === "run") await runMode();
else if (mode === "compare") compareMode();
else {
  console.error("usage: translation-eval.ts guard | run --out f | compare a b");
  process.exit(1);
}
