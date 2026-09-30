import type { Env } from "../types.js";
import type { JevPanelPurpose } from "./config.js";
import type { JevPanelResult, JevRoundRecord } from "./core.js";

/**
 * D1 audit trail for JEV panel runs (#144), table `jev_panel_verdicts`
 * (migration 0031).
 *
 * Writing is best effort: a failed insert is logged and swallowed, so the
 * audit can never take the scoring step down. The human override only records
 * an operator decision; it never re-scores or re-publishes an item.
 */

export const JEV_VERDICTS_DEFAULT_LIMIT = 50;
export const JEV_VERDICTS_MAX_LIMIT = 200;
export const JEV_OVERRIDE_NOTE_MAX = 1_000;

export type JevOverrideDecision = "uphold" | "overturn";

export interface JevVerdictContext {
  readonly runId: string;
  readonly purpose: JevPanelPurpose;
  readonly outcomeKind: string;
  readonly outcomeReason: string;
  readonly relevanceBefore: number | null;
  readonly relevanceAfter: number | null;
  readonly category: string | null;
}

export interface JevVerdictVote {
  readonly phase: JevRoundRecord["phase"];
  readonly round: JevRoundRecord["round"];
  readonly role: JevRoundRecord["role"];
  readonly configuredModel: string;
  readonly servedModel: string | null;
  readonly status: JevRoundRecord["status"];
  readonly failureReason: JevRoundRecord["failureReason"];
  readonly vote: string | null;
  readonly score: number | null;
  readonly confidence: number | null;
  readonly category: string | null;
  readonly claims: readonly {
    readonly id: string;
    readonly text: string;
    readonly evidence: readonly { sourceId: string; locator?: string }[];
  }[];
  readonly latencyMs: number | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface JevVerdictRow {
  readonly id: string;
  readonly createdAt: number;
  readonly runId: string;
  readonly purpose: JevPanelPurpose;
  readonly subjectId: string;
  readonly panelId: string;
  readonly idempotencyKey: string;
  readonly status: string;
  readonly recommendation: string;
  readonly outcomeKind: string;
  readonly outcomeReason: string;
  readonly quorumReached: boolean;
  readonly relevanceBefore: number | null;
  readonly relevanceAfter: number | null;
  readonly category: string | null;
  readonly debateTriggered: boolean;
  readonly judgeCalls: number;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly costUsd: number | null;
  readonly votes: readonly JevVerdictVote[];
  readonly override: {
    readonly decision: JevOverrideDecision;
    readonly note: string;
    readonly actor: string;
    readonly at: number;
  } | null;
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/** Flatten the core audit into a row. Pure, so it is unit-testable and the
 *  stored shape is decided in one place. */
export function buildJevVerdictRow(
  result: JevPanelResult,
  context: JevVerdictContext,
  now: number = Date.now()
): JevVerdictRow {
  const records = result.audit.rounds.flatMap((round) => round.records);
  const votes: JevVerdictVote[] = records.map((record) => ({
    phase: record.phase,
    round: record.round,
    role: record.role,
    configuredModel: record.configuredModel.id,
    servedModel: record.reportedModel?.id ?? null,
    status: record.status,
    failureReason: record.failureReason,
    vote: record.judgment?.vote ?? null,
    score: record.judgment?.score ?? null,
    confidence: record.judgment?.confidence ?? null,
    category: record.judgment?.category ?? null,
    claims: (record.judgment?.claims ?? []).map((claim) => ({
      id: claim.id,
      text: claim.text,
      evidence: claim.evidence.map((evidence) => ({
        sourceId: evidence.sourceId,
        ...(evidence.locator === undefined
          ? {}
          : { locator: evidence.locator }),
      })),
    })),
    latencyMs: record.latencyMs,
    inputTokens: record.usage.inputTokens,
    outputTokens: record.usage.outputTokens,
  }));
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    runId: context.runId,
    purpose: context.purpose,
    subjectId: result.subjectId,
    panelId: result.panelId,
    idempotencyKey: result.idempotencyKey,
    status: result.status,
    recommendation: result.recommendation,
    outcomeKind: context.outcomeKind,
    outcomeReason: context.outcomeReason,
    quorumReached: result.finalAggregate.quorumReached,
    relevanceBefore: context.relevanceBefore,
    relevanceAfter: context.relevanceAfter,
    category: context.category,
    debateTriggered: result.debate.triggered,
    judgeCalls: records.length,
    latencyMs: records.reduce(
      (sum, record) => sum + (record.latencyMs ?? 0),
      0
    ),
    inputTokens: sumOrNull(records.map((record) => record.usage.inputTokens)),
    outputTokens: sumOrNull(records.map((record) => record.usage.outputTokens)),
    costUsd: sumOrNull(records.map((record) => record.usage.costUsd)),
    votes,
    override: null,
  };
}

/** Insert one verdict. Never throws. Returns whether a row was written. */
export async function recordJevPanelVerdict(
  env: Pick<Env, "DB">,
  row: JevVerdictRow
): Promise<boolean> {
  try {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO jev_panel_verdicts (
         id, created_at, run_id, purpose, subject_id, panel_id,
         idempotency_key, status, recommendation, outcome_kind,
         outcome_reason, quorum_reached, relevance_before, relevance_after,
         category, debate_triggered, judge_calls, latency_ms, input_tokens,
         output_tokens, cost_usd, votes_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        row.id,
        row.createdAt,
        row.runId,
        row.purpose,
        row.subjectId,
        row.panelId,
        row.idempotencyKey,
        row.status,
        row.recommendation,
        row.outcomeKind,
        row.outcomeReason,
        row.quorumReached ? 1 : 0,
        row.relevanceBefore,
        row.relevanceAfter,
        row.category,
        row.debateTriggered ? 1 : 0,
        row.judgeCalls,
        row.latencyMs,
        row.inputTokens,
        row.outputTokens,
        row.costUsd,
        JSON.stringify(row.votes)
      )
      .run();
    return (result.meta?.changes ?? 0) > 0;
  } catch (error) {
    console.error(
      "jev panel verdict write failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseVotes(raw: unknown): JevVerdictVote[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JevVerdictVote[]) : [];
  } catch {
    return [];
  }
}

function rowFromDb(row: Record<string, unknown>): JevVerdictRow {
  const decision = row.override_decision;
  return {
    id: String(row.id),
    createdAt: Number(row.created_at),
    runId: String(row.run_id),
    purpose: row.purpose === "translation" ? "translation" : "score",
    subjectId: String(row.subject_id),
    panelId: String(row.panel_id),
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status),
    recommendation: String(row.recommendation),
    outcomeKind: String(row.outcome_kind),
    outcomeReason: String(row.outcome_reason),
    quorumReached: row.quorum_reached === 1,
    relevanceBefore: numOrNull(row.relevance_before),
    relevanceAfter: numOrNull(row.relevance_after),
    category: typeof row.category === "string" ? row.category : null,
    debateTriggered: row.debate_triggered === 1,
    judgeCalls: Number(row.judge_calls ?? 0),
    latencyMs: Number(row.latency_ms ?? 0),
    inputTokens: numOrNull(row.input_tokens),
    outputTokens: numOrNull(row.output_tokens),
    costUsd: numOrNull(row.cost_usd),
    votes: parseVotes(row.votes_json),
    override:
      decision === "uphold" || decision === "overturn"
        ? {
            decision,
            note: String(row.override_note ?? ""),
            actor: String(row.override_actor ?? ""),
            at: Number(row.override_at ?? 0),
          }
        : null,
  };
}

/** Newest first. `subjectId` narrows to one item. */
export async function listJevPanelVerdicts(
  env: Pick<Env, "DB">,
  options: { limit?: string | null; subjectId?: string | null } = {}
): Promise<{ verdicts: JevVerdictRow[] }> {
  const parsed = options.limit ? Number(options.limit) : Number.NaN;
  const limit =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(Math.floor(parsed), JEV_VERDICTS_MAX_LIMIT)
      : JEV_VERDICTS_DEFAULT_LIMIT;
  const subjectId = options.subjectId?.trim() || null;
  const statement = subjectId
    ? env.DB.prepare(
        `SELECT * FROM jev_panel_verdicts WHERE subject_id = ?
         ORDER BY created_at DESC LIMIT ?`
      ).bind(subjectId, limit)
    : env.DB.prepare(
        "SELECT * FROM jev_panel_verdicts ORDER BY created_at DESC LIMIT ?"
      ).bind(limit);
  const { results } = await statement.all<Record<string, unknown>>();
  return { verdicts: (results ?? []).map(rowFromDb) };
}

export type JevOverrideResult =
  | { readonly ok: true; readonly verdict: JevVerdictRow }
  | { readonly ok: false; readonly status: 400 | 404; readonly error: string };

/**
 * Record a human decision on a verdict. Re-overriding replaces the previous
 * decision; the latest actor and note win.
 */
export async function overrideJevPanelVerdict(
  env: Pick<Env, "DB">,
  input: {
    readonly id: string;
    readonly decision: unknown;
    readonly note: unknown;
    readonly actor: string;
  },
  now: number = Date.now()
): Promise<JevOverrideResult> {
  if (input.decision !== "uphold" && input.decision !== "overturn") {
    return {
      ok: false,
      status: 400,
      error: "decision must be uphold or overturn",
    };
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!note) {
    return { ok: false, status: 400, error: "note is required" };
  }
  const result = await env.DB.prepare(
    `UPDATE jev_panel_verdicts
        SET override_decision = ?, override_note = ?, override_actor = ?,
            override_at = ?
      WHERE id = ?`
  )
    .bind(
      input.decision,
      note.slice(0, JEV_OVERRIDE_NOTE_MAX),
      input.actor,
      now,
      input.id
    )
    .run();
  if ((result.meta?.changes ?? 0) === 0) {
    return { ok: false, status: 404, error: "verdict not found" };
  }
  const row = await env.DB.prepare(
    "SELECT * FROM jev_panel_verdicts WHERE id = ?"
  )
    .bind(input.id)
    .first<Record<string, unknown>>();
  if (!row) return { ok: false, status: 404, error: "verdict not found" };
  return { ok: true, verdict: rowFromDb(row) };
}
