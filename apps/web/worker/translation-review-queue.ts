import { sanitizeText } from "./telemetry-safe.js";
import type { TranslationLanguage } from "./translation-review.js";
import {
  QA_MAX_MANUAL_RETRIES,
  REVIEW_CRITERIA_VERSION,
  REVIEW_POLICY_FINGERPRINT,
  REVIEW_PROMPT_FINGERPRINT,
} from "./translation-review.js";
import type { Env } from "./types.js";

export type TranslationReviewResolutionAction = "accept_original" | "retry";

export interface TranslationReviewQueueRow {
  state_id: string;
  attempt_id: string;
  item_id: string;
  lang: string;
  source_lang: TranslationLanguage;
  target_lang: TranslationLanguage;
  direction: "en-vi" | "vi-en";
  source_revision: number;
  source_hash: string;
  candidate_hash: string;
  attempt_count: number;
  manual_retry_count: number;
  can_retry: boolean;
  next_retry_at: number | null;
  source_title: string;
  source_summary: string | null;
  candidate_title: string;
  candidate_summary: string;
  decision: string;
  reason: string;
  updated_at: number;
}

export interface ResolveTranslationReviewInput {
  attemptId: string;
  action: TranslationReviewResolutionAction;
  actor: string;
  note: string;
}

export type ResolveTranslationReviewResult =
  | { ok: true; stateId: string; action: TranslationReviewResolutionAction }
  | { ok: false; error: string; status: number };

interface ResolutionState {
  state_id: string;
  attempt_id: string | null;
  terminal: number;
  item_id: string;
  lang: string;
  source_lang: TranslationLanguage;
  target_lang: TranslationLanguage;
  direction: "en-vi" | "vi-en";
  source_hash: string;
  candidate_hash: string;
  source_revision: number;
  candidate_title: string;
  candidate_summary: string;
  attempt_count: number;
  manual_retry_count: number;
}

const QUEUE_LIMIT = 50;
const MAX_ACTOR_LENGTH = 128;
const MAX_NOTE_LENGTH = 1_000;
const MAX_ATTEMPT_ID_LENGTH = 256;

function boundedLimit(value: number, fallback = QUEUE_LIMIT): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(QUEUE_LIMIT, Math.floor(value) || fallback));
}

function operatorText(value: string, maxLength: number): string {
  return (
    sanitizeText(value, maxLength)
      ?.replace(/[\r\n]+/g, " ")
      .trim() ?? ""
  );
}

function openStateSql(alias = "s"): string {
  return `(${alias}.attempt_id = ? OR ('state:' || ${alias}.state_id) = ?)
          AND ${alias}.terminal = 1
          AND ${alias}.decision IN ('human_review', 'review_failed')`;
}

/** Authenticated admin queue query. Candidate text is bounded for an operator's
 *  decision context; raw prompts/provider responses are never stored here. */
export async function listTranslationReviewQueue(
  env: Env,
  limit = QUEUE_LIMIT
): Promise<TranslationReviewQueueRow[]> {
  const safeLimit = boundedLimit(limit);
  const { results } = await env.DB.prepare(
    `SELECT s.state_id,
            CASE WHEN s.attempt_id IS NULL THEN 'state:' || s.state_id ELSE s.attempt_id END AS attempt_id,
            s.item_id, s.lang,
            s.source_lang, s.target_lang, s.direction, s.source_revision,
            s.source_hash, s.candidate_hash, s.attempt_count,
            s.manual_retry_count, s.next_retry_at,
            substr(i.title, 1, 500) AS source_title,
            substr(i.summary, 1, 2_000) AS source_summary,
            substr(s.candidate_title, 1, 500) AS candidate_title,
            substr(s.candidate_summary, 1, 2_000) AS candidate_summary,
            s.decision, COALESCE(a.reason, 'review requires human decision') AS reason,
            s.updated_at
       FROM translation_review_state s
       JOIN items i ON i.id = s.item_id
        AND i.source_revision = s.source_revision
        AND i.source_lang = s.source_lang
       JOIN translations t ON t.item_id = s.item_id AND t.lang = s.lang
        AND t.source_lang = s.source_lang AND t.target_lang = s.target_lang
        AND t.title = s.candidate_title AND t.summary = s.candidate_summary
       LEFT JOIN translation_review_attempts a ON a.attempt_id = s.attempt_id
      WHERE s.terminal = 1
        AND s.decision IN ('human_review', 'review_failed')
      ORDER BY s.updated_at DESC
      LIMIT ${safeLimit}`
  ).all<TranslationReviewQueueRow>();
  return (results ?? []).map((row) => ({
    ...row,
    can_retry: Number(row.manual_retry_count ?? 0) < QA_MAX_MANUAL_RETRIES,
    reason:
      operatorText(row.reason, MAX_NOTE_LENGTH) ||
      "review requires human decision",
  }));
}

function resolutionAttemptSql(isRetry: boolean): string {
  const retryGuard = isRetry ? "AND s.manual_retry_count = 0" : "";
  return `INSERT OR IGNORE INTO translation_review_attempts (
     attempt_id, state_id, item_id, lang, source_lang, target_lang, direction,
     source_hash, candidate_hash, source_revision, attempt_number, round, phase,
     criteria_fingerprint, prompt_fingerprint, policy_fingerprint, model_fingerprint,
     decision, fidelity, naturalness, confidence, hard_failures, reason,
     reviewer_chain, reviewer_model, repair_model, created_at
   )
   SELECT ?, s.state_id, s.item_id, s.lang, s.source_lang, s.target_lang, s.direction,
          s.source_hash, s.candidate_hash, s.source_revision,
          CASE WHEN s.attempt_count < 1 THEN 1 ELSE s.attempt_count END,
          1, 'resolution', ?, ?, ?, ?,
          ?, NULL, NULL, NULL, '[]', ?, 'human', ?, NULL, ?
     FROM translation_review_state s
    WHERE s.state_id = ? AND ${openStateSql()}
      ${retryGuard}
      AND EXISTS (
        SELECT 1 FROM items i
         WHERE i.id = s.item_id AND i.source_revision = s.source_revision
           AND i.source_lang = s.source_lang
      )
      AND EXISTS (
        SELECT 1 FROM translations t
         WHERE t.item_id = s.item_id AND t.lang = s.lang
           AND t.source_lang = s.source_lang AND t.target_lang = s.target_lang
           AND t.title = s.candidate_title AND t.summary = s.candidate_summary
      )`;
}

export async function resolveTranslationReview(
  env: Env,
  input: ResolveTranslationReviewInput
): Promise<ResolveTranslationReviewResult> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "resolution input is required", status: 400 };
  }
  const attemptId =
    typeof input.attemptId === "string" ? input.attemptId.trim() : "";
  const actor = operatorText(
    typeof input.actor === "string" ? input.actor : "",
    MAX_ACTOR_LENGTH
  );
  const note = operatorText(
    typeof input.note === "string" ? input.note : "",
    MAX_NOTE_LENGTH
  );
  if (!attemptId || attemptId.length > MAX_ATTEMPT_ID_LENGTH) {
    return {
      ok: false,
      error: "attempt id is required and must be bounded",
      status: 400,
    };
  }
  if (!actor || actor.length > MAX_ACTOR_LENGTH) {
    return {
      ok: false,
      error: "actor is required and must be bounded",
      status: 400,
    };
  }
  if (!note || note.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: "note is required and must be bounded",
      status: 400,
    };
  }
  if (input.action !== "accept_original" && input.action !== "retry") {
    return { ok: false, error: "unsupported resolution action", status: 400 };
  }

  const state = await env.DB.prepare(
    `SELECT s.state_id, s.attempt_id, s.terminal,
            s.item_id, s.lang, s.source_lang, s.target_lang, s.direction,
            s.source_hash, s.candidate_hash, s.source_revision,
            s.candidate_title, s.candidate_summary, s.attempt_count,
            s.manual_retry_count
       FROM translation_review_state s
       JOIN items i ON i.id = s.item_id
        AND i.source_revision = s.source_revision
        AND i.source_lang = s.source_lang
       JOIN translations t ON t.item_id = s.item_id AND t.lang = s.lang
        AND t.source_lang = s.source_lang AND t.target_lang = s.target_lang
        AND t.title = s.candidate_title AND t.summary = s.candidate_summary
      WHERE ${openStateSql()}`
  )
    .bind(attemptId, attemptId)
    .first<ResolutionState>();
  if (!state) {
    return {
      ok: false,
      error: "review is not an open human-review item",
      status: 404,
    };
  }
  if (
    input.action === "retry" &&
    Number(state.manual_retry_count ?? 0) >= QA_MAX_MANUAL_RETRIES
  ) {
    return {
      ok: false,
      error: "manual retry allowance is already exhausted",
      status: 409,
    };
  }

  const resolutionId = crypto.randomUUID();
  const attemptResolutionId = crypto.randomUUID();
  const auditedAttemptId = state.attempt_id ?? attemptId;
  const now = Math.floor(Date.now() / 1000);
  const nextDecision =
    input.action === "accept_original" ? "human_accepted" : "retry_requested";
  const reviewerModel = `human:${actor}`;
  // The human decision is represented by the state row and reviewer model;
  // qa_rating remains null because an operator decision is not a model score.
  const marker =
    input.action === "accept_original"
      ? env.DB.prepare(
          `UPDATE translations SET
           qa_rating = NULL, qa_at = ?, qa_source_hash = ?, qa_candidate_hash = ?,
           qa_source_revision = ?, qa_direction = ?, qa_reviewer_model = ?,
           qa_criteria_version = ?
         WHERE item_id = ? AND lang = ? AND source_lang = ? AND target_lang = ?
           AND title = ? AND summary = ?
           AND EXISTS (
             SELECT 1 FROM items i
              WHERE i.id = ? AND i.source_revision = ?
                 AND i.source_lang = ?
           )`
        ).bind(
          now,
          state.source_hash,
          state.candidate_hash,
          state.source_revision,
          state.direction,
          reviewerModel,
          REVIEW_CRITERIA_VERSION,
          state.item_id,
          state.lang,
          state.source_lang,
          state.target_lang,
          state.candidate_title,
          state.candidate_summary,
          state.item_id,
          state.source_revision,
          state.source_lang
        )
      : env.DB.prepare(
          `UPDATE translations SET
           qa_rating = NULL, qa_at = NULL, qa_source_hash = NULL,
           qa_candidate_hash = NULL, qa_source_revision = NULL,
           qa_direction = NULL, qa_reviewer_model = NULL,
           qa_criteria_version = NULL
         WHERE item_id = ? AND lang = ? AND source_lang = ? AND target_lang = ?
           AND title = ? AND summary = ?
           AND EXISTS (
             SELECT 1 FROM items i
              WHERE i.id = ? AND i.source_revision = ?
                 AND i.source_lang = ?
           )`
        ).bind(
          state.item_id,
          state.lang,
          state.source_lang,
          state.target_lang,
          state.candidate_title,
          state.candidate_summary,
          state.item_id,
          state.source_revision,
          state.source_lang
        );

  const resolutionInsert = env.DB.prepare(
    `INSERT INTO translation_review_resolutions (
       resolution_id, attempt_id, state_id, item_id, source_hash, candidate_hash,
       action, actor, note, created_at
     )
     SELECT ?, ?, s.state_id, s.item_id, s.source_hash, s.candidate_hash,
            ?, ?, ?, ?
       FROM translation_review_state s
      WHERE s.state_id = ? AND ${openStateSql()}
        ${input.action === "retry" ? "AND s.manual_retry_count = 0" : ""}
        AND EXISTS (
          SELECT 1 FROM items i
           WHERE i.id = s.item_id AND i.source_revision = s.source_revision
           AND i.source_lang = s.source_lang
        )
        AND EXISTS (
          SELECT 1 FROM translations t
           WHERE t.item_id = s.item_id AND t.lang = s.lang
             AND t.source_lang = s.source_lang AND t.target_lang = s.target_lang
             AND t.title = s.candidate_title AND t.summary = s.candidate_summary
        )`
  ).bind(
    resolutionId,
    auditedAttemptId,
    input.action,
    actor,
    note,
    now,
    state.state_id,
    attemptId,
    attemptId
  );

  const resolutionAttempt = env.DB.prepare(
    resolutionAttemptSql(input.action === "retry")
  ).bind(
    attemptResolutionId,
    REVIEW_CRITERIA_VERSION,
    REVIEW_PROMPT_FINGERPRINT,
    REVIEW_POLICY_FINGERPRINT,
    `human:${actor}`,
    nextDecision,
    note,
    reviewerModel,
    now,
    state.state_id,
    attemptId,
    attemptId
  );

  const stateUpdate = env.DB.prepare(
    `UPDATE translation_review_state
        SET decision = ?, attempt_id = ?, terminal = ?, next_retry_at = ?,
            manual_retry_count = manual_retry_count + ?,
            lease_token = NULL, lease_until = NULL, updated_at = ?
      WHERE state_id = ? AND ${openStateSql("translation_review_state")}
        ${input.action === "retry" ? "AND manual_retry_count = 0" : ""}
        AND candidate_title = ? AND candidate_summary = ?
        AND EXISTS (
          SELECT 1 FROM items i
           WHERE i.id = translation_review_state.item_id
             AND i.source_revision = translation_review_state.source_revision
             AND i.source_lang = translation_review_state.source_lang
        )
        AND EXISTS (
          SELECT 1 FROM translations t
           WHERE t.item_id = translation_review_state.item_id
             AND t.lang = translation_review_state.lang
             AND t.source_lang = translation_review_state.source_lang
             AND t.target_lang = translation_review_state.target_lang
             AND t.title = translation_review_state.candidate_title
             AND t.summary = translation_review_state.candidate_summary
        )`
  ).bind(
    nextDecision,
    attemptResolutionId,
    input.action === "accept_original" ? 1 : 0,
    input.action === "retry" ? now : null,
    input.action === "retry" ? 1 : 0,
    now,
    state.state_id,
    attemptId,
    attemptId,
    state.candidate_title,
    state.candidate_summary
  );

  const results = await env.DB.batch([
    resolutionInsert,
    resolutionAttempt,
    marker,
    stateUpdate,
  ]);
  const changes = results.map((result) => result.meta?.changes ?? 0);
  if (changes.some((change) => change !== 1)) {
    return {
      ok: false,
      error: "review changed while resolving; reload the queue",
      status: 409,
    };
  }
  return { ok: true, stateId: state.state_id, action: input.action };
}
