#!/usr/bin/env tsx
/**
 * Per-step model bench: runs any model list through each pipeline LLM step
 * with the real prompt builders and parsers, scores the output against the
 * datasets in scripts/fixtures/bench/, and writes JSON plus a markdown report
 * with a recommended chain per env var.
 *
 * Usage (from apps/web):
 *   pnpm model-bench build [--steps score,tldr]       # refresh datasets (prod D1, SELECT only)
 *   pnpm model-bench run --steps score,jev,translate-en-vi
 *        [--models a,b,c] [--limit N] [--judge z-ai/glm-4.6] [--concurrency 2]
 *        [--out file.json]
 *   pnpm model-bench report <run.json> [more.json ...] [--out merged.json]
 *
 * Without --models each step runs the ids in its wrangler.toml chain.
 * Steps: score jev translate-en-vi translate-vi-en review tldr cluster topics.
 * Each model runs alone (no fallback hop), with the failing-model skip list
 * reset between models. Reads ANYROUTER_API_KEY from .env.local; never
 * prints it. Makes no D1 writes, sends no email or Telegram.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type LlmCallLogEntry,
  resetUnavailableModels,
  setLlmCallLogger,
  withLlmCallContext,
} from "../worker/llm";
import { readApiKey, tomlModels } from "./bench-env";
import { BUILDERS, benchDir } from "./model-bench/build";
import {
  type CaseResult,
  datasetOf,
  loadCases,
  mean,
  STEPS,
  spearman,
  stepEnv,
} from "./model-bench/steps";

interface ModelRun {
  step: string;
  model: string;
  cases: number;
  units: number;
  unitErrors: number;
  schemaValid: number;
  quality: number | null;
  metrics: Record<string, number | null>;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  attempts: number;
  attemptErrors: number;
  rateLimited: number;
  tokens: number;
  costUsd: number | null;
  estCostUsd: number | null;
  errors: string[];
  results: CaseResult[];
}

interface BenchRun {
  date: string;
  judge: string;
  limit: number | null;
  runs: ModelRun[];
}

const DEFAULT_JUDGE = "z-ai/glm-4.6";
/** Calls in flight per model; the bench shares the prod key's rate limit. */
const DEFAULT_CONCURRENCY = 2;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const list = (s: string | undefined) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const pct = (xs: number[], p: number): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const round = (n: number | null, d = 3) =>
  n === null ? null : Math.round(n * 10 ** d) / 10 ** d;

/** USD per 1M tokens from the AnyRouter catalog, for attempts that report
 *  no cost. Missing prices leave cost unknown rather than zero. */
async function loadPricing(): Promise<
  Map<string, { prompt: number; completion: number }>
> {
  const res = await fetch("https://anyrouter.dev/api/v1/models", {
    headers: { Authorization: `Bearer ${readApiKey()}` },
  });
  const body = (await res.json()) as {
    data?: { id: string; pricing?: { prompt?: number; completion?: number } }[];
  };
  return new Map(
    (body.data ?? []).map((m) => [
      m.id,
      {
        prompt: Number(m.pricing?.prompt ?? Number.NaN),
        completion: Number(m.pricing?.completion ?? Number.NaN),
      },
    ])
  );
}

async function pool<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

function defaultModels(step: string): string[] {
  const chain = tomlModels()[STEPS[step].envVar] ?? "";
  return list(chain);
}

async function runStepModel(
  step: string,
  model: string,
  limit: number | null,
  judge: string,
  pricing: Map<string, { prompt: number; completion: number }>,
  concurrency: number
): Promise<ModelRun> {
  const def = STEPS[step];
  const cases = loadCases(step).slice(0, limit ?? undefined);
  const units = def.units(cases);
  const env = stepEnv(step, model);
  resetUnavailableModels();

  const runId = `model-bench:${step}:${model}`;
  const entries: LlmCallLogEntry[] = [];
  setLlmCallLogger((entry) => {
    if (entry.runId === runId) entries.push(entry);
  });

  const latencies: number[] = [];
  const results: CaseResult[] = [];
  const errors: string[] = [];
  let unitErrors = 0;
  await pool(units, concurrency, async (unit) => {
    const started = Date.now();
    try {
      const out = await withLlmCallContext(runId, () =>
        def.run(env, unit, { model, judge })
      );
      results.push(...out);
    } catch (error) {
      unitErrors++;
      errors.push(error instanceof Error ? error.message : String(error));
      results.push(
        ...unit.map((c) => ({ id: String(c.id), valid: false, metrics: {} }))
      );
    }
    latencies.push(Date.now() - started);
  });
  setLlmCallLogger(null);

  // Reported = what AnyRouter billed; estimate = catalog list price, so a
  // free-tier or credit-covered model still shows what it would cost.
  let cost = 0;
  let est = 0;
  let estKnown = true;
  for (const e of entries) {
    if (typeof e.costUsd === "number") cost += e.costUsd;
    const price = pricing.get(e.model);
    if (!price || Number.isNaN(price.prompt)) {
      if (e.tokens > 0) estKnown = false;
      continue;
    }
    est +=
      ((e.promptTokens ?? e.tokens) * price.prompt +
        (e.completionTokens ?? 0) * (price.completion || 0)) /
      1e6;
  }

  const metricKeys = [
    ...new Set(results.flatMap((r) => Object.keys(r.metrics))),
  ].filter((k) => !["tp", "fp", "fn", "bandMid", "importance"].includes(k));
  const metrics: Record<string, number | null> = Object.fromEntries(
    metricKeys.map((k) => [k, round(mean(results.map((r) => r.metrics[k])))])
  );
  if (step === "score" || step === "jev" || step === "decision") {
    const pairs = results.filter(
      (r) =>
        typeof r.metrics.importance === "number" &&
        typeof r.metrics.bandMid === "number"
    );
    metrics.importanceSpearman = round(
      spearman(
        pairs.map((r) => r.metrics.importance as number),
        pairs.map((r) => r.metrics.bandMid as number)
      )
    );
  }
  const failed = entries.filter((e) => !e.ok);
  return {
    step,
    model,
    cases: cases.length,
    units: units.length,
    unitErrors,
    schemaValid: round(
      results.filter((r) => r.valid).length / Math.max(1, results.length)
    ) as number,
    quality: round(def.quality(results)),
    metrics,
    latencyP50Ms: pct(latencies, 50),
    latencyP95Ms: pct(latencies, 95),
    attempts: entries.length,
    attemptErrors: failed.length,
    rateLimited: failed.filter((e) => /429|rate.?limit/i.test(e.error ?? ""))
      .length,
    tokens: entries.reduce((a, e) => a + (e.tokens || 0), 0),
    costUsd: round(cost, 5),
    estCostUsd: estKnown ? round(est, 5) : null,
    errors: [...new Set([...errors, ...failed.map((e) => e.error ?? "")])]
      .filter(Boolean)
      .slice(0, 5),
    results,
  };
}

// ---- report --------------------------------------------------------------

/** No attempt succeeded and every error is the provider refusing or failing
 *  (BYOK-only, no credit, rate limit, upstream down). That says nothing about
 *  the model's quality, so it is left out of the ranking. Timeouts are not
 *  included: prod cuts slow models off the same way. */
const PROVIDER_ERROR = /\b(40[0-24]|429|50[0-4])\b|upstream|provider error/;
const unavailable = (r: ModelRun) =>
  r.attempts > 0 &&
  r.attempts === r.attemptErrors &&
  r.errors.every((e) => PROVIDER_ERROR.test(e) && !/timed out/.test(e));

/** A model can lead a chain only if it answered reliably. */
const usable = (r: ModelRun) =>
  !unavailable(r) && r.schemaValid >= 0.8 && r.unitErrors < r.units;

const isConcrete = (id: string) =>
  !id.startsWith("@preset/") && !id.startsWith("anyrouter/");

function recommend(run: BenchRun): Map<string, string[]> {
  const byVar = new Map<string, ModelRun[]>();
  for (const r of run.runs) {
    const v = STEPS[r.step].envVar;
    byVar.set(v, [...(byVar.get(v) ?? []), r]);
  }
  const chains = new Map<string, string[]>();
  for (const [envVar, runs] of byVar) {
    // A var shared by several steps (ANYROUTER_MODEL: score, cluster,
    // topics) ranks by mean quality over the steps each model ran.
    const models = [...new Set(runs.map((r) => r.model))];
    const scored = models
      .map((m) => {
        const mine = runs.filter((r) => r.model === m);
        return {
          m,
          ok: mine.every(usable),
          q: mean(mine.map((r) => r.quality)) ?? 0,
          p50: mean(mine.map((r) => r.latencyP50Ms)) ?? 0,
          concrete:
            mine.every((r) => !STEPS[r.step].concreteOnly) || isConcrete(m),
        };
      })
      .filter((x) => x.ok && x.concrete)
      .sort((a, b) => b.q - a.q || a.p50 - b.p50);
    chains.set(
      envVar,
      scored
        .slice(0, envVar === "ANYROUTER_REVIEW_MODEL" ? 2 : 3)
        .map((x) => x.m)
    );
  }
  // Reviewer ids must be disjoint from every generator chain (fails closed).
  const review = chains.get("ANYROUTER_REVIEW_MODEL");
  if (review) {
    const generators = new Set(
      [
        "ANYROUTER_TRANSLATE_MODEL",
        "ANYROUTER_ENGLISH_TRANSLATE_MODEL",
        "ANYROUTER_MODEL",
        "ANYROUTER_TLDR_MODEL",
      ].flatMap((v) => chains.get(v) ?? list(tomlModels()[v as never]))
    );
    chains.set(
      "ANYROUTER_REVIEW_MODEL",
      review.filter((m) => !generators.has(m))
    );
  }
  return chains;
}

function report(run: BenchRun): string {
  const current = tomlModels();
  const lines: string[] = [
    `# Model bench ${run.date}`,
    "",
    `Judge (back-translation): \`${run.judge}\`. Limit per step: ${run.limit ?? "all"}.`,
    "Quality is step-specific (0..1, see each table). `silver` metrics compare with stored prod output, so they measure closeness to the current model, not correctness. `(unavailable)` = no attempt succeeded and every error was the provider (BYOK, credit, 429, 5xx); those runs are not ranked.",
    "",
  ];
  const steps = [...new Set(run.runs.map((r) => r.step))];
  for (const step of steps) {
    const def = STEPS[step];
    const runs = run.runs
      .filter((r) => r.step === step)
      .sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1));
    const keys = [...new Set(runs.flatMap((r) => Object.keys(r.metrics)))];
    lines.push(
      `## ${step} (\`${def.envVar}\`, dataset \`${datasetOf(step)}.json\`)`,
      "",
      `Quality = ${def.primary}.`,
      "",
      `| ${["model", "quality", "valid", ...keys, "p50 s", "p95 s", "unit err", "429", "tokens", "billed $", "list $"].join(" | ")} |`,
      `|${"---|".repeat(keys.length + 10)}`
    );
    for (const r of runs) {
      const s = (ms: number | null) =>
        ms === null ? "–" : (ms / 1000).toFixed(1);
      lines.push(
        `| ${[
          unavailable(r) ? `${r.model} (unavailable)` : r.model,
          unavailable(r) ? "–" : (r.quality ?? "–"),
          r.schemaValid,
          ...keys.map((k) => r.metrics[k] ?? "–"),
          s(r.latencyP50Ms),
          s(r.latencyP95Ms),
          `${r.unitErrors}/${r.units}`,
          r.rateLimited,
          r.tokens,
          r.costUsd ?? "?",
          r.estCostUsd ?? "?",
        ].join(" | ")} |`
      );
    }
    const errs = runs.filter((r) => r.errors.length);
    if (errs.length) {
      lines.push("", "Errors:");
      for (const r of errs) lines.push(`- ${r.model}: ${r.errors.join("; ")}`);
    }
    lines.push("");
  }
  lines.push(
    "## Recommended chains",
    "",
    "Best usable models (≥80% schema-valid) by quality, then p50. Review ids are dropped if they appear in a generator chain; concrete-only vars drop aliases. Check the wrangler.toml comments (slice budgets, BYOK) before applying.",
    "",
    "| env var | current | recommended |",
    "|---|---|---|"
  );
  for (const [envVar, chain] of recommend(run)) {
    lines.push(
      `| ${envVar} | ${current[envVar as never] ?? "–"} | ${chain.join(",") || "keep current (insufficient data)"} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

// ---- main ----------------------------------------------------------------

async function main() {
  const mode = process.argv[2];
  if (mode === "build") {
    const steps = list(arg("--steps"));
    for (const [name, build] of Object.entries(BUILDERS))
      if (steps.length === 0 || steps.includes(name)) await build();
    return;
  }
  if (mode === "report") {
    // Merges several run files (e.g. steps run in parallel) into one report.
    const out = arg("--out");
    const files = process.argv
      .slice(3)
      .filter((f) => f.endsWith(".json") && f !== out);
    if (files.length === 0) throw new Error("report needs <run.json> ...");
    const runs = files.map(
      (f) => JSON.parse(readFileSync(f, "utf-8")) as BenchRun
    );
    const merged: BenchRun = { ...runs[0], runs: runs.flatMap((r) => r.runs) };
    // Re-score from stored per-case results, so a quality formula change
    // applies to earlier runs without new LLM calls.
    for (const r of merged.runs)
      r.quality = round(STEPS[r.step].quality(r.results));
    if (out) {
      writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
      writeFileSync(out.replace(/\.json$/, ".md"), report(merged));
      console.log(`wrote ${out}`);
    } else process.stdout.write(report(merged));
    return;
  }
  if (mode !== "run") {
    console.error(
      "usage: model-bench build|run|report — see the header of scripts/model-bench.ts"
    );
    process.exit(1);
  }
  const steps = list(arg("--steps"));
  const unknown = steps.filter((s) => !STEPS[s]);
  if (steps.length === 0 || unknown.length)
    throw new Error(
      `--steps must list some of: ${Object.keys(STEPS).join(",")}${unknown.length ? ` (unknown: ${unknown})` : ""}`
    );
  const limitArg = arg("--limit");
  const limit = limitArg ? Number(limitArg) : null;
  const judge = arg("--judge") ?? DEFAULT_JUDGE;
  const models = list(arg("--models"));
  const pricing = await loadPricing();
  const date = new Date().toISOString().slice(0, 10);
  const run: BenchRun = { date, judge, limit, runs: [] };

  for (const step of steps) {
    const stepModels = models.length ? models : defaultModels(step);
    for (const model of stepModels) {
      // Jev is rejected on /chat/completions; never bench it on a chat step.
      if (!STEPS[step].systemOne && model === "typesafe/jev") continue;
      if (model === judge && step === "translate-en-vi") {
        console.warn(`skip ${model} on ${step}: same id as the judge`);
        continue;
      }
      process.stderr.write(`${step} × ${model} … `);
      const r = await runStepModel(
        step,
        model,
        limit,
        judge,
        pricing,
        Number(arg("--concurrency") ?? DEFAULT_CONCURRENCY)
      );
      process.stderr.write(
        `quality ${r.quality} valid ${r.schemaValid} p50 ${r.latencyP50Ms}ms err ${r.unitErrors}/${r.units}\n`
      );
      run.runs.push(r);
    }
  }

  const reportsDir = path.join(benchDir, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const out = arg("--out") ?? path.join(reportsDir, `${date}.json`);
  writeFileSync(out, `${JSON.stringify(run, null, 2)}\n`);
  const md = out.replace(/\.json$/, ".md");
  writeFileSync(md, report(run));
  console.log(`wrote ${out}\nwrote ${md}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
