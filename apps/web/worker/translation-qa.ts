/**
 * Runtime orchestration for the independent translation semantic review.
 *
 * Pure validation/prompt/semantic rules live in translation-review.ts. This
 * module owns D1 schema gating, explicit source/target pair creation, leases,
 * compare-and-set writes, bounded retries, and immutable provenance.
 */
import { nn } from "./d1-bind.js";
import { sha256Hex } from "./hash.js";
import { callAnyrouter, VI_STYLE } from "./llm.js";
import {
  buildEnglishCandidatePrompt,
  buildTranslationRepairPrompt,
  buildTranslationReviewPrompt,
  detectHardSemanticFailures,
  directionFor,
  hashTranslationPair,
  parseRepairCandidate,
  parseTranslationReview,
  QA_CAP,
  QA_CONFIDENCE_THRESHOLD,
  QA_LEASE_SECONDS,
  QA_MAX_CALLS,
  QA_MAX_JSON_CHARS,
  QA_MAX_REPAIR_ATTEMPTS,
  QA_MAX_RETRY_ATTEMPTS,
  QA_REPAIR_TIMEOUT_MS,
  QA_REVIEW_TIMEOUT_MS,
  QA_SCAN_CAP,
  QA_WALL_BUDGET_MS,
  REVIEW_CRITERIA_VERSION,
  REVIEW_POLICY_FINGERPRINT,
  REVIEW_PROMPT_FINGERPRINT,
  REVIEW_SYSTEM_PROMPT,
  reviewPasses,
  type TranslationDirection,
  type TranslationLanguage,
  type TranslationPair,
  type TranslationReview,
  type TranslationReviewDecision,
  type TranslationSemanticCheck,
  type TranslationText,
} from "./translation-review.js";
import type { Env } from "./types.js";

export type {
  TranslationDirection,
  TranslationLanguage,
  TranslationPair,
  TranslationReview,
  TranslationReviewDecision,
  TranslationSemanticCheck,
  TranslationText,
} from "./translation-review.js";
export {
  buildTranslationRepairPrompt,
  buildTranslationReviewPrompt,
  canonicalTranslationText,
  detectHardSemanticFailures,
  directionFor,
  hashTranslationPair,
  normalizeTranslationText,
  parseExactJson,
  parseRepairCandidate,
  parseTranslationReview,
  QA_CAP,
  QA_CONFIDENCE_THRESHOLD,
  QA_LEASE_SECONDS,
  QA_MAX_CALLS,
  QA_MAX_JSON_CHARS,
  QA_MAX_REPAIR_ATTEMPTS,
  QA_MAX_RETRY_ATTEMPTS,
  QA_MAX_REVIEW_CALLS,
  QA_RATING_THRESHOLD,
  QA_SCAN_CAP,
  REVIEW_CRITERIA_VERSION,
  REVIEW_POLICY_FINGERPRINT,
  REVIEW_PROMPT_FINGERPRINT,
  reviewPasses,
  SEMANTIC_CHECKS,
} from "./translation-review.js";

const QA_MAX_MODEL_ATTEMPTS = 2;
const REVIEW_SCHEMA_QUERIES = [
  "SELECT qa_candidate_hash, qa_source_revision, source_lang, target_lang FROM translations LIMIT 0",
  "SELECT source_lang, source_revision FROM items LIMIT 0",
  "SELECT attempt_id FROM translation_review_attempts LIMIT 0",
  "SELECT state_id FROM translation_review_state LIMIT 0",
  "SELECT resolution_id FROM translation_review_resolutions LIMIT 0",
];

export const QA_CRITERIA_VERSION = REVIEW_CRITERIA_VERSION;

/** Compatibility name retained for callers; it accepts explicit metadata only
 * and never inspects diacritics. */
export function inferTranslationDirection(
  sourceLang:
    | TranslationLanguage
    | { source_lang?: string; target_lang?: string },
  targetLang?: TranslationLanguage
): TranslationDirection | null {
  if (typeof sourceLang === "string") {
    return targetLang ? directionFor(sourceLang, targetLang) : null;
  }
  if (sourceLang.source_lang === "en" || sourceLang.source_lang === "vi") {
    if (sourceLang.target_lang !== "en" && sourceLang.target_lang !== "vi") {
      return null;
    }
    return directionFor(sourceLang.source_lang, sourceLang.target_lang);
  }
  return null;
}

export class TranslationReviewSchemaError extends Error {
  readonly code = "TRANSLATION_REVIEW_SCHEMA_MISSING";

  constructor(cause?: unknown) {
    super(
      "translation review schema is unavailable; apply migrations 0023 and 0025 before running QA",
      { cause }
    );
    this.name = "TranslationReviewSchemaError";
  }
}

/** A missing 0023/0025 schema must fail before any pending-row query. This
 *  prevents a pre-migration database from looking like an empty QA queue. */
export async function assertTranslationReviewSchema(
  db: D1Database
): Promise<void> {
  try {
    for (const query of REVIEW_SCHEMA_QUERIES) await db.prepare(query).all();
  } catch (error) {
    throw new TranslationReviewSchemaError(error);
  }
}

export interface QaRow {
  id: string;
  source_title: string;
  source_summary: string | null;
  source_lang: TranslationLanguage;
  source_revision: number;
  lang: TranslationLanguage;
  target_lang: TranslationLanguage;
  candidate_title: string;
  candidate_summary: string;
}

function boundedLimit(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

export function buildPendingQaQuery(limit = QA_CAP): string {
  const safeLimit = boundedLimit(limit, QA_CAP, QA_SCAN_CAP);
  return `SELECT t.item_id AS id,
                  i.title AS source_title, i.summary AS source_summary,
                  i.source_lang AS source_lang, i.source_revision AS source_revision,
                  t.lang AS lang, t.target_lang AS target_lang,
                  t.title AS candidate_title, t.summary AS candidate_summary
           FROM translations t
           JOIN items i ON i.id = t.item_id
           WHERE t.qa_candidate_hash IS NULL
             AND t.title IS NOT NULL AND t.title != ''
             AND t.summary IS NOT NULL AND t.summary != ''
             AND t.source_lang IN ('en', 'vi')
             AND t.target_lang IN ('en', 'vi')
             AND i.source_lang = t.source_lang
           ORDER BY i.published_at DESC
           LIMIT ${safeLimit}`;
}

export function buildEnglishCandidateQuery(limit = QA_CAP): string {
  const safeLimit = boundedLimit(limit, QA_CAP, QA_SCAN_CAP);
  return `SELECT i.id, i.title AS source_title, i.summary AS source_summary,
                  i.source_lang AS source_lang, i.source_revision AS source_revision
           FROM items i
           WHERE i.status = 'published' AND i.source_lang = 'vi'
             AND NOT EXISTS (
               SELECT 1 FROM translations t
               WHERE t.item_id = i.id AND t.lang = 'en'
                 AND t.source_lang = 'vi' AND t.target_lang = 'en'
                 AND t.title IS NOT NULL AND t.title != ''
                 AND t.summary IS NOT NULL AND t.summary != ''
             )
           ORDER BY i.published_at DESC
           LIMIT ${safeLimit}`;
}

function parseModelChain(spec: string | undefined): string[] {
  return (spec ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

export interface ReviewerChainResolution {
  chain: string[];
  spec: string | null;
  reason: string;
}

/** Explicit reviewer config is disjoint from every configured generator id. */
export function resolveIndependentReviewerChain(
  env: Pick<
    Env,
    | "ANYROUTER_MODEL"
    | "ANYROUTER_TRANSLATE_MODEL"
    | "ANYROUTER_ENGLISH_TRANSLATE_MODEL"
    | "ANYROUTER_QA_MODEL"
    | "ANYROUTER_REVIEW_MODEL"
  >
): ReviewerChainResolution {
  const configured = env.ANYROUTER_REVIEW_MODEL?.trim()
    ? env.ANYROUTER_REVIEW_MODEL
    : env.ANYROUTER_QA_MODEL;
  const requested = [...new Set(parseModelChain(configured))];
  if (requested.length === 0) {
    return {
      chain: [],
      spec: null,
      reason: "ANYROUTER_REVIEW_MODEL is not configured",
    };
  }
  const generator = new Set([
    ...parseModelChain(env.ANYROUTER_TRANSLATE_MODEL || env.ANYROUTER_MODEL),
    ...parseModelChain(env.ANYROUTER_ENGLISH_TRANSLATE_MODEL),
  ]);
  const chain = requested
    .filter((model) => model !== "anyrouter/auto" && !generator.has(model))
    .slice(0, QA_MAX_MODEL_ATTEMPTS);
  if (chain.length === 0) {
    return {
      chain: [],
      spec: null,
      reason: "configured translation reviewer overlaps the generator chain",
    };
  }
  return { chain, spec: chain.join(","), reason: "" };
}

export function resolveEnglishGeneratorChain(
  env: Pick<Env, "ANYROUTER_ENGLISH_TRANSLATE_MODEL">
): string | null {
  const chain = [
    ...new Set(
      parseModelChain(env.ANYROUTER_ENGLISH_TRANSLATE_MODEL)
        .filter((model) => model !== "anyrouter/auto")
        .slice(0, QA_MAX_MODEL_ATTEMPTS)
    ),
  ];
  return chain.length > 0 ? chain.join(",") : null;
}

function dbSummary(value: string | null): string | null {
  return value;
}

function normalizedText(text: string, summary: string | null): TranslationText {
  return { title: text.trim(), summary: (summary ?? "").trim() };
}

interface PreparedCandidate {
  row: QaRow;
  pair: TranslationPair;
  sourceHash: string;
  candidateHash: string;
  stateId: string;
}

async function stateIdFor(candidate: {
  row: QaRow;
  direction: TranslationDirection;
  sourceHash: string;
  candidateHash: string;
}): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      itemId: candidate.row.id,
      lang: candidate.row.lang,
      sourceLang: candidate.row.source_lang,
      targetLang: candidate.row.target_lang,
      direction: candidate.direction,
      sourceHash: candidate.sourceHash,
      candidateHash: candidate.candidateHash,
    })
  );
}

function sourceExistsSql(itemAlias = "i"): string {
  return `EXISTS (
    SELECT 1 FROM items ${itemAlias}
     WHERE ${itemAlias}.id = ?
       AND ${itemAlias}.title IS ?
       AND ${itemAlias}.summary IS ?
       AND ${itemAlias}.source_revision = ?
  )`;
}

const STATE_CLAIM_SQL = `INSERT INTO translation_review_state (
  state_id, item_id, lang, source_lang, target_lang, direction,
  source_hash, candidate_hash, source_revision, decision, attempt_id,
  attempt_count, terminal, next_retry_at, lease_token, lease_until,
  created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 1, 0, ?, ?, ?, ?, ?)
ON CONFLICT(state_id) DO UPDATE SET
  attempt_count = translation_review_state.attempt_count + 1,
  lease_token = excluded.lease_token,
  lease_until = excluded.lease_until,
  next_retry_at = NULL,
  updated_at = excluded.updated_at
WHERE translation_review_state.terminal = 0
  AND translation_review_state.attempt_count < ?
  AND (translation_review_state.lease_until IS NULL OR translation_review_state.lease_until < ?)
  AND (translation_review_state.next_retry_at IS NULL OR translation_review_state.next_retry_at <= ?)`;

async function claimState(
  db: D1Database,
  candidate: PreparedCandidate,
  leaseToken: string,
  now: number
): Promise<{ claimed: boolean; attemptCount: number }> {
  const leaseUntil = now + QA_LEASE_SECONDS;
  // A crashed final attempt must not leave a permanently unclaimable row.
  await db
    .prepare(
      `UPDATE translation_review_state
          SET decision = 'human_review', terminal = 1, next_retry_at = NULL,
              lease_token = NULL, lease_until = NULL, updated_at = ?
        WHERE state_id = ? AND terminal = 0 AND attempt_count >= ?`
    )
    .bind(now, candidate.stateId, QA_MAX_RETRY_ATTEMPTS)
    .run();
  const result = await db
    .prepare(STATE_CLAIM_SQL)
    .bind(
      candidate.stateId,
      candidate.row.id,
      candidate.row.lang,
      candidate.row.source_lang,
      candidate.row.target_lang,
      candidate.pair.direction,
      candidate.sourceHash,
      candidate.candidateHash,
      candidate.row.source_revision,
      now,
      leaseToken,
      leaseUntil,
      now,
      now,
      QA_MAX_RETRY_ATTEMPTS,
      now,
      now
    )
    .run();
  if ((result.meta?.changes ?? 0) === 0)
    return { claimed: false, attemptCount: 0 };
  const state = await db
    .prepare(
      "SELECT attempt_count FROM translation_review_state WHERE state_id = ? AND lease_token = ?"
    )
    .bind(candidate.stateId, leaseToken)
    .first<{ attempt_count: number }>();
  return { claimed: true, attemptCount: state?.attempt_count ?? 1 };
}

interface AttemptInput {
  candidate: PreparedCandidate;
  stateId: string;
  attemptId: string;
  attemptCount: number;
  round: number;
  phase: "initial" | "repair" | "re_review" | "resolution";
  decision: TranslationReviewDecision;
  review: TranslationReview | null;
  hardFailures: TranslationSemanticCheck[];
  reason: string;
  reviewerChain: string;
  reviewerModel: string | null;
  repairModel: string | null;
  modelFingerprint: string;
  now: number;
}

const ATTEMPT_INSERT_SQL = `INSERT OR IGNORE INTO translation_review_attempts (
  attempt_id, state_id, item_id, lang, source_lang, target_lang, direction,
  source_hash, candidate_hash, source_revision, attempt_number, round, phase,
  criteria_fingerprint, prompt_fingerprint, policy_fingerprint, model_fingerprint,
  decision, fidelity, naturalness, confidence, hard_failures, reason,
  reviewer_chain, reviewer_model, repair_model, created_at
)
SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
WHERE ${sourceExistsSql()}`;

function prepareAttemptInsert(
  db: D1Database,
  input: AttemptInput
): D1PreparedStatement {
  const review = input.review;
  return db
    .prepare(ATTEMPT_INSERT_SQL)
    .bind(
      input.attemptId,
      input.stateId,
      input.candidate.row.id,
      input.candidate.row.lang,
      input.candidate.row.source_lang,
      input.candidate.row.target_lang,
      input.candidate.pair.direction,
      input.candidate.sourceHash,
      input.candidate.candidateHash,
      input.candidate.row.source_revision,
      input.attemptCount,
      input.round,
      input.phase,
      REVIEW_CRITERIA_VERSION,
      REVIEW_PROMPT_FINGERPRINT,
      REVIEW_POLICY_FINGERPRINT,
      input.modelFingerprint,
      input.decision,
      nn(review?.fidelity ?? null),
      nn(review?.naturalness ?? null),
      nn(review?.confidence ?? null),
      JSON.stringify(input.hardFailures),
      input.reason.slice(0, 500),
      input.reviewerChain,
      nn(input.reviewerModel),
      nn(input.repairModel),
      input.now,
      input.candidate.row.id,
      input.candidate.row.source_title,
      dbSummary(input.candidate.row.source_summary),
      input.candidate.row.source_revision
    );
}

function prepareStateUpdate(
  db: D1Database,
  input: {
    candidate: PreparedCandidate;
    leaseToken: string;
    attemptId: string;
    decision: string;
    terminal: boolean;
    nextRetryAt: number | null;
    now: number;
    replacementText?: TranslationText;
  }
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE translation_review_state SET
         decision = ?, attempt_id = ?, terminal = ?, next_retry_at = ?,
         lease_token = NULL, lease_until = NULL, updated_at = ?
       WHERE state_id = ? AND lease_token = ?
         AND source_revision = ? AND source_hash = ? AND candidate_hash = ?
         AND (
           EXISTS (
             SELECT 1 FROM translations t
              WHERE t.item_id = ? AND t.lang = ? AND t.source_lang = ? AND t.target_lang = ?
                AND t.title = ? AND t.summary = ?
           )
           OR EXISTS (
             SELECT 1 FROM translations t
              WHERE t.item_id = ? AND t.lang = ? AND t.source_lang = ? AND t.target_lang = ?
                AND t.title = ? AND t.summary = ?
           )
         )
         AND ${sourceExistsSql()}`
    )
    .bind(
      input.decision,
      input.attemptId,
      input.terminal ? 1 : 0,
      nn(input.nextRetryAt),
      input.now,
      input.candidate.stateId,
      input.leaseToken,
      input.candidate.row.source_revision,
      input.candidate.sourceHash,
      input.candidate.candidateHash,
      input.candidate.row.id,
      input.candidate.row.lang,
      input.candidate.row.source_lang,
      input.candidate.row.target_lang,
      input.candidate.row.candidate_title,
      input.candidate.row.candidate_summary,
      input.candidate.row.id,
      input.candidate.row.lang,
      input.candidate.row.source_lang,
      input.candidate.row.target_lang,
      input.replacementText?.title ?? input.candidate.row.candidate_title,
      input.replacementText?.summary ?? input.candidate.row.candidate_summary,
      input.candidate.row.id,
      input.candidate.row.source_title,
      dbSummary(input.candidate.row.source_summary),
      input.candidate.row.source_revision
    );
}

function prepareMarkerUpdate(
  db: D1Database,
  input: {
    candidate: PreparedCandidate;
    candidateText: TranslationText;
    sourceHash: string;
    candidateHash: string;
    naturalness: number;
    reviewerModel: string | null;
    now: number;
    replacement?: boolean;
  }
): D1PreparedStatement {
  const prefix = input.replacement ? "title = ?, summary = ?, " : "";
  const values = input.replacement
    ? [input.candidateText.title, input.candidateText.summary]
    : [];
  return db
    .prepare(
      `UPDATE translations SET
         ${prefix}qa_rating = ?, qa_at = ?,
         qa_source_hash = ?, qa_candidate_hash = ?, qa_source_revision = ?,
         qa_direction = ?, qa_reviewer_model = ?, qa_criteria_version = ?
       WHERE item_id = ? AND lang = ? AND source_lang = ? AND target_lang = ?
         AND title = ? AND summary = ?
         AND ${sourceExistsSql()}`
    )
    .bind(
      ...values,
      input.naturalness,
      input.now,
      input.sourceHash,
      input.candidateHash,
      input.candidate.row.source_revision,
      input.candidate.pair.direction,
      nn(input.reviewerModel),
      REVIEW_CRITERIA_VERSION,
      input.candidate.row.id,
      input.candidate.row.lang,
      input.candidate.row.source_lang,
      input.candidate.row.target_lang,
      input.candidate.row.candidate_title,
      input.candidate.row.candidate_summary,
      input.candidate.row.id,
      input.candidate.row.source_title,
      dbSummary(input.candidate.row.source_summary),
      input.candidate.row.source_revision
    );
}

export function translationRetryDelaySeconds(attemptCount: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, attemptCount - 1));
}

async function modelFingerprint(
  reviewerChain: string,
  reviewerModel: string | null
): Promise<string> {
  return sha256Hex(`${reviewerChain}|${reviewerModel ?? "none"}`);
}

async function attemptIdFor(input: {
  candidate: PreparedCandidate;
  attemptCount: number;
  round: number;
  phase: AttemptInput["phase"];
  fingerprint: string;
}): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      stateId: input.candidate.stateId,
      sourceHash: input.candidate.sourceHash,
      candidateHash: input.candidate.candidateHash,
      sourceRevision: input.candidate.row.source_revision,
      criteria: REVIEW_CRITERIA_VERSION,
      prompt: REVIEW_PROMPT_FINGERPRINT,
      policy: REVIEW_POLICY_FINGERPRINT,
      attemptCount: input.attemptCount,
      round: input.round,
      phase: input.phase,
      fingerprint: input.fingerprint,
    })
  );
}

async function finishWithMarker(
  db: D1Database,
  input: {
    candidate: PreparedCandidate;
    leaseToken: string;
    attempt: AttemptInput;
    decision: TranslationReviewDecision;
    terminal: boolean;
    nextRetryAt: number | null;
    candidateText: TranslationText;
    sourceHash: string;
    candidateHash: string;
    naturalness: number;
    reviewerModel: string | null;
    replacement?: boolean;
    additionalAttempts?: AttemptInput[];
  }
): Promise<boolean> {
  const marker = prepareMarkerUpdate(db, {
    candidate: input.candidate,
    candidateText: input.candidateText,
    sourceHash: input.sourceHash,
    candidateHash: input.candidateHash,
    naturalness: input.naturalness,
    reviewerModel: input.reviewerModel,
    now: input.attempt.now,
    replacement: input.replacement,
  });
  const state = prepareStateUpdate(db, {
    candidate: input.candidate,
    leaseToken: input.leaseToken,
    attemptId: input.attempt.attemptId,
    decision: input.decision,
    terminal: input.terminal,
    nextRetryAt: input.nextRetryAt,
    now: input.attempt.now,
    replacementText: input.replacement ? input.candidateText : undefined,
  });
  const results = await db.batch([
    prepareAttemptInsert(db, input.attempt),
    marker,
    state,
    ...(input.additionalAttempts ?? []).map((attempt) =>
      prepareAttemptInsert(db, attempt)
    ),
  ]);
  return (
    (results[1]?.meta?.changes ?? 0) === 1 &&
    (results[2]?.meta?.changes ?? 0) === 1
  );
}

async function finishFailure(
  db: D1Database,
  input: {
    candidate: PreparedCandidate;
    leaseToken: string;
    attempt: AttemptInput;
    attemptCount: number;
    reason: string;
    terminal: boolean;
  }
): Promise<boolean> {
  const now = input.attempt.now;
  const nextRetryAt = input.terminal
    ? null
    : now + translationRetryDelaySeconds(input.attemptCount);
  const state = prepareStateUpdate(db, {
    candidate: input.candidate,
    leaseToken: input.leaseToken,
    attemptId: input.attempt.attemptId,
    decision: input.terminal ? "human_review" : "review_failed",
    terminal: input.terminal,
    nextRetryAt,
    now,
  });
  const results = await db.batch([
    prepareAttemptInsert(db, input.attempt),
    state,
  ]);
  return (results[1]?.meta?.changes ?? 0) === 1;
}

async function requestReview(
  env: Env,
  pair: TranslationPair,
  reviewerSpec: string,
  timeoutMs: number
): Promise<{ review: TranslationReview; model: string; tokens: number }> {
  const result = await callAnyrouter(
    env,
    [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: buildTranslationReviewPrompt(pair) },
    ],
    {
      json: true,
      modelSpec: reviewerSpec,
      task: "review",
      timeoutMs,
      maxTokens: 1_024,
      accept: (content) =>
        parseTranslationReview(content, pair.direction) !== null,
      strictOutput: true,
      maxOutputChars: QA_MAX_JSON_CHARS * 2,
    }
  );
  const review = parseTranslationReview(result.content, pair.direction);
  if (!review) throw new Error("review output failed strict v2 validation");
  return { review, model: result.model, tokens: result.tokens };
}

async function requestRepair(
  env: Env,
  pair: TranslationPair,
  review: TranslationReview,
  hardFailures: TranslationSemanticCheck[],
  generatorSpec: string,
  timeoutMs: number
): Promise<{ candidate: TranslationText; model: string; tokens: number }> {
  const result = await callAnyrouter(
    env,
    [
      { role: "system", content: VI_STYLE },
      {
        role: "user",
        content: buildTranslationRepairPrompt(pair, review, hardFailures),
      },
    ],
    {
      json: true,
      modelSpec: generatorSpec,
      task: "translate",
      timeoutMs,
      maxTokens: 2_048,
      accept: (content) => parseRepairCandidate(content) !== null,
      sensitive: true,
      strictOutput: true,
      maxOutputChars: QA_MAX_JSON_CHARS * 2,
    }
  );
  const candidate = parseRepairCandidate(result.content);
  if (!candidate) throw new Error("repair output failed strict validation");
  return { candidate, model: result.model, tokens: result.tokens };
}

const ENGLISH_CANDIDATE_SQL = `INSERT INTO translations (
  item_id, lang, source_lang, target_lang, title, summary
)
SELECT ?, 'en', 'vi', 'en', ?, ?
WHERE ${sourceExistsSql()}
ON CONFLICT(item_id, lang) DO UPDATE SET
  source_lang = excluded.source_lang,
  target_lang = excluded.target_lang,
  title = excluded.title,
  summary = excluded.summary,
  qa_rating = NULL,
  qa_at = NULL,
  qa_source_hash = NULL,
  qa_candidate_hash = NULL,
  qa_source_revision = NULL,
  qa_direction = NULL,
  qa_reviewer_model = NULL,
  qa_criteria_version = NULL`;

interface EnglishSourceRow {
  id: string;
  source_title: string;
  source_summary: string | null;
  source_lang: TranslationLanguage;
  source_revision: number;
}

async function createEnglishCandidate(
  db: D1Database,
  row: EnglishSourceRow,
  candidate: TranslationText
): Promise<boolean> {
  const result = await db
    .prepare(ENGLISH_CANDIDATE_SQL)
    .bind(
      row.id,
      candidate.title,
      candidate.summary,
      row.id,
      row.source_title,
      dbSummary(row.source_summary),
      row.source_revision
    )
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

async function ensureEnglishCandidates(
  env: Env,
  generatorSpec: string | null,
  budget: { calls: number; tokens: number },
  deadline: number
): Promise<number> {
  if (!generatorSpec) {
    console.error(
      JSON.stringify({
        event: "translation_review.blocked",
        reason: "ANYROUTER_ENGLISH_TRANSLATE_MODEL is not configured",
      })
    );
    return 0;
  }
  const { results } = await env.DB.prepare(buildEnglishCandidateQuery()).all<{
    id: string;
    source_title: string;
    source_summary: string | null;
    source_lang: TranslationLanguage;
    source_revision: number;
  }>();
  let created = 0;
  for (const row of results ?? []) {
    if (budget.calls >= QA_MAX_CALLS || Date.now() >= deadline) break;
    const pair: TranslationPair = {
      source: normalizedText(row.source_title, row.source_summary),
      candidate: normalizedText(row.source_title, row.source_summary),
      sourceLang: "vi",
      targetLang: "en",
      direction: "vi-en",
    };
    try {
      const result = await callAnyrouter(
        env,
        [
          { role: "system", content: REVIEW_SYSTEM_PROMPT },
          { role: "user", content: buildEnglishCandidatePrompt(pair) },
        ],
        {
          json: true,
          modelSpec: generatorSpec,
          task: "translate",
          timeoutMs: Math.min(
            QA_REPAIR_TIMEOUT_MS,
            Math.max(1, deadline - Date.now())
          ),
          maxTokens: 2_048,
          accept: (content) => parseRepairCandidate(content) !== null,
          sensitive: true,
          strictOutput: true,
          maxOutputChars: QA_MAX_JSON_CHARS * 2,
        }
      );
      const candidate = parseRepairCandidate(result.content);
      budget.calls++;
      budget.tokens += result.tokens;
      if (!candidate) continue;
      if (await createEnglishCandidate(env.DB, row, candidate)) {
        created++;
      }
    } catch (error) {
      budget.calls++;
      console.error(
        "translation_review.english_candidate_failed:",
        safeError(error)
      );
    }
  }
  return created;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/anyrouter request failed:\s*(\d{3})/i)?.[1];
  if (status) return `anyrouter request failed: ${status}`;
  if (/timed out after \d+ms/i.test(message)) return "provider timeout";
  if (/chain exhausted/i.test(message)) return "provider chain exhausted";
  return "review provider failed";
}

export interface TranslationQaStats {
  rated: number;
  adjusted: number;
  tokens: number;
  accepted: number;
  humanReview: number;
  failed: number;
  calls: number;
  englishCandidates: number;
  stale: number;
  error?: string;
}

const NO_QA_WORK: TranslationQaStats = {
  rated: 0,
  adjusted: 0,
  tokens: 0,
  accepted: 0,
  humanReview: 0,
  failed: 0,
  calls: 0,
  englishCandidates: 0,
  stale: 0,
};

function makeCandidate(row: QaRow): PreparedCandidate | null {
  const direction = directionFor(row.source_lang, row.target_lang);
  if (!direction) return null;
  const pair: TranslationPair = {
    source: normalizedText(row.source_title, row.source_summary),
    candidate: normalizedText(row.candidate_title, row.candidate_summary),
    sourceLang: row.source_lang,
    targetLang: row.target_lang,
    direction,
  };
  return {
    row,
    pair,
    sourceHash: "",
    candidateHash: "",
    stateId: "",
  };
}

async function prepareCandidate(row: QaRow): Promise<PreparedCandidate | null> {
  const candidate = makeCandidate(row);
  if (!candidate) return null;
  const hashes = await hashTranslationPair(candidate.pair);
  candidate.sourceHash = hashes.sourceHash;
  candidate.candidateHash = hashes.candidateHash;
  candidate.stateId = await stateIdFor({
    row,
    direction: candidate.pair.direction,
    sourceHash: candidate.sourceHash,
    candidateHash: candidate.candidateHash,
  });
  return candidate;
}

export async function ratePendingTranslations(
  env: Env,
  cap = QA_CAP
): Promise<TranslationQaStats> {
  await assertTranslationReviewSchema(env.DB);
  const reviewer = resolveIndependentReviewerChain(env);
  if (!reviewer.spec) {
    console.error(
      JSON.stringify({
        event: "translation_review.skipped",
        reason: reviewer.reason,
      })
    );
    return NO_QA_WORK;
  }
  const englishGenerator = resolveEnglishGeneratorChain(env);
  const safeCap = boundedLimit(cap, QA_CAP, QA_CAP);
  const scanCap = boundedLimit(safeCap * 4, safeCap, QA_SCAN_CAP);
  const stats: TranslationQaStats = {
    rated: 0,
    adjusted: 0,
    tokens: 0,
    accepted: 0,
    humanReview: 0,
    failed: 0,
    calls: 0,
    englishCandidates: 0,
    stale: 0,
  };
  const deadline = Date.now() + QA_WALL_BUDGET_MS;
  stats.englishCandidates = await ensureEnglishCandidates(
    env,
    englishGenerator,
    stats,
    deadline
  );

  const { results } = await env.DB.prepare(
    buildPendingQaQuery(scanCap)
  ).all<QaRow>();
  let processed = 0;
  for (const row of results ?? []) {
    if (
      processed >= safeCap ||
      stats.calls >= QA_MAX_CALLS ||
      Date.now() >= deadline
    )
      break;
    const candidate = await prepareCandidate(row);
    if (!candidate) continue;
    const leaseToken = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const claim = await claimState(env.DB, candidate, leaseToken, now);
    if (!claim.claimed) continue;
    processed++;

    let initial: Awaited<ReturnType<typeof requestReview>>;
    try {
      initial = await requestReview(
        env,
        candidate.pair,
        reviewer.spec,
        Math.min(QA_REVIEW_TIMEOUT_MS, Math.max(1, deadline - Date.now()))
      );
      stats.calls++;
      stats.rated++;
      stats.tokens += initial.tokens;
    } catch (error) {
      stats.calls++;
      stats.failed++;
      const fingerprint = await modelFingerprint(
        reviewer.chain.join(","),
        null
      );
      const attemptId = await attemptIdFor({
        candidate,
        attemptCount: claim.attemptCount,
        round: 1,
        phase: "initial",
        fingerprint,
      });
      await finishFailure(env.DB, {
        candidate,
        leaseToken,
        attempt: {
          candidate,
          stateId: candidate.stateId,
          attemptId,
          attemptCount: claim.attemptCount,
          round: 1,
          phase: "initial",
          decision: "review_failed",
          review: null,
          hardFailures: [],
          reason: safeError(error),
          reviewerChain: reviewer.chain.join(","),
          reviewerModel: null,
          repairModel: null,
          modelFingerprint: fingerprint,
          now,
        },
        attemptCount: claim.attemptCount,
        reason: safeError(error),
        terminal: claim.attemptCount >= QA_MAX_RETRY_ATTEMPTS,
      });
      continue;
    }

    const hardFailures = detectHardSemanticFailures(
      candidate.pair,
      initial.review
    );
    const initialFingerprint = await modelFingerprint(
      reviewer.chain.join(","),
      initial.model
    );
    if (reviewPasses(initial.review, hardFailures)) {
      const attemptId = await attemptIdFor({
        candidate,
        attemptCount: claim.attemptCount,
        round: 1,
        phase: "initial",
        fingerprint: initialFingerprint,
      });
      const ok = await finishWithMarker(env.DB, {
        candidate,
        leaseToken,
        attempt: {
          candidate,
          stateId: candidate.stateId,
          attemptId,
          attemptCount: claim.attemptCount,
          round: 1,
          phase: "initial",
          decision: "accepted",
          review: initial.review,
          hardFailures,
          reason: initial.review.reason,
          reviewerChain: reviewer.chain.join(","),
          reviewerModel: initial.model,
          repairModel: null,
          modelFingerprint: initialFingerprint,
          now,
        },
        decision: "accepted",
        terminal: true,
        nextRetryAt: null,
        candidateText: candidate.pair.candidate,
        sourceHash: candidate.sourceHash,
        candidateHash: candidate.candidateHash,
        naturalness: initial.review.naturalness,
        reviewerModel: initial.model,
      });
      if (ok) stats.accepted++;
      else stats.stale++;
      continue;
    }

    const generator = [
      ...new Set(
        parseModelChain(
          env.ANYROUTER_TRANSLATE_MODEL || env.ANYROUTER_MODEL
        ).slice(0, QA_MAX_MODEL_ATTEMPTS)
      ),
    ].join(",");
    const canRepair =
      candidate.pair.direction === "en-vi" &&
      initial.review.verdict !== "abstain" &&
      initial.review.confidence >= QA_CONFIDENCE_THRESHOLD &&
      generator.length > 0 &&
      QA_MAX_REPAIR_ATTEMPTS === 1 &&
      stats.calls + 2 <= QA_MAX_CALLS &&
      Date.now() < deadline;
    if (!canRepair) {
      const attemptId = await attemptIdFor({
        candidate,
        attemptCount: claim.attemptCount,
        round: 1,
        phase: "initial",
        fingerprint: initialFingerprint,
      });
      const ok = await finishWithMarker(env.DB, {
        candidate,
        leaseToken,
        attempt: {
          candidate,
          stateId: candidate.stateId,
          attemptId,
          attemptCount: claim.attemptCount,
          round: 1,
          phase: "initial",
          decision: "human_review",
          review: initial.review,
          hardFailures,
          reason:
            candidate.pair.direction === "vi-en"
              ? `vi-en mismatch is cross-check only: ${initial.review.reason}`
              : initial.review.reason,
          reviewerChain: reviewer.chain.join(","),
          reviewerModel: initial.model,
          repairModel: null,
          modelFingerprint: initialFingerprint,
          now,
        },
        decision: "human_review",
        terminal: true,
        nextRetryAt: null,
        candidateText: candidate.pair.candidate,
        sourceHash: candidate.sourceHash,
        candidateHash: candidate.candidateHash,
        naturalness: initial.review.naturalness,
        reviewerModel: initial.model,
      });
      if (ok) stats.humanReview++;
      else stats.stale++;
      continue;
    }

    let repaired: Awaited<ReturnType<typeof requestRepair>>;
    try {
      repaired = await requestRepair(
        env,
        candidate.pair,
        initial.review,
        hardFailures,
        generator,
        Math.min(QA_REPAIR_TIMEOUT_MS, Math.max(1, deadline - Date.now()))
      );
      stats.calls++;
      stats.tokens += repaired.tokens;
    } catch (error) {
      stats.calls++;
      const fingerprint = await modelFingerprint(
        reviewer.chain.join(","),
        initial.model
      );
      const attemptId = await attemptIdFor({
        candidate,
        attemptCount: claim.attemptCount,
        round: 1,
        phase: "initial",
        fingerprint,
      });
      await finishFailure(env.DB, {
        candidate,
        leaseToken,
        attempt: {
          candidate,
          stateId: candidate.stateId,
          attemptId,
          attemptCount: claim.attemptCount,
          round: 1,
          phase: "initial",
          decision: "review_failed",
          review: initial.review,
          hardFailures,
          reason: `repair failed: ${safeError(error)}`,
          reviewerChain: reviewer.chain.join(","),
          reviewerModel: initial.model,
          repairModel: null,
          modelFingerprint: fingerprint,
          now,
        },
        attemptCount: claim.attemptCount,
        reason: `repair failed: ${safeError(error)}`,
        terminal: claim.attemptCount >= QA_MAX_RETRY_ATTEMPTS,
      });
      continue;
    }

    const replacementPair: TranslationPair = {
      ...candidate.pair,
      candidate: repaired.candidate,
    };
    const replacementHashes = await hashTranslationPair(replacementPair);
    let recheck: Awaited<ReturnType<typeof requestReview>>;
    try {
      recheck = await requestReview(
        env,
        replacementPair,
        reviewer.spec,
        Math.min(QA_REVIEW_TIMEOUT_MS, Math.max(1, deadline - Date.now()))
      );
      stats.calls++;
      stats.rated++;
      stats.tokens += recheck.tokens;
    } catch (error) {
      stats.calls++;
      stats.failed++;
      const fingerprint = await modelFingerprint(
        reviewer.chain.join(","),
        null
      );
      const attemptId = await attemptIdFor({
        candidate: {
          ...candidate,
          candidateHash: replacementHashes.candidateHash,
        },
        attemptCount: claim.attemptCount,
        round: 2,
        phase: "re_review",
        fingerprint,
      });
      await finishFailure(env.DB, {
        candidate,
        leaseToken,
        attempt: {
          candidate: {
            ...candidate,
            candidateHash: replacementHashes.candidateHash,
          },
          stateId: candidate.stateId,
          attemptId,
          attemptCount: claim.attemptCount,
          round: 2,
          phase: "re_review",
          decision: "review_failed",
          review: null,
          hardFailures: [],
          reason: `re-review failed: ${safeError(error)}`,
          reviewerChain: reviewer.chain.join(","),
          reviewerModel: null,
          repairModel: repaired.model,
          modelFingerprint: fingerprint,
          now,
        },
        attemptCount: claim.attemptCount,
        reason: `re-review failed: ${safeError(error)}`,
        terminal: claim.attemptCount >= QA_MAX_RETRY_ATTEMPTS,
      });
      continue;
    }

    const replacementFailures = detectHardSemanticFailures(
      replacementPair,
      recheck.review
    );
    if (!reviewPasses(recheck.review, replacementFailures)) {
      const fingerprint = await modelFingerprint(
        reviewer.chain.join(","),
        recheck.model
      );
      const attemptId = await attemptIdFor({
        candidate: {
          ...candidate,
          candidateHash: replacementHashes.candidateHash,
        },
        attemptCount: claim.attemptCount,
        round: 2,
        phase: "re_review",
        fingerprint,
      });
      const ok = await finishWithMarker(env.DB, {
        candidate,
        leaseToken,
        attempt: {
          candidate: {
            ...candidate,
            candidateHash: replacementHashes.candidateHash,
          },
          stateId: candidate.stateId,
          attemptId,
          attemptCount: claim.attemptCount,
          round: 2,
          phase: "re_review",
          decision: "human_review",
          review: recheck.review,
          hardFailures: replacementFailures,
          reason: `repair failed re-review: ${recheck.review.reason}`,
          reviewerChain: reviewer.chain.join(","),
          reviewerModel: recheck.model,
          repairModel: repaired.model,
          modelFingerprint: fingerprint,
          now,
        },
        decision: "human_review",
        terminal: true,
        nextRetryAt: null,
        candidateText: candidate.pair.candidate,
        sourceHash: candidate.sourceHash,
        candidateHash: candidate.candidateHash,
        naturalness: initial.review.naturalness,
        reviewerModel: initial.model,
      });
      if (ok) stats.humanReview++;
      else stats.stale++;
      continue;
    }

    const replacementFingerprint = await modelFingerprint(
      reviewer.chain.join(","),
      recheck.model
    );
    const initialAttemptId = await attemptIdFor({
      candidate,
      attemptCount: claim.attemptCount,
      round: 1,
      phase: "initial",
      fingerprint: initialFingerprint,
    });
    const replacementAttemptId = await attemptIdFor({
      candidate: {
        ...candidate,
        candidateHash: replacementHashes.candidateHash,
      },
      attemptCount: claim.attemptCount,
      round: 2,
      phase: "re_review",
      fingerprint: replacementFingerprint,
    });
    const replacementCandidate: PreparedCandidate = {
      ...candidate,
      pair: replacementPair,
      candidateHash: replacementHashes.candidateHash,
    };
    const ok = await finishWithMarker(env.DB, {
      candidate,
      leaseToken,
      attempt: {
        candidate,
        stateId: candidate.stateId,
        attemptId: initialAttemptId,
        attemptCount: claim.attemptCount,
        round: 1,
        phase: "initial",
        decision: "repaired",
        review: initial.review,
        hardFailures,
        reason: initial.review.reason,
        reviewerChain: reviewer.chain.join(","),
        reviewerModel: initial.model,
        repairModel: repaired.model,
        modelFingerprint: initialFingerprint,
        now,
      },
      decision: "repaired",
      terminal: true,
      nextRetryAt: null,
      candidateText: repaired.candidate,
      sourceHash: replacementHashes.sourceHash,
      candidateHash: replacementHashes.candidateHash,
      naturalness: recheck.review.naturalness,
      reviewerModel: recheck.model,
      replacement: true,
      additionalAttempts: [
        {
          candidate: replacementCandidate,
          stateId: candidate.stateId,
          attemptId: replacementAttemptId,
          attemptCount: claim.attemptCount,
          round: 2,
          phase: "re_review",
          decision: "accepted",
          review: recheck.review,
          hardFailures: replacementFailures,
          reason: recheck.review.reason,
          reviewerChain: reviewer.chain.join(","),
          reviewerModel: recheck.model,
          repairModel: repaired.model,
          modelFingerprint: replacementFingerprint,
          now,
        },
      ],
    });
    if (ok) {
      stats.adjusted++;
      stats.accepted++;
    } else {
      stats.stale++;
    }
  }

  console.log(
    JSON.stringify({
      event: "translation_review.completed",
      rated: stats.rated,
      accepted: stats.accepted,
      humanReview: stats.humanReview,
      failed: stats.failed,
      adjusted: stats.adjusted,
      englishCandidates: stats.englishCandidates,
      calls: stats.calls,
      maxCalls: QA_MAX_CALLS,
      stale: stats.stale,
      tokens: stats.tokens,
    })
  );
  return stats;
}
