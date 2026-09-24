import type { TranslationLanguage } from "./translation-review.js";
import type { Env } from "./types.js";

export type TranslationReviewResolutionAction = "accept_original" | "retry";

export interface TranslationReviewQueueRow {
  state_id: string;
  attempt_id: string | null;
  item_id: string;
  lang: string;
  source_lang: TranslationLanguage;
  target_lang: TranslationLanguage;
  direction: "en-vi" | "vi-en";
  source_revision: number;
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

const QUEUE_LIMIT = 50;
const MAX_ACTOR_LENGTH = 128;
const MAX_NOTE_LENGTH = 1_000;

/** Authenticated admin queue query. Candidate text is bounded for an operator's
 *  decision context; raw prompts/provider responses are never stored here. */
export async function listTranslationReviewQueue(
  env: Env,
  limit = QUEUE_LIMIT
): Promise<TranslationReviewQueueRow[]> {
  const safeLimit = Math.max(
    1,
    Math.min(QUEUE_LIMIT, Math.floor(limit) || QUEUE_LIMIT)
  );
  const { results } = await env.DB.prepare(
    `SELECT s.state_id,
            CASE WHEN s.attempt_id IS NULL THEN 'state:' || s.state_id ELSE s.attempt_id END AS attempt_id,
            s.item_id, s.lang,
            s.source_lang, s.target_lang, s.direction, s.source_revision,
            substr(i.title, 1, 500) AS source_title,
            substr(i.summary, 1, 2_000) AS source_summary,
            substr(t.title, 1, 500) AS candidate_title,
            substr(t.summary, 1, 2_000) AS candidate_summary,
            s.decision, COALESCE(a.reason, 'review requires human decision') AS reason,
            s.updated_at
       FROM translation_review_state s
       JOIN items i ON i.id = s.item_id AND i.source_revision = s.source_revision
       JOIN translations t ON t.item_id = s.item_id AND t.lang = s.lang
        AND t.source_lang = s.source_lang AND t.target_lang = s.target_lang
       LEFT JOIN translation_review_attempts a ON a.attempt_id = s.attempt_id
      WHERE s.terminal = 1
        AND s.decision IN ('human_review', 'review_failed')
      ORDER BY s.updated_at DESC
      LIMIT ${safeLimit}`
  ).all<TranslationReviewQueueRow>();
  return results ?? [];
}

export async function resolveTranslationReview(
  env: Env,
  input: ResolveTranslationReviewInput
): Promise<ResolveTranslationReviewResult> {
  const actor = input.actor.trim();
  const note = input.note.trim();
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
    `SELECT s.state_id, s.attempt_id, s.terminal
       FROM translation_review_state s
      WHERE (s.attempt_id = ? OR ('state:' || s.state_id) = ?)
        AND s.terminal = 1
        AND s.decision IN ('human_review', 'review_failed')`
  )
    .bind(input.attemptId, input.attemptId)
    .first<{ state_id: string; attempt_id: string | null; terminal: number }>();
  if (!state) {
    return {
      ok: false,
      error: "review is not an open human-review item",
      status: 404,
    };
  }

  const resolutionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const nextDecision =
    input.action === "accept_original" ? "human_accepted" : "retry_requested";
  const results = await env.DB.batch(
    [
      env.DB.prepare(
        `INSERT INTO translation_review_resolutions (
         resolution_id, attempt_id, state_id, item_id, action, actor, note, created_at
       )
       SELECT ?, ?, s.state_id, s.item_id, ?, ?, ?, ?
         FROM translation_review_state s
        WHERE s.state_id = ? AND (s.attempt_id = ? OR ('state:' || s.state_id) = ?)
           AND s.terminal = 1
           AND EXISTS (
             SELECT 1 FROM items i
              WHERE i.id = s.item_id AND i.source_revision = s.source_revision
           )`
      ).bind(
        resolutionId,
        input.attemptId,
        input.action,
        actor,
        note,
        now,
        state.state_id,
        input.attemptId,
        input.attemptId
      ),
      env.DB.prepare(
        `UPDATE translation_review_state
          SET decision = ?, attempt_id = ?, terminal = ?, attempt_count = ?,
              next_retry_at = ?, lease_token = NULL, lease_until = NULL, updated_at = ?
        WHERE state_id = ? AND (attempt_id = ? OR ('state:' || state_id) = ?)
          AND terminal = 1
          AND EXISTS (
             SELECT 1 FROM items i
              WHERE i.id = translation_review_state.item_id
                AND i.source_revision = translation_review_state.source_revision
           )`
      ).bind(
        nextDecision,
        input.attemptId,
        input.action === "accept_original" ? 1 : 0,
        input.action === "retry" ? 0 : 1,
        input.action === "retry" ? now : null,
        now,
        state.state_id,
        input.attemptId,
        input.attemptId
      ),
      input.action === "retry"
        ? env.DB.prepare(
            `UPDATE translations SET
             qa_rating = NULL, qa_at = NULL, qa_source_hash = NULL,
             qa_candidate_hash = NULL, qa_source_revision = NULL,
             qa_direction = NULL, qa_reviewer_model = NULL,
             qa_criteria_version = NULL
           WHERE item_id = (SELECT s.item_id FROM translation_review_state s WHERE s.state_id = ?)
             AND lang = (SELECT s.lang FROM translation_review_state s WHERE s.state_id = ?)
             AND EXISTS (
               SELECT 1 FROM items i
               JOIN translation_review_state s2 ON s2.item_id = i.id
                WHERE s2.state_id = ? AND i.source_revision = s2.source_revision
             )`
          ).bind(state.state_id, state.state_id, state.state_id)
        : null,
    ].filter(
      (statement): statement is D1PreparedStatement => statement !== null
    )
  );
  const stateChanges = results[1]?.meta?.changes ?? 0;
  const resolutionChanges = results[0]?.meta?.changes ?? 0;
  if (stateChanges !== 1 || resolutionChanges !== 1) {
    return {
      ok: false,
      error: "review changed while resolving; reload the queue",
      status: 409,
    };
  }
  return { ok: true, stateId: state.state_id, action: input.action };
}
