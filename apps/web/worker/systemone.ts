import { IMPORTANCE_RUBRIC } from "./importance-rubric.js";
import { logLlmCall, newLlmCallId } from "./llm.js";
import { sanitizeError } from "./telemetry-safe.js";
import type { Env } from "./types.js";

/** Canonical AnyRouter catalog id. Upstream TypeSafe names (jev-latest,
 * jev-1.13.0, jev-preview) are wire aliases, not the listing id. */
export const JEV_DEFAULT_MODEL = "typesafe/jev";

/** Ordered 0–9 levels for the quality score question.
 * Index is the numeric score (0 thin, 9 primary). */
export const JEV_SCORE_LEVELS = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
] as const;

/** Ordered 1–10 levels for the importance question, matching the
 * IMPORTANCE_BANDS scale the chat rubric uses. */
export const JEV_IMPORTANCE_LEVELS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;

/** One entity tag from a score judgment. `none` means the story has no
 * specific company or model family worth a chip. */
export const JEV_ENTITY_TAGS = [
  "none",
  "openai",
  "anthropic",
  "google",
  "meta",
  "xai",
  "microsoft",
  "amazon",
  "nvidia",
  "deepseek",
] as const;

/** One theme tag from a score judgment. `none` means no theme fits. */
export const JEV_THEME_TAGS = [
  "none",
  "llm",
  "agent",
  "open-source",
  "inference",
  "reasoning",
  "safety",
  "regulation",
  "funding",
  "coding",
] as const;

/** Tag each builder category adds, so a Jev-scored story still carries the
 * theme chip the chat rubric would give it. */
const BUILDER_CATEGORY_TAGS: Record<string, string> = {
  Tools: "devtools",
  Frameworks: "framework",
  Data: "data-engineering",
  "Open Source": "open-source",
};

/** Jev is BYOK-only: the TypeSafe key lives in AnyRouter Dashboard → BYOK,
 *  not in env. This hop never spends AnyRouter credits (0/0). */
export type SystemOneQuestionType = "noul" | "choice" | "score";

/** Choice criteria are an object map on the wire, not an array: AnyRouter's
 * validate-body rejects `string[]` choice criteria with `invalid_questions`
 * ("choice criteria must be a non-empty object map"). Score questions keep
 * the ordered `string[]` levels form. */
export type SystemOneCriteria = string[] | Record<string, string | null>;

export interface SystemOneQuestion {
  type: SystemOneQuestionType;
  instructions: string;
  /** Required for choice (options) and score (ordered levels). */
  criteria?: SystemOneCriteria;
}

export type SystemOneQuestions = Record<string, SystemOneQuestion>;

export interface SystemOneAnswer {
  type: SystemOneQuestionType;
  noul?: number;
  choice?: string;
  /** Level label, or (as Jev sends it) the expected level index. */
  score?: string | number;
  legend?: string[];
  probabilities?: Record<string, number> | number[];
  confidence?: number;
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, SystemOneAnswer>;
  usage: { input_tokens: number; output_tokens: number; cost: number };
  /** `model` above is the served upstream (`jev-1.13.0`); this block names
   * the router id that was requested and the provider (`typesafe-byok`). */
  anyrouter_metadata?: {
    model?: string;
    requestId?: string;
    upstream?: { provider?: string };
  };
}

export interface SystemOneResult {
  answers: Record<string, SystemOneAnswer>;
  inputTokens: number;
  /** Upstream model that answered (`jev-1.13.0`, `fastino/gliner2.5-…`);
   * a router id such as `anyrouter/decision` resolves to one of these. */
  upstreamModel: string;
  /** Upstream provider (`typesafe-byok`, `fastino-byok`), "" when absent. */
  upstreamProvider: string;
}

/** True when a System One answer was served by TypeSafe Jev — the only
 * decider whose score levels match the importance bands. */
export function servedByJev(result: SystemOneResult): boolean {
  if (!/^(?:jev\b|typesafe\/jev\b)/i.test(result.upstreamModel)) return false;
  return !result.upstreamProvider || /typesafe/i.test(result.upstreamProvider);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function jevModelId(env: Env): string {
  const first = (env.ANYROUTER_JEV_MODEL ?? "").split(",")[0]?.trim();
  return first || JEV_DEFAULT_MODEL;
}

/** System One router tried before Jev on score (`anyrouter/decision`), or
 * null when unset so score goes straight to Jev. */
export function decisionModelId(env: Env): string | null {
  const first = (env.ANYROUTER_DECISION_MODEL ?? "").split(",")[0]?.trim();
  return first || null;
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
  questions: SystemOneQuestions,
  task: "review" | "score" = "review",
  model: string = jevModelId(env),
  timeoutMs = 30_000
): Promise<SystemOneResult | null> {
  if (!isSystemOneConfigured(env)) return null;
  if (!questions || Object.keys(questions).length === 0) return null;
  const baseUrl = env.ANYROUTER_BASE_URL || "https://anyrouter.dev/api/v1";
  const attemptStartedAt = Date.now();
  const callId = newLlmCallId();
  let promptChars = 0;
  try {
    promptChars = JSON.stringify(state)?.length ?? 0;
  } catch {
    promptChars = 0;
  }
  const fail = (error: string): null => {
    logLlmCall({
      ts: attemptStartedAt,
      task,
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
      callId,
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
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // AbortSignal.timeout rejects with a TimeoutError whose workerd message
    // does not always say "timeout", so classify by name. Otherwise every
    // slow Jev/decision call is logged as a generic provider error.
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      console.error(`jev systemone request timed out after ${timeoutMs}ms`);
      return fail(`jev systemone request timed out after ${timeoutMs}ms`);
    }
    const safe = sanitizeError(error);
    const message = safe?.message ?? "Provider request failed";
    console.error("jev systemone request failed:", message);
    return fail(`jev systemone request failed: ${message}`);
  }
  // Clone before reading so the original body stays readable if the same
  // Response object is observed again (chat fallback after this hop).
  let bodyRes: Response;
  try {
    bodyRes = res.clone();
  } catch (error) {
    const safe = sanitizeError(error);
    const message = safe?.message ?? "Provider response invalid";
    console.error("jev systemone response unreadable:", message);
    return fail(`jev systemone response unreadable: ${message}`);
  }
  if (!res.ok) {
    // Do not await cancellation: some runtimes keep a cloned body pending
    // until the original response is consumed.  The status is sufficient
    // telemetry, and the provider body is deliberately never read or logged.
    void bodyRes.body?.cancel().catch(() => {});
    console.error("jev systemone request failed:", res.status);
    return fail(`jev systemone request failed: ${res.status}`);
  }
  let data: SystemOneResponse;
  try {
    data = (await bodyRes.json()) as SystemOneResponse;
  } catch (error) {
    const safe = sanitizeError(error);
    const message = safe?.message ?? "Provider returned an invalid response";
    console.error("jev systemone bad JSON:", message);
    return fail(`jev systemone bad JSON: ${message}`);
  }
  if (!data || typeof data !== "object" || !data.answers) {
    console.error("jev systemone response missing answers");
    return fail("jev systemone response missing answers");
  }
  const inputTokens = data.usage?.input_tokens ?? 0;
  const upstreamModel = typeof data.model === "string" ? data.model : "";
  const upstreamProvider = data.anyrouter_metadata?.upstream?.provider ?? "";
  logLlmCall({
    ts: attemptStartedAt,
    task,
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
    callId,
    route:
      upstreamModel && upstreamModel !== model
        ? [model, upstreamModel]
        : [model],
    provider: upstreamProvider || null,
    requestId: data.anyrouter_metadata?.requestId ?? null,
  });
  return {
    answers: data.answers,
    inputTokens,
    upstreamModel,
    upstreamProvider,
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

/** Choice questions must send criteria as a non-empty object map
 * (option -> description|null), never as an array. Descriptions are the
 * question text plus option context; `null` means "no extra description". */
function choiceCriteriaMap(
  options: readonly string[],
  definitions: Readonly<Record<string, string>> = {}
): Record<string, string | null> {
  return Object.fromEntries(
    options.map((option) => [option, definitions[option] ?? null])
  );
}

/** Questions for one story's ranking inputs. Jev returns typed answers,
 * not the free-form tag list the chat rubric writes — one entity and one
 * theme, each allowed to be `none`. */
export function jevScoreQuestions(
  categories: readonly string[],
  builderCategories: readonly string[] = [],
  definitions: Readonly<Record<string, string>> = {},
  categoryRule = ""
): SystemOneQuestions {
  return {
    is_ai_tech: {
      type: "noul",
      instructions:
        "This is genuinely AI or tech news (models, research, products, companies, regulation, or infrastructure), not an unrelated link.",
    },
    importance: {
      type: "score",
      instructions: `How important is this to someone who follows AI news? ${IMPORTANCE_RUBRIC}`,
      criteria: [...JEV_IMPORTANCE_LEVELS],
    },
    quality: {
      type: "score",
      instructions:
        "How source-backed is the writing? 0-4 is a thin duplicate, unnamed blog, or press-release fluff. 5-7 is competent secondary coverage. 8-9 is primary reporting or original research with a named publisher.",
      criteria: [...JEV_SCORE_LEVELS],
    },
    category: {
      type: "choice",
      instructions: "Which single category fits this story?",
      criteria: choiceCriteriaMap(categories, definitions),
    },
    ...(builderCategories.length > 0 && {
      builder: {
        type: "choice" as const,
        instructions:
          `Is this story mainly for AI and data engineers who build with it? Choose none unless the story is mainly about one of these. ${categoryRule}`.trim(),
        criteria: choiceCriteriaMap(["none", ...builderCategories], {
          none: "general AI news, not mainly about tools, frameworks, data engineering, or an open-source code release",
          ...definitions,
        }),
      },
    }),
    entity: {
      type: "choice",
      instructions:
        "Which company or model family is this mainly about? Choose none if no specific one stands out.",
      criteria: choiceCriteriaMap(JEV_ENTITY_TAGS),
    },
    theme: {
      type: "choice",
      instructions: "Which theme fits best? Choose none if nothing fits.",
      criteria: choiceCriteriaMap(JEV_THEME_TAGS),
    },
  };
}

export interface JevScoreJudgment {
  relevance: number;
  importance: number;
  quality: number;
  category: string;
  tags: string[];
}

function choiceOf(
  answers: Record<string, SystemOneAnswer>,
  id: string,
  options: readonly string[]
): string {
  const a = answers[id];
  if (!a || options.length === 0) return "";
  if (typeof a.choice === "string") {
    const exact = options.find((option) => option === a.choice);
    if (exact) return exact;
    const folded = options.find(
      (option) => option.toLowerCase() === a.choice?.toLowerCase()
    );
    if (folded) return folded;
  }
  const probs = a.probabilities;
  if (Array.isArray(probs) && probs.length === options.length) {
    let best = -1;
    let bestIdx = 0;
    for (let i = 0; i < probs.length; i++) {
      const v = typeof probs[i] === "number" ? probs[i] : 0;
      if (v > best) {
        best = v;
        bestIdx = i;
      }
    }
    return options[bestIdx] ?? "";
  }
  if (probs && typeof probs === "object" && !Array.isArray(probs)) {
    let best = -1;
    let bestKey = "";
    for (const [key, value] of Object.entries(probs)) {
      if (typeof value === "number" && value > best) {
        best = value;
        bestKey = key;
      }
    }
    const exact = options.find((option) => option === bestKey);
    if (exact) return exact;
  }
  return "";
}

/** Index on an ordered score scale, or null when the answer is unusable.
 * Prefer the level string so 0–9 stays an integer (scoreNorm is a 0–1 ratio). */
function scoreLevelIndex(
  answers: Record<string, SystemOneAnswer>,
  id: string,
  levels: readonly string[]
): number | null {
  const a = answers[id];
  if (a && typeof a.score === "string") {
    const idx = levels.indexOf(a.score);
    if (idx >= 0) return idx;
  }
  const norm = scoreNorm(answers, id, [...levels]);
  if (norm === null || levels.length < 2) return null;
  return Math.round(norm * (levels.length - 1));
}

/** Importance on the 1–10 scale as the probability-weighted level, not the
 * single most likely one: argmax over bare levels piled stories onto 1–2 and
 * 4 and almost never reached 9. Monotonic in the distribution and spans the
 * full range (all mass on the first level → 1, on the last → 10). Jev also
 * sends `score` as that expected index (a number), used when probabilities
 * are absent. Probability keys are level indices, not labels. */
export function importanceFromJev(
  answers: Record<string, SystemOneAnswer>
): number | null {
  const a = answers.importance;
  if (!a) return null;
  const top = JEV_IMPORTANCE_LEVELS.length - 1;
  const toScale = (index: number) =>
    Number((1 + Math.min(top, Math.max(0, index))).toFixed(2));
  const probs = a.probabilities;
  const entries: [number, number][] = Array.isArray(probs)
    ? probs.map((p, i) => [i, p])
    : probs && typeof probs === "object"
      ? Object.entries(probs).map(([k, p]) => [Number(k), p])
      : [];
  let mass = 0;
  let weighted = 0;
  for (const [index, p] of entries) {
    if (!Number.isInteger(index) || index < 0 || index > top) continue;
    if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) continue;
    mass += p;
    weighted += index * p;
  }
  if (mass > 0) return toScale(weighted / mass);
  const score = a.score;
  if (typeof score === "number" && Number.isFinite(score)) {
    return score >= 0 && score <= top ? toScale(score) : null;
  }
  if (typeof score === "string") {
    const index = JEV_IMPORTANCE_LEVELS.indexOf(
      score as (typeof JEV_IMPORTANCE_LEVELS)[number]
    );
    if (index >= 0) return toScale(index);
  }
  return null;
}

/** Map one System One score response onto the ranking inputs.
 * Returns null when relevance, importance, or quality is missing so the
 * caller can fall back to the chat rubric for that item. */
export function scoreJudgmentFromJev(
  answers: Record<string, SystemOneAnswer>,
  categories: readonly string[],
  builderCategories: readonly string[] = []
): JevScoreJudgment | null {
  const relevance = noulProb(answers, "is_ai_tech");
  const importance = importanceFromJev(answers);
  const quality = scoreLevelIndex(answers, "quality", JEV_SCORE_LEVELS);
  if (relevance === null || importance === null || quality === null) {
    return null;
  }
  // A builder pick is the more specific category, so it wins over the core one.
  const builderPick = builderCategories.length
    ? choiceOf(answers, "builder", ["none", ...builderCategories])
    : "";
  const builder = builderPick === "none" ? "" : builderPick;
  const category = builder || choiceOf(answers, "category", categories);
  const tags = [
    choiceOf(answers, "entity", JEV_ENTITY_TAGS),
    choiceOf(answers, "theme", JEV_THEME_TAGS),
    BUILDER_CATEGORY_TAGS[builder] ?? "",
  ].filter((tag, i, all) => tag && tag !== "none" && all.indexOf(tag) === i);
  return { relevance, importance, quality, category, tags };
}
