/**
 * One adapter per pipeline LLM step. Each runs a single model (no fallback
 * chain) through the step's real prompt builder and parser from worker/,
 * then scores the output against the dataset's reference label.
 *
 * A `Unit` is one production-shaped call (a score batch of 5, a translate
 * batch of 3, one review, one TL;DR edition, ...). Latency and error rates
 * are per unit; quality metrics are per case.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { clusterSimilar } from "../../worker/dedupe";
import { RELEVANCE_THRESHOLD } from "../../worker/ingest/context";
import {
  BUILDER_CATEGORIES,
  CATEGORY_DEFINITIONS,
  CATEGORY_RULE,
  CORE_CATEGORIES,
  callAnyrouter,
  generateTldr,
  parseJson,
  SCORE_BATCH_SIZE,
  SCORE_SLICE_MAX_MS,
  type ScoreResult,
  sanitizeScoreResults,
  scoreBatchPrompt,
  TRANSLATE_BATCH_SIZE,
  translateItems,
  withLlmCallContext,
} from "../../worker/llm";
import {
  callSystemOne,
  jevScoreQuestions,
  scoreJudgmentFromJev,
  servedByJev,
} from "../../worker/systemone";
import {
  buildTopicMappingPrompt,
  parseTopicMappingResponse,
} from "../../worker/topics";
import {
  knowledgeViolations,
  loadActiveRules,
} from "../../worker/translation-knowledge";
import {
  buildEnglishCandidatePrompt,
  detectHardSemanticFailures,
  ENGLISH_TRANSLATION_SYSTEM_PROMPT,
  parseRepairCandidate,
  QA_MAX_JSON_CHARS,
  requestReview,
  reviewPasses,
  type TranslationPair,
  type TranslationText,
} from "../../worker/translation-qa";
import { QA_REVIEW_TIMEOUT_MS } from "../../worker/translation-review";
import {
  extractProtectedTerms,
  missingProtectedTerms,
} from "../../worker/translation-terms";
import type { Env } from "../../worker/types";
import {
  benchEnv,
  blindBackTranslate,
  contentWords,
  type ModelVar,
  scoreBackTranslation,
  stubDb,
} from "../bench-env";
import { benchDir } from "./build";
import {
  REVIEW_QUEUE_STEPS,
  reviewQueueDataset,
} from "./steps-review-queue";
import { draftRepairStep } from "./steps-repair";
import { ruleExtractionStep } from "./steps-rules";

/** Per-case outcome: `valid` = schema-valid output for this case;
 *  `metrics` feed the step aggregates (null = not applicable). */
export interface CaseResult {
  id: string;
  valid: boolean;
  metrics: Record<string, number | null>;
  output?: unknown;
}

export interface StepContext {
  model: string;
  /** Fixed judge for back-translation; never the candidate model. */
  judge: string;
}

export interface StepDef {
  /** Env var whose chain this step reads in production. */
  envVar: ModelVar;
  /** What "quality" means for the recommendation, in report words. */
  primary: string;
  /** Concrete chat ids only (no aliases/presets) in production. */
  concreteOnly?: boolean;
  /** System One endpoint, not /chat/completions. */
  systemOne?: boolean;
  units: (cases: Case[]) => Case[][];
  run: (env: Env, unit: Case[], ctx: StepContext) => Promise<CaseResult[]>;
  /** Aggregate 0..1 quality from per-case metrics. */
  quality: (results: CaseResult[]) => number | null;
}

export type Case = any;

export function loadCases(step: string): Case[] {
  const file = path.join(benchDir, `${datasetOf(step)}.json`);
  return (JSON.parse(readFileSync(file, "utf-8")) as { cases: Case[] }).cases;
}

export function datasetOf(step: string): string {
  if (step === "jev" || step === "decision") return "score";
  return reviewQueueDataset(step) ?? step;
}

const chunk = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) =>
    xs.slice(i * n, i * n + n)
  );
const one = (cases: Case[]) => cases.map((c) => [c]);

export const mean = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 3) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra) ?? 0;
  const mb = mean(rb) ?? 0;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

// ---- score / jev ---------------------------------------------------------

function scoreCaseResult(c: Case, row: ScoreResult | undefined): CaseResult {
  if (!row) return { id: c.id, valid: false, metrics: {} };
  const band = c.gold?.importanceBand as [number, number] | undefined;
  const cur = new Set<string>(c.current?.tags ?? []);
  const inter = row.tags.filter((t) => cur.has(t)).length;
  const union = new Set([...row.tags, ...cur]).size;
  return {
    id: c.id,
    valid: row.category !== "",
    metrics: {
      importance: row.importance,
      bandMid: band ? (band[0] + band[1]) / 2 : null,
      bandHit: band
        ? Number(row.importance >= band[0] && row.importance <= band[1])
        : null,
      relevanceAgree: Number(
        row.relevance >= RELEVANCE_THRESHOLD === Boolean(c.silver?.relevant)
      ),
      categoryAgree: c.silver?.category
        ? Number(row.category === c.silver.category)
        : null,
      tagJaccard: union ? inter / union : null,
    },
    output: {
      relevance: row.relevance,
      importance: row.importance,
      quality: row.quality,
      category: row.category,
      tags: row.tags,
    },
  };
}

function scoreQuality(results: CaseResult[]): number | null {
  const hit = mean(results.map((r) => r.metrics.bandHit));
  const rel = mean(results.map((r) => r.metrics.relevanceAgree));
  if (hit === null) return 0;
  // Unanswered items count against the model: skipping is not accuracy.
  const answered = results.filter((r) => r.valid).length;
  return (0.7 * hit + 0.3 * (rel ?? 0)) * (answered / results.length);
}

const scoreStep: StepDef = {
  envVar: "ANYROUTER_MODEL",
  primary: "importance band hit (gold) + relevance agreement",
  units: (cases) => chunk(cases, SCORE_BATCH_SIZE),
  async run(env, unit, { model }) {
    const batch = unit.map((c, i) => ({
      i,
      title: c.title,
      summary: c.summary,
      source: c.source,
    }));
    const { content, tokens } = await callAnyrouter(
      env,
      [{ role: "user", content: scoreBatchPrompt(batch) }],
      {
        json: true,
        task: "score",
        modelSpec: model,
        maxSliceMs: SCORE_SLICE_MAX_MS,
      }
    );
    const parsed = parseJson<{ results?: unknown } | unknown[]>(content);
    const rows = sanitizeScoreResults(
      Array.isArray(parsed) ? parsed : parsed.results,
      batch,
      Math.ceil(tokens / batch.length)
    );
    return unit.map((c, i) =>
      scoreCaseResult(
        c,
        rows.find((r) => r.i === i)
      )
    );
  },
  quality: scoreQuality,
};

const JEV_QUESTIONS = jevScoreQuestions(
  CORE_CATEGORIES,
  BUILDER_CATEGORIES,
  CATEGORY_DEFINITIONS,
  CATEGORY_RULE
);

/** One System One score call, as `scoreOneWithSystemOne` makes it. With
 *  `requireJev`, an answer not served by Jev is a miss, as prod treats any
 *  hop other than the configured Jev id (GLiNER has no score scale). */
function systemOneStep(envVar: ModelVar, requireJev: boolean): StepDef {
  return {
    envVar,
    primary: "importance band hit (gold) + relevance agreement",
    systemOne: true,
    units: one,
    async run(env, [c], { model }) {
      const jev = await callSystemOne(
        env,
        { i: 0, title: c.title, summary: c.summary, source: c.source },
        JEV_QUESTIONS,
        "score",
        model
      );
      if (!jev) return [{ id: c.id, valid: false, metrics: {} }];
      const judgment = scoreJudgmentFromJev(
        jev.answers,
        CORE_CATEGORIES,
        BUILDER_CATEGORIES
      );
      const [row] = judgment
        ? sanitizeScoreResults([{ i: 0, ...judgment }], [{ i: 0, ...c }], 0)
        : [];
      const served = servedByJev(jev);
      const result = scoreCaseResult(
        c,
        requireJev && !served ? undefined : row
      );
      result.metrics.servedByJev = Number(served);
      result.output = {
        ...(result.output as object),
        upstream: jev.upstreamModel,
      };
      return [result];
    },
    quality: scoreQuality,
  };
}

// ---- translation ---------------------------------------------------------

/** Run id the back-translation judge logs under. */
export const JUDGE_RUN = "model-bench:judge";

async function rulesFor(env: Env) {
  return loadActiveRules(env);
}

const translateEnVi: StepDef = {
  envVar: "ANYROUTER_TRANSLATE_MODEL",
  primary:
    "protected-term keep + knowledge-rule compliance + back-translation recall",
  units: (cases) => chunk(cases, TRANSLATE_BATCH_SIZE),
  async run(env, unit, { judge }) {
    const out = await translateItems(
      env,
      unit.map((c, i) => ({ i, title: c.title, summary: c.summary }))
    );
    const rules = await rulesFor(env);
    const results: CaseResult[] = [];
    for (const [i, c] of unit.entries()) {
      const row = out.find((r) => r.i === i);
      const source = { title: c.title, summary: c.summary };
      if (!row?.title) {
        results.push({ id: c.id, valid: false, metrics: {} });
        continue;
      }
      const candidate: TranslationText = {
        title: row.title,
        summary: row.summary,
      };
      const all = extractProtectedTerms(source);
      const miss = missingProtectedTerms(source, candidate);
      const total = all.names.length + all.jargon.length;
      const missing = miss.names.length + miss.jargon.length;
      const pair: TranslationPair = {
        source,
        candidate,
        sourceLang: "en",
        targetLang: "vi",
        direction: "en-vi",
      };
      let bt: ReturnType<typeof scoreBackTranslation> | null = null;
      try {
        // Judge calls log under their own context, apart from the candidate.
        const back = await withLlmCallContext(JUDGE_RUN, () =>
          blindBackTranslate(env, candidate, judge)
        );
        bt = scoreBackTranslation(source, back);
      } catch {
        bt = null;
      }
      results.push({
        id: c.id,
        valid: Boolean(row.summary) || !c.summary,
        metrics: {
          termKeep: total ? 1 - missing / total : 1,
          ruleClean: Number(knowledgeViolations(pair, rules).length === 0),
          btRecall: bt?.contentRecall ?? null,
          btNumbers: bt ? Number(bt.numbersMatch) : null,
          judgeOk: Number(bt !== null),
          gold: c.labelSource.startsWith("gold") ? 1 : null,
        },
        output: { ...candidate, missingTerms: [...miss.names, ...miss.jargon] },
      });
    }
    return results;
  },
  quality: (r) => {
    const valid = r.filter((x) => x.valid).length / Math.max(1, r.length);
    const keep = mean(r.map((x) => x.metrics.termKeep));
    const clean = mean(r.map((x) => x.metrics.ruleClean));
    const bt = mean(r.map((x) => x.metrics.btRecall));
    if (keep === null) return 0;
    // A judge outage must not cost the candidate: weight what was measured.
    const parts: [number, number | null][] = [
      [0.35, keep],
      [0.25, clean],
      [0.4, bt],
    ];
    const have = parts.filter(([, v]) => v !== null) as [number, number][];
    const w = have.reduce((a, [x]) => a + x, 0);
    return (valid * have.reduce((a, [x, v]) => a + x * v, 0)) / w;
  },
};

const translateViEn: StepDef = {
  envVar: "ANYROUTER_ENGLISH_TRANSLATE_MODEL",
  primary: "name keep + content recall vs stored EN (silver)",
  concreteOnly: true,
  units: one,
  async run(env, [c], { model }) {
    const text = { title: c.title, summary: c.summary };
    const pair: TranslationPair = {
      source: text,
      candidate: text,
      sourceLang: "vi",
      targetLang: "en",
      direction: "vi-en",
    };
    const result = await callAnyrouter(
      env,
      [
        { role: "system", content: ENGLISH_TRANSLATION_SYSTEM_PROMPT },
        { role: "user", content: buildEnglishCandidatePrompt(pair) },
      ],
      {
        json: true,
        modelSpec: model,
        task: "translate",
        timeoutMs: 60_000,
        maxTokens: 2_048,
        accept: (content) => parseRepairCandidate(content) !== null,
        sensitive: true,
        strictOutput: true,
        maxOutputChars: QA_MAX_JSON_CHARS * 2,
      }
    );
    const candidate = parseRepairCandidate(result.content);
    if (!candidate) return [{ id: c.id, valid: false, metrics: {} }];
    const names = extractProtectedTerms(text).names;
    const outLower = `${candidate.title}\n${candidate.summary}`.toLowerCase();
    const ref = contentWords(`${c.reference.title}\n${c.reference.summary}`);
    const got = contentWords(`${candidate.title}\n${candidate.summary}`);
    const hit = [...ref].filter((w) => got.has(w)).length;
    return [
      {
        id: c.id,
        valid: true,
        metrics: {
          nameKeep: names.length
            ? names.filter((n) => outLower.includes(n.toLowerCase())).length /
              names.length
            : 1,
          refRecall: ref.size ? hit / ref.size : null,
        },
        output: candidate,
      },
    ];
  },
  quality: (r) => {
    const valid = r.filter((x) => x.valid).length / Math.max(1, r.length);
    return (
      valid *
      (0.4 * (mean(r.map((x) => x.metrics.nameKeep)) ?? 0) +
        0.6 * (mean(r.map((x) => x.metrics.refRecall)) ?? 0))
    );
  },
};

const reviewStep: StepDef = {
  envVar: "ANYROUTER_REVIEW_MODEL",
  primary: "pass/fail agreement with stored qa_rating (silver)",
  concreteOnly: true,
  units: one,
  async run(env, [c], { model }) {
    const pair: TranslationPair = {
      source: c.source,
      candidate: c.candidate,
      sourceLang: "en",
      targetLang: "vi",
      direction: "en-vi",
    };
    const { review } = await requestReview(
      env,
      pair,
      model,
      QA_REVIEW_TIMEOUT_MS
    );
    const passes = reviewPasses(
      review,
      detectHardSemanticFailures(pair, review)
    );
    return [
      {
        id: c.id,
        valid: true,
        metrics: {
          agree: Number(passes === c.silver.passes),
          fidelity: review.fidelity,
        },
        output: { verdict: review.verdict, fidelity: review.fidelity, passes },
      },
    ];
  },
  quality: (r) =>
    (mean(r.map((x) => x.metrics.agree)) ?? 0) *
    (r.filter((x) => x.valid).length / Math.max(1, r.length)),
};

// ---- TL;DR ---------------------------------------------------------------

const tldrStep: StepDef = {
  envVar: "ANYROUTER_TLDR_MODEL",
  primary: "bilingual success + valid item ids + bullet length + coverage",
  units: one,
  async run(env, [c]) {
    const res = await generateTldr(env, c.items);
    const en = res.bullets_en;
    if (en.length === 0)
      return [{ id: c.id, valid: false, metrics: { bilingual: 0 } }];
    const known = new Set<string>(c.items.map((i: { id: string }) => i.id));
    const cited = new Set(en.flatMap((b) => b.item_ids));
    const refCited = new Set<string>(
      c.reference.bullets_en.flatMap((b: { item_ids: string[] }) => b.item_ids)
    );
    const lenOk = (t: string) => t.length >= 120 && t.length <= 300;
    return [
      {
        id: c.id,
        valid: true,
        metrics: {
          bilingual: Number(res.bullets_vi.length > 0),
          idValid:
            en.filter(
              (b) =>
                b.item_ids.length > 0 && b.item_ids.every((id) => known.has(id))
            ).length / en.length,
          lengthOk: en.filter((b) => lenOk(b.text)).length / en.length,
          coverage: refCited.size
            ? [...refCited].filter((id) => cited.has(id)).length / refCited.size
            : null,
        },
        output: { bullets_en: en.length, bullets_vi: res.bullets_vi.length },
      },
    ];
  },
  quality: (r) =>
    (r.filter((x) => x.valid).length / Math.max(1, r.length)) *
    (0.3 * (mean(r.map((x) => x.metrics.bilingual)) ?? 0) +
      0.3 * (mean(r.map((x) => x.metrics.idValid)) ?? 0) +
      0.2 * (mean(r.map((x) => x.metrics.lengthOk)) ?? 0) +
      0.2 * (mean(r.map((x) => x.metrics.coverage)) ?? 0)),
};

// ---- cluster / topics ----------------------------------------------------

const clusterStep: StepDef = {
  envVar: "ANYROUTER_MODEL",
  primary: "same-story F1 vs duplicate_of (silver)",
  units: one,
  async run(env, [c]) {
    const clusters = await clusterSimilar(env, c.newItems, c.existing);
    const canonical = c.existing[0].id;
    const predicted = new Set(
      clusters
        .filter((cl) => cl.existing?.includes(canonical))
        .flatMap((cl) => cl.new ?? [])
    );
    const gold = new Set<number>(c.silver.sameStory);
    const tp = [...predicted].filter((i) => gold.has(i)).length;
    return [
      {
        id: c.id,
        valid: true,
        metrics: { tp, fp: predicted.size - tp, fn: gold.size - tp },
        output: clusters,
      },
    ];
  },
  quality: (r) => {
    const sum = (k: string) => r.reduce((a, x) => a + (x.metrics[k] ?? 0), 0);
    const tp = sum("tp");
    const p = tp / Math.max(1, tp + sum("fp"));
    const rc = tp / Math.max(1, tp + sum("fn"));
    return p + rc ? (2 * p * rc) / (p + rc) : 0;
  },
};

const canonicals = (): string[] =>
  JSON.parse(
    readFileSync(path.join(benchDir, "topics-canonicals.json"), "utf-8")
  ) as string[];

const topicsStep: StepDef = {
  envVar: "ANYROUTER_MODEL",
  primary: "canonical mapping accuracy vs topics table (silver)",
  units: (cases) => chunk(cases, 25),
  async run(env, unit, { model }) {
    const names = unit.map((c) => c.name as string);
    const existing = canonicals();
    // Silver targets must be offered, as they are in prod's table.
    for (const c of unit)
      if (
        c.silver.canonical !== c.name &&
        !existing.includes(c.silver.canonical)
      )
        existing.unshift(c.silver.canonical);
    const { content } = await callAnyrouter(
      env,
      [{ role: "user", content: buildTopicMappingPrompt(names, existing) }],
      { json: true, modelSpec: model }
    );
    const mapping = parseTopicMappingResponse(content, names, existing);
    return unit.map((c) => ({
      id: c.id,
      valid: true,
      metrics: { agree: Number(mapping.get(c.name) === c.silver.canonical) },
      output: mapping.get(c.name),
    }));
  },
  quality: (r) => mean(r.map((x) => x.metrics.agree)) ?? 0,
};

export const STEPS: Record<string, StepDef> = {
  score: scoreStep,
  decision: systemOneStep("ANYROUTER_DECISION_MODEL", true),
  jev: systemOneStep("ANYROUTER_JEV_MODEL", false),
  "translate-en-vi": translateEnVi,
  "translate-vi-en": translateViEn,
  review: reviewStep,
  tldr: tldrStep,
  cluster: clusterStep,
  topics: topicsStep,
  "draft-repair": draftRepairStep,
  "rule-extraction": ruleExtractionStep,
  ...REVIEW_QUEUE_STEPS,
};

/** Env pinned to one model for one step; the knowledge stub feeds real
 *  active rules (fixtures/bench/knowledge-rules.json) to glossary reads. */
export function stepEnv(step: string, model: string): Env {
  const rules = JSON.parse(
    readFileSync(path.join(benchDir, "knowledge-rules.json"), "utf-8")
  ) as unknown[];
  const db = stubDb((sql) =>
    /FROM translation_knowledge/i.test(sql) ? rules : []
  );
  const def = STEPS[step];
  const overrides: Partial<Record<ModelVar, string>> = {
    [def.envVar]: model,
  };
  return benchEnv(overrides, db);
}
