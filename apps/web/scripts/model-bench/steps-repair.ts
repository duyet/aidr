/**
 * `draft-repair`: the one repair pass `translateItems` runs over EN→VI
 * drafts the deterministic check flags (worker/translation-draft-check.ts).
 * The bench calls `translateBatch` with the `fix` lists directly, not
 * `repairDrafts`, because that wrapper swallows provider errors and would
 * score a 429 as "no improvement".
 *
 * Dataset: stored prod VI translations that the current draft check flags,
 * stratified by issue type. Quality is prod's own gate (`acceptsRepair`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  sentSource,
  TRANSLATE_BATCH_SIZE,
  type TranslateInput,
  translateBatch,
} from "../../worker/llm";
import {
  acceptsRepair,
  translationDraftIssues,
} from "../../worker/translation-draft-check";
import type { KnowledgeRule } from "../../worker/translation-knowledge";
import { benchDir, d1, interleave, write } from "./build";
import type { Case, CaseResult, StepDef } from "./steps";

/** Prod's per-batch translate timeout (llm.ts TRANSLATE_BATCH_TIMEOUT_MS). */
const REPAIR_TIMEOUT_MS = 70_000;

/** Active rules as `loadActiveRules` returns them (bad_vi parsed). */
function benchRules(): KnowledgeRule[] {
  const rows = JSON.parse(
    readFileSync(path.join(benchDir, "knowledge-rules.json"), "utf-8")
  ) as (Omit<KnowledgeRule, "bad_vi"> & { bad_vi: string | string[] })[];
  return rows.map((r) => ({
    ...r,
    bad_vi: Array.isArray(r.bad_vi)
      ? r.bad_vi
      : (JSON.parse(r.bad_vi || "[]") as string[]),
  })) as KnowledgeRule[];
}

function issuesFor(c: Case, draft: { title: string; summary: string }) {
  const sent = sentSource({ i: 0, title: c.title, summary: c.summary }, false);
  return translationDraftIssues(
    { title: sent.title, summary: sent.summary ?? "" },
    draft,
    benchRules(),
    false
  );
}

const issueKind = (issue: string): string =>
  issue.startsWith("keep these terms")
    ? "keep"
    : issue.includes("must not be rendered")
      ? "avoid"
      : issue.includes("Title Case")
        ? "titlecase"
        : issue.includes("source length")
          ? "length"
          : "magnitude";

export const draftRepairStep: StepDef = {
  envVar: "ANYROUTER_TRANSLATE_MODEL",
  primary: "repair accepted by prod gate (fewer issues, still VI, ≥80% length)",
  units: (cases) =>
    Array.from(
      { length: Math.ceil(cases.length / TRANSLATE_BATCH_SIZE) },
      (_, i) =>
        cases.slice(i * TRANSLATE_BATCH_SIZE, (i + 1) * TRANSLATE_BATCH_SIZE)
    ),
  async run(env, unit) {
    const fixes = new Map<number, string[]>();
    const batch: TranslateInput[] = [];
    for (const [i, c] of unit.entries()) {
      const issues = issuesFor(c, c.draft);
      if (issues.length === 0) continue;
      fixes.set(i, issues);
      batch.push({ i, title: c.title, summary: c.summary });
    }
    const rows = batch.length
      ? await translateBatch(env, batch, REPAIR_TIMEOUT_MS, false, fixes)
      : [];
    return unit.map((c, i): CaseResult => {
      const draftIssues = fixes.get(i);
      // Rules changed since the build and the draft is clean now.
      if (!draftIssues) return { id: c.id, valid: true, metrics: {} };
      const row = rows.find((r) => r.i === i);
      if (!row?.title) return { id: c.id, valid: false, metrics: {} };
      const after = issuesFor(c, row);
      const accepted = acceptsRepair(
        [c.draft.title, c.draft.summary],
        [row.title, row.summary],
        draftIssues.length,
        after.length
      );
      return {
        id: c.id,
        valid: true,
        metrics: {
          accepted: Number(accepted),
          resolved: Number(accepted && after.length === 0),
          issuesBefore: draftIssues.length,
          issuesAfter: after.length,
        },
        output: { title: row.title, summary: row.summary, issues: after },
      };
    });
  },
  quality: (r) => {
    const scored = r.filter((x) => !x.valid || x.metrics.accepted != null);
    if (scored.length === 0) return null;
    const pts = scored.map((x) =>
      x.valid
        ? 0.6 * (x.metrics.accepted ?? 0) + 0.4 * (x.metrics.resolved ?? 0)
        : 0
    );
    return pts.reduce((a, b) => a + b, 0) / pts.length;
  },
};

/** Stored EN→VI rows the current draft check flags; the stored VI is the
 * draft, the issue list is what prod would send as `fix`. */
export function buildDraftRepair() {
  const rows = d1<{
    id: string;
    title: string;
    summary: string;
    vi_title: string;
    vi_summary: string;
  }>(
    `SELECT i.id, i.title, coalesce(i.summary,'') AS summary, t.title AS vi_title, coalesce(t.summary,'') AS vi_summary
     FROM items i JOIN translations t ON t.item_id = i.id AND t.lang = 'vi' AND t.source_lang = 'en'
     WHERE i.status = 'published' AND t.title IS NOT NULL AND length(i.summary) > 80
     ORDER BY i.published_at DESC LIMIT 600`
  );
  const byKind = new Map<string, Case[]>();
  for (const r of rows) {
    const c = {
      id: r.id,
      title: r.title,
      summary: r.summary,
      draft: { title: r.vi_title, summary: r.vi_summary },
    };
    const issues = issuesFor(c, c.draft);
    if (issues.length === 0) continue;
    const kind = issueKind(issues[0]);
    const list = byKind.get(kind) ?? [];
    list.push({
      ...c,
      issues,
      labelSource: `derived:translationDraftIssues(${kind}) on stored translations.vi`,
    });
    byKind.set(kind, list);
  }
  const cases = interleave(...byKind.values()).slice(0, 36);
  write(
    "draft-repair",
    ["derived:translationDraftIssues on stored translations.vi"],
    cases
  );
}
