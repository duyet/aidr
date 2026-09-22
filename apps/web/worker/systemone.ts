import { logLlmCall } from "./llm.js";
import type { Env } from "./types.js";

/** Default Jev model id. Aliases: typesafe/jev-preview, typesafe/jev-1.13.0. */
export const JEV_DEFAULT_MODEL = "typesafe/jev-latest";

/** Jev is BYOK-only: the TypeSafe key lives in AnyRouter Dashboard → BYOK,
 *  not in env. This hop never spends AnyRouter credits (0/0). */
export type SystemOneQuestionType = "noul" | "choice" | "score";

export interface SystemOneQuestion {
  type: SystemOneQuestionType;
  instructions: string;
  /** Required for choice (options) and score (ordered levels). */
  criteria?: string[];
}

export type SystemOneQuestions = Record<string, SystemOneQuestion>;

export interface SystemOneAnswer {
  type: SystemOneQuestionType;
  noul?: number;
  choice?: string;
  score?: string;
  legend?: string[];
  probabilities?: Record<string, number> | number[];
  confidence?: number;
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, SystemOneAnswer>;
  usage: { input_tokens: number; output_tokens: number; cost: number };
}

export interface SystemOneResult {
  answers: Record<string, SystemOneAnswer>;
  inputTokens: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function jevModelId(env: Env): string {
  const first = (env.ANYROUTER_JEV_MODEL ?? "").split(",")[0]?.trim();
  return first || JEV_DEFAULT_MODEL;
}

/** False when no AnyRouter key is present — caller must use chat fallback. */
export function isSystemOneConfigured(env: Env): boolean {
  return Boolean(env.ANYROUTER_API_KEY);
}

/**
 * POST /api/v1/systemone — TypeSafe System One decisions.
 * Returns null on any failure (unconfigured, non-2xx, bad shape) so the
 * caller can fall back to the existing chat-completions review path.
 * Never throws for transport-level Jev outages.
 */
export async function callSystemOne(
  env: Env,
  state: string | object | unknown[],
  questions: SystemOneQuestions
): Promise<SystemOneResult | null> {
  if (!isSystemOneConfigured(env)) return null;
  if (!questions || Object.keys(questions).length === 0) return null;
  const baseUrl = env.ANYROUTER_BASE_URL || "https://anyrouter.dev/api/v1";
  const model = jevModelId(env);
  const attemptStartedAt = Date.now();
  let promptChars = 0;
  try {
    promptChars = JSON.stringify(state)?.length ?? 0;
  } catch {
    promptChars = 0;
  }
  const fail = (error: string): null => {
    logLlmCall({
      ts: attemptStartedAt,
      task: "review",
      model,
      ok: false,
      tokens: 0,
      promptTokens: null,
      completionTokens: null,
      cachedTokens: null,
      durationMs: Date.now() - attemptStartedAt,
      error,
      promptChars,
      responseSnippet: null,
    });
    return null;
  };
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/systemone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ANYROUTER_API_KEY}`,
        "HTTP-Referer": "https://aidr.today",
        "X-Title": "AI;DR",
        "X-AnyRouter-Title": "AI;DR",
        "X-AnyRouter-Source": "web-app",
        "X-AnyRouter-Categories": "writing-assistant",
      },
      body: JSON.stringify({
        state,
        model,
        questions,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("jev systemone request failed:", message);
    return fail(message);
  }
  if (!res.ok) {
    const message = `jev systemone request failed: ${res.status} ${await res.text()}`;
    console.error(message);
    return fail(message);
  }
  let data: SystemOneResponse;
  try {
    data = (await res.json()) as SystemOneResponse;
  } catch (error) {
    const message = `jev systemone bad JSON: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    return fail(message);
  }
  if (!data || typeof data !== "object" || !data.answers) {
    console.error("jev systemone response missing answers");
    return fail("jev systemone response missing answers");
  }
  const inputTokens = data.usage?.input_tokens ?? 0;
  logLlmCall({
    ts: attemptStartedAt,
    task: "review",
    model,
    ok: true,
    tokens: inputTokens,
    promptTokens: inputTokens,
    completionTokens: null,
    cachedTokens: null,
    durationMs: Date.now() - attemptStartedAt,
    error: null,
    promptChars,
    responseSnippet: null,
  });
  return {
    answers: data.answers,
    inputTokens,
  };
}

/** Extracts a noul probability in [0,1]; null when absent/unusable. */
export function noulProb(
  answers: Record<string, SystemOneAnswer>,
  id: string
): number | null {
  const a = answers[id];
  if (!a || typeof a.noul !== "number" || !Number.isFinite(a.noul)) return null;
  return clamp01(a.noul);
}

/**
 * Normalizes a score answer to [0,1] by criteria index:
 * first level → 0, last level → 1. Falls back to probabilities max when
 * score string is missing but a distribution is present.
 */
export function scoreNorm(
  answers: Record<string, SystemOneAnswer>,
  id: string,
  criteria: string[]
): number | null {
  const a = answers[id];
  if (!a) return null;
  if (typeof a.score === "string" && criteria.length > 1) {
    const idx = criteria.indexOf(a.score);
    if (idx >= 0) return idx / (criteria.length - 1);
  }
  const probs = a.probabilities;
  if (Array.isArray(probs) && probs.length === criteria.length) {
    let best = 0;
    let bestIdx = 0;
    for (let i = 0; i < probs.length; i++) {
      const v = typeof probs[i] === "number" ? (probs[i] as number) : 0;
      if (v > best) {
        best = v;
        bestIdx = i;
      }
    }
    return bestIdx / (criteria.length - 1);
  }
  if (probs && typeof probs === "object") {
    let best = -1;
    let bestKey = "";
    for (const [k, v] of Object.entries(probs)) {
      if (typeof v === "number" && v > best) {
        best = v;
        bestKey = k;
      }
    }
    const idx = criteria.indexOf(bestKey);
    if (idx >= 0) return idx / (criteria.length - 1);
  }
  return null;
}

/** Submission intent gate: relevance from P(ai_tech) discounted by P(spam). */
export function submissionRelevanceFromJev(
  answers: Record<string, SystemOneAnswer>
): { relevance: number; note: string } | null {
  const aiTech = noulProb(answers, "is_ai_tech");
  const spam = noulProb(answers, "is_spam");
  if (aiTech === null || spam === null) return null;
  const relevance = clamp01(aiTech * (1 - spam));
  return {
    relevance,
    note: `jev ai_tech=${aiTech.toFixed(2)} spam=${spam.toFixed(2)}`,
  };
}

export const SUGGESTION_QUALITY_LEVELS = [
  "reject",
  "weak",
  "good",
  "excellent",
] as const;

/** Suggestion intent gate: valid when P(improvement) clears 0.6. */
export function suggestionVerdictFromJev(
  answers: Record<string, SystemOneAnswer>
): { valid: boolean; rating: number; note: string } | null {
  const improvement = noulProb(answers, "is_improvement");
  if (improvement === null) return null;
  const quality =
    scoreNorm(answers, "quality", [...SUGGESTION_QUALITY_LEVELS]) ??
    improvement;
  const rating = clamp01((improvement + quality) / 2);
  return {
    valid: improvement >= 0.6,
    rating,
    note: `jev improvement=${improvement.toFixed(2)} quality=${quality.toFixed(2)}`,
  };
}
