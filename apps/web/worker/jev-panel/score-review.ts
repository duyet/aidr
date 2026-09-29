import { mapWithConcurrency } from "../concurrency.js";
import { currentLlmCallRunId } from "../llm.js";
import type { Env } from "../types.js";
import {
  type JevPanelFailMode,
  resolveJevPanelWorkflowConfig,
} from "./config.js";
import { type JevPanelResult, runJevPanel } from "./core.js";
import { createJevJudgeExecutor } from "./executor.js";

/**
 * Scoring-call-site integration for the JEV panel core (#167).
 *
 * The panel is a bounded, advisory second opinion on one already-produced
 * score. Three properties keep it from changing what the pipeline means:
 *
 * 1. It can only ever *lower* relevance. There is no configuration under which
 *    the panel raises a score or promotes an item, so a wrong or adversarial
 *    verdict cannot manufacture publication.
 * 2. It writes nothing new. The effect rides on the existing `llm_relevance`
 *    and `category` columns, and the existing relevance gate in
 *    `workflow.ts` still owns the publish/reject decision. No migration.
 * 3. It cannot lose a primary result. Every path — disabled, unresolvable
 *    config, transport failure, no quorum, throw — returns the primary row
 *    unchanged with a reason attached.
 */

/** Wall-clock budget for one item's whole panel, all rounds included. */
export const JEV_PANEL_DEFAULT_ITEM_BUDGET_MS = 40_000;

/** Ceiling on a single judge invocation, also clamped by the item budget. */
export const JEV_PANEL_MAX_JUDGE_TIMEOUT_MS = 25_000;

/** Judges reviewed at once. Kept small: the panel is a second opinion, not the
 *  main path, and it must not starve the primary scoring calls. */
const JEV_PANEL_CONCURRENCY = 2;

/** Memo capacity. A long ingest run must not grow the isolate without bound. */
const JEV_PANEL_MEMO_LIMIT = 512;

export type JevReviewOutcomeKind =
  /** `JEV_PANEL_ENABLED` is not set. The pre-existing path, unchanged. */
  | "disabled"
  /** Enabled, but the config cannot supply a usable diverse panel. */
  | "misconfigured"
  /** Reused a memoized panel result for this run/decision identity. */
  | "replayed"
  /** Panel reached quorum and did not lower the score. */
  | "unchanged"
  /** Panel reached quorum and lowered the relevance ceiling. */
  | "demoted"
  /** Panel reached quorum and voted against publication. */
  | "opposed"
  /** No decision; the primary score was kept (`JEV_PANEL_FAIL_MODE=open`). */
  | "degraded_open"
  /** No decision; relevance forced to 0 (`JEV_PANEL_FAIL_MODE=closed`). */
  | "degraded_closed"
  /** The panel itself threw. The primary score was kept. */
  | "error";

export interface JevScoreReviewOutcome {
  readonly kind: JevReviewOutcomeKind;
  /** Short, non-sensitive, log-safe explanation. Never contains item text. */
  readonly reason: string;
  readonly recommendation: string | null;
  readonly quorumReached: boolean;
  /** The core's content+policy key, when a panel actually ran. */
  readonly idempotencyKey: string | null;
  readonly relevanceBefore: number;
  readonly relevanceAfter: number;
  /** Panel category to adopt, or null to keep the primary category. Only ever
   *  set when the mode was unambiguous and the value is one the pipeline
   *  already accepts. */
  readonly category: string | null;
  readonly categoryApplied: boolean;
}

export interface JevScoreItem {
  /** Persisted `items.id` — the decision identity. */
  readonly id: string;
  readonly title: string;
  readonly summary?: string;
  readonly source: string;
}

interface MemoEntry {
  readonly panel: JevPanelResult;
  readonly appliedRelevance: number;
  readonly category: string | null;
}

/** A review row is either served from the memo or freshly decided. The two
 *  shapes are kept apart so a replay can never be mistaken for a new verdict. */
type ReviewedRow =
  | { readonly id: string; readonly from: "memo"; readonly entry: MemoEntry }
  | {
      readonly id: string;
      readonly from: "panel";
      readonly relevance: number;
      readonly category: string | null;
      readonly outcome: JevScoreReviewOutcome;
    };

/** Memoized per run/decision identity so a replayed step reuses the panel
 *  result instead of spending a second set of judge calls or counting twice. */
const panelMemo = new Map<string, MemoEntry>();

/** Test helper — a Worker isolate is long-lived and tests share the module. */
export function resetJevScoreReviewMemo(): void {
  panelMemo.clear();
}

function memoize(key: string, entry: MemoEntry): void {
  panelMemo.delete(key);
  panelMemo.set(key, entry);
  while (panelMemo.size > JEV_PANEL_MEMO_LIMIT) {
    const oldest = panelMemo.keys().next();
    if (oldest.done) break;
    panelMemo.delete(oldest.value);
  }
}

/** Cheap non-crypto digest. A memo key only, never a security boundary: it
 *  keeps a changed title from hitting a stale entry without an async hash on
 *  the scoring hot path. */
function contentTag(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function memoKey(runId: string, item: JevScoreItem): string {
  return [
    runId,
    item.id,
    contentTag(`${item.title}\u0000${item.summary ?? ""}\u0000${item.source}`),
  ].join("\u0000");
}

function boundedBudget(env: Env): number {
  const parsed = Number((env.JEV_PANEL_BUDGET_MS ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return JEV_PANEL_DEFAULT_ITEM_BUDGET_MS;
  }
  return Math.min(Math.floor(parsed), 5 * JEV_PANEL_DEFAULT_ITEM_BUDGET_MS);
}

function categoryAllowed(env: Env): boolean {
  return (env.JEV_PANEL_APPLY_CATEGORY ?? "").trim().toLowerCase() === "1";
}

function baseOutcome(
  kind: JevReviewOutcomeKind,
  reason: string,
  relevance: number
): JevScoreReviewOutcome {
  return {
    kind,
    reason,
    recommendation: null,
    quorumReached: false,
    idempotencyKey: null,
    relevanceBefore: relevance,
    relevanceAfter: relevance,
    category: null,
    categoryApplied: false,
  };
}

/**
 * Translate a panel result into a relevance ceiling.
 *
 * The panel's own contract is that `recommendation` is a vote and `score` is
 * the mean of the valid directional ratings, and that the vote is independent
 * of any score threshold. The mapping below keeps that separation:
 *
 * - `support` -> the panel's mean score becomes the ceiling. It can lower the
 *   primary relevance but never raise it.
 * - `oppose`  -> a panel that voted against publication cannot be an
 *   enabler, so the ceiling is 0. This is the fail-safe direction.
 * - `human_review` -> no decision was reached (no quorum, tie, unresolved
 *   debate). Nothing is applied; `failMode` decides whether the item keeps its
 *   primary relevance or is forced below the gate.
 */
function applyPanel(
  panel: JevPanelResult,
  failMode: JevPanelFailMode,
  relevance: number,
  allowCategory: boolean,
  categoryOptions: readonly string[]
): {
  relevance: number;
  category: string | null;
  outcome: JevScoreReviewOutcome;
} {
  const aggregate = panel.finalAggregate;
  const common = {
    recommendation: panel.recommendation,
    quorumReached: aggregate.quorumReached,
    idempotencyKey: panel.idempotencyKey,
    relevanceBefore: relevance,
  };

  if (panel.recommendation === "human_review") {
    const reasons = aggregate.unresolvedReasons.join(",") || "unresolved";
    if (failMode === "closed") {
      return {
        relevance: 0,
        category: null,
        outcome: {
          ...common,
          kind: "degraded_closed",
          reason: `panel unresolved (${reasons}); fail mode closed`,
          relevanceAfter: 0,
          category: null,
          categoryApplied: false,
        },
      };
    }
    return {
      relevance,
      category: null,
      outcome: {
        ...common,
        kind: "degraded_open",
        reason: `panel unresolved (${reasons}); fail mode open`,
        relevanceAfter: relevance,
        category: null,
        categoryApplied: false,
      },
    };
  }

  // A resolved panel category is only adopted when the mode was unambiguous
  // and the value is one the pipeline already accepts.
  const categoryTied = aggregate.unresolvedReasons.includes("category_tie");
  const category =
    allowCategory && !categoryTied && aggregate.category !== null
      ? (categoryOptions.find((option) => option === aggregate.category) ??
        null)
      : null;

  if (panel.recommendation === "oppose") {
    return {
      relevance: 0,
      category,
      outcome: {
        ...common,
        kind: "opposed",
        reason: "panel voted against publication; relevance forced to 0",
        relevanceAfter: 0,
        category,
        categoryApplied: category !== null,
      },
    };
  }

  if (aggregate.score === null) {
    return {
      relevance,
      category,
      outcome: {
        ...common,
        kind: "unchanged",
        reason: "panel reached quorum without a mean score",
        relevanceAfter: relevance,
        category,
        categoryApplied: category !== null,
      },
    };
  }

  const next = Math.min(relevance, aggregate.score);
  return {
    relevance: next,
    category,
    outcome: {
      ...common,
      kind: next < relevance ? "demoted" : "unchanged",
      reason:
        next < relevance
          ? `panel relevance ceiling ${aggregate.score} below primary ${relevance}`
          : "panel did not lower the primary relevance",
      relevanceAfter: next,
      category,
      categoryApplied: category !== null,
    },
  };
}

export interface JevScoreReviewRequest {
  readonly items: readonly JevScoreItem[];
  /** Primary relevance per `items[].id`, absent when the item was not scored. */
  readonly relevanceById: ReadonlyMap<string, number>;
  readonly categoryOptions: readonly string[];
}

export type JevScoreReviewResult = ReadonlyMap<string, JevScoreReviewOutcome>;

export interface JevScoreReviewSummary {
  readonly outcomes: JevScoreReviewResult;
  readonly configReason: string;
  readonly configEnabled: boolean;
  readonly failMode: JevPanelFailMode;
}

/**
 * Run the panel over already-scored items. Never throws: a panel problem is
 * reported through the returned outcome, and the caller keeps its primary rows.
 */
export async function reviewScoredItemsWithJevPanel(
  env: Env,
  request: JevScoreReviewRequest
): Promise<JevScoreReviewSummary> {
  const config = resolveJevPanelWorkflowConfig(env, request.categoryOptions);
  const outcomes = new Map<string, JevScoreReviewOutcome>();
  const summaryBase = {
    configReason: config.reason,
    configEnabled: config.enabled,
    failMode: config.failMode,
  };

  if (!config.enabled) {
    return { outcomes, ...summaryBase };
  }

  if (!config.panel) {
    // A config that cannot be resolved is a misconfiguration, not a panel
    // verdict. It always degrades open: a typo must never reject a run.
    const kind: JevReviewOutcomeKind = "misconfigured";
    for (const item of request.items) {
      const relevance = request.relevanceById.get(item.id);
      if (relevance === undefined) continue;
      outcomes.set(
        item.id,
        baseOutcome(kind, `panel unusable: ${config.reason}`, relevance)
      );
    }
    return { outcomes, ...summaryBase };
  }

  const panel = config.panel;
  const chains = new Map<string, readonly string[]>(
    panel.judges.map((slot, index) => [slot.id, config.chains[index] ?? []])
  );
  const allowCategory = categoryAllowed(env);
  const runId = currentLlmCallRunId() ?? "no-run";

  const budgetMs = boundedBudget(env);
  const reviewed = await mapWithConcurrency(
    [...request.items],
    JEV_PANEL_CONCURRENCY,
    async (item): Promise<ReviewedRow | null> => {
      const relevance = request.relevanceById.get(item.id);
      if (relevance === undefined) return null;

      const key = memoKey(runId, item);
      const memo = panelMemo.get(key);
      if (memo) return { id: item.id, from: "memo", entry: memo };

      const fallback = (): ReviewedRow => ({
        id: item.id,
        from: "panel",
        relevance,
        category: null,
        outcome: baseOutcome(
          "error",
          "panel threw; primary score kept",
          relevance
        ),
      });

      try {
        const result = await runJevPanel({
          panel,
          subject: {
            id: item.id,
            untrustedContent: JSON.stringify({
              title: item.title,
              summary: item.summary ?? "",
              source: item.source,
            }),
            version: runId,
          },
          execute: createJevJudgeExecutor(env, {
            chains,
            categoryOptions: request.categoryOptions,
            timeoutMs: JEV_PANEL_MAX_JUDGE_TIMEOUT_MS,
            deadlineMs: Date.now() + budgetMs,
          }),
        });
        const applied = applyPanel(
          result,
          config.failMode,
          relevance,
          allowCategory,
          request.categoryOptions
        );
        const entry: MemoEntry = {
          panel: result,
          appliedRelevance: applied.relevance,
          category: applied.category,
        };
        memoize(key, entry);
        return {
          id: item.id,
          from: "panel",
          relevance: applied.relevance,
          category: applied.category,
          outcome: applied.outcome,
        };
      } catch (error) {
        // The core is written not to throw, but an adapter bug must still not
        // be able to take the scoring step down with it.
        console.error("jev panel review failed:", error);
        return fallback();
      }
    }
  );

  for (const row of reviewed) {
    if (!row) continue;
    if (row.from === "memo") {
      // A replay reuses the stored decision instead of spending judge calls
      // again, and re-applies the same monotonic ceiling, so a replay can
      // never move the item further than the first pass already did.
      const memo = row.entry;
      outcomes.set(row.id, {
        kind: "replayed",
        reason: "reused the memoized panel result for this run and item",
        recommendation: memo.panel.recommendation,
        quorumReached: memo.panel.finalAggregate.quorumReached,
        idempotencyKey: memo.panel.idempotencyKey,
        relevanceBefore:
          request.relevanceById.get(row.id) ?? memo.appliedRelevance,
        relevanceAfter: memo.appliedRelevance,
        category: memo.category,
        categoryApplied: memo.category !== null,
      });
      continue;
    }
    outcomes.set(row.id, row.outcome);
  }

  return { outcomes, ...summaryBase };
}

/**
 * Apply a reviewed relevance ceiling. Exposed for the call site so the
 * adjustment is one obvious, testable expression at the scoring boundary.
 */
export function jevPanelRelevance(
  primary: number,
  outcome: JevScoreReviewOutcome | undefined
): number {
  if (!outcome) return primary;
  return Math.min(primary, Math.max(0, Math.min(1, outcome.relevanceAfter)));
}
