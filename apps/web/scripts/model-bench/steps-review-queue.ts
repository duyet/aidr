/**
 * Bench steps for the reader review queue (suggestion, submission) and the
 * JEV panel judges. Each runs the production prompt builder and parser with
 * one model and scores agreement with the production verdict (silver).
 *
 * Nothing from steps.ts is read at module load: steps.ts imports this file.
 */

import {
  JEV_PANEL_ROLE_ENV_KEY,
  jevPanelModelIdentity,
} from "../../worker/jev-panel/config";
import type { JevRole } from "../../worker/jev-panel/core";
import { createJevJudgeExecutor } from "../../worker/jev-panel/executor";
import { CATEGORIES, callAnyrouter, VI_STYLE } from "../../worker/llm";
import {
  buildSubmissionReviewPrompt,
  parseSubmissionVerdict,
  ACCEPT_RATING_THRESHOLD as SUBMISSION_ACCEPT,
} from "../../worker/submissions";
import {
  ACCEPT_RATING_THRESHOLD,
  buildReviewPrompt,
  buildUnifiedReviewPrompt,
  NEEDS_REVIEW_RATING_THRESHOLD,
  parseReviewResponse,
  parseUnifiedVerdict,
  type SuggestionField,
  type SuggestionLang,
} from "../../worker/suggestions";
import { viSystemPrompt } from "../../worker/translation-knowledge";
import type { Case, CaseResult, StepDef } from "./steps";

const one = (cases: Case[]) => cases.map((c) => [c]);

const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Agreement, with unanswered cases counted against the model. */
const agreeQuality = (r: CaseResult[]) =>
  (avg(r.map((x) => x.metrics.agree)) ?? 0) *
  (r.filter((x) => x.valid).length / Math.max(1, r.length));

// ---- suggestion ----------------------------------------------------------

type Status = "accepted" | "needs_review" | "rejected";

/** Per-field path (rateSuggestion's chat fallback in prod). */
async function reviewField(
  env: Parameters<StepDef["run"]>[0],
  c: Case,
  model: string
) {
  const lang = c.lang as SuggestionLang;
  const prompt = buildReviewPrompt(
    c.item.title,
    c.item.summary || undefined,
    lang === "vi" ? c.vi : { title: c.item.title, summary: c.item.summary },
    [{ id: c.id, field: c.field as SuggestionField, suggestion: c.suggestion }],
    lang
  );
  const { content } = await callAnyrouter(
    env,
    [{ role: "user", content: prompt }],
    { json: true, modelSpec: model, task: "review", sensitive: true }
  );
  const v = parseReviewResponse(content).find((x) => x.id === c.id);
  if (!v) return null;
  const status: Status =
    v.valid && v.rating >= ACCEPT_RATING_THRESHOLD ? "accepted" : "rejected";
  return { status, rating: v.rating, note: v.note, edits: 0 };
}

/** Free-form (`field = 'auto'`) path: planUnifiedEdits + the status rules of
 *  reviewUnifiedSuggestion (output guard and panel left out). */
async function reviewUnified(
  env: Parameters<StepDef["run"]>[0],
  c: Case,
  model: string
) {
  const editable: { lang: SuggestionLang; field: SuggestionField }[] = [
    { lang: "vi", field: "title" },
    { lang: "vi", field: "summary" },
  ];
  if (c.item.source_lang !== "vi")
    editable.push({ lang: "en", field: "title" });
  const current = (lang: SuggestionLang, field: SuggestionField) =>
    lang === "en"
      ? field === "title"
        ? c.item.title
        : c.item.summary
      : (c.vi[field] ?? null);
  const prompt = buildUnifiedReviewPrompt(
    {
      sourceLang: c.item.source_lang,
      source: { title: c.item.title, summary: c.item.summary },
      vietnamese: c.vi,
      editable,
    },
    c.suggestion
  );
  const { content } = await callAnyrouter(
    env,
    [
      {
        role: "system",
        content: await viSystemPrompt(
          env,
          VI_STYLE,
          `${c.item.title}\n${c.item.summary}`
        ),
      },
      { role: "user", content: prompt },
    ],
    { json: true, modelSpec: model, task: "review", sensitive: true }
  );
  const v = parseUnifiedVerdict(content, editable, current);
  if (!v) return null;
  const status: Status =
    !v.valid || v.rating < NEEDS_REVIEW_RATING_THRESHOLD
      ? "rejected"
      : v.edits.length === 0 || v.rating < ACCEPT_RATING_THRESHOLD
        ? "needs_review"
        : "accepted";
  return { status, rating: v.rating, note: v.note, edits: v.edits.length };
}

const suggestionStep: StepDef = {
  envVar: "ANYROUTER_TRANSLATE_MODEL",
  primary: "status agreement with translation_suggestions.status (silver)",
  units: one,
  async run(env, [c], { model }) {
    const out =
      c.field === "auto"
        ? await reviewUnified(env, c, model)
        : await reviewField(env, c, model);
    if (!out) return [{ id: c.id, valid: false, metrics: {} }];
    return [
      {
        id: c.id,
        valid: true,
        metrics: {
          agree: Number(out.status === c.silver.status),
          rating: out.rating,
        },
        output: out,
      },
    ];
  },
  quality: agreeQuality,
};

// ---- submission ----------------------------------------------------------

const submissionStep: StepDef = {
  envVar: "ANYROUTER_MODEL",
  primary: "accept/reject agreement with submissions.status (silver)",
  units: one,
  async run(env, [c], { model }) {
    const prompt = buildSubmissionReviewPrompt({
      url: c.url,
      title: c.title,
      note: c.note || undefined,
      ogDescription: c.ogDescription || undefined,
    });
    const { content } = await callAnyrouter(
      env,
      [{ role: "user", content: prompt }],
      { json: true, modelSpec: model, task: "review", sensitive: true }
    );
    const v = parseSubmissionVerdict(content);
    // parseSubmissionVerdict maps garbage to relevance 0; count it invalid.
    const valid = v.note !== "unparseable review response";
    const accepted = v.relevance >= SUBMISSION_ACCEPT;
    return [
      {
        id: c.id,
        valid,
        metrics: valid ? { agree: Number(accepted === c.silver.accepted) } : {},
        output: { relevance: v.relevance, accepted, note: v.note },
      },
    ];
  },
  quality: agreeQuality,
};

// ---- JEV panel judges ----------------------------------------------------

const JUDGE_TIMEOUT_MS = 25_000;

/** One judge seat through the production executor and prompt. Transport
 *  failures (429/402/timeouts) come back as a status, not an exception, so
 *  they show up as invalid cases with `status` in the output. */
function judgeStep(role: JevRole, label: "publish" | "accept"): StepDef {
  return {
    envVar: JEV_PANEL_ROLE_ENV_KEY[role],
    primary: `${role} judge vote agreement with the production ${label} decision (silver; panel never ran in prod)`,
    concreteOnly: true,
    units: one,
    async run(env, [c], { model }) {
      const slot = {
        id: `bench.${role}`,
        role,
        promptKey: `bench.${role}.v1`,
        model: jevPanelModelIdentity(model),
      };
      const categoryOptions = c.shape === "score" ? [...CATEGORIES] : [];
      const execute = createJevJudgeExecutor(env, {
        chains: new Map([[slot.id, [model]]]),
        categoryOptions,
        timeoutMs: JUDGE_TIMEOUT_MS,
        deadlineMs: Date.now() + JUDGE_TIMEOUT_MS,
      });
      const res = await execute({
        phase: "initial",
        round: 0,
        panelId: "model-bench",
        subject: { id: c.id, untrustedContent: JSON.stringify(c.content) },
        slot,
      });
      const j = (res.status === "ok" ? res.judgment : null) as {
        vote?: string;
        score?: number | null;
      } | null;
      const vote = j?.vote;
      // Abstain and malformed votes are non-answers, not disagreement.
      const valid = vote === "support" || vote === "oppose";
      return [
        {
          id: c.id,
          valid,
          metrics: valid
            ? { agree: Number((vote === "support") === c.silver[label]) }
            : {},
          output: {
            status: res.status,
            vote: vote ?? null,
            score: j?.score ?? null,
            served: res.modelIdentity?.id ?? null,
          },
        },
      ];
    },
    quality: agreeQuality,
  };
}

export const REVIEW_QUEUE_STEPS: Record<string, StepDef> = {
  suggestion: suggestionStep,
  submission: submissionStep,
  "judge-relevance": judgeStep("relevance", "publish"),
  "judge-source-quality": judgeStep("source_quality", "publish"),
  "judge-safety": judgeStep("safety", "publish"),
  "judge-translation-fidelity": judgeStep("translation_fidelity", "accept"),
};

/** Dataset file for a step defined here, or undefined. */
export function reviewQueueDataset(step: string): string | undefined {
  if (step === "judge-translation-fidelity") return "judge-translation";
  if (step.startsWith("judge-")) return "judge-score";
  return undefined;
}
