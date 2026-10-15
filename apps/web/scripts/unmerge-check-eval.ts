#!/usr/bin/env tsx
/**
 * Offline replay of the #797 model same-story check on the #794 hand labels
 * (`scripts/fixtures/unmerge-check-797.json`). It plans `unmerge --dangling`
 * from a cached production snapshot, runs the check's real prefilter,
 * batching, cluster gate and planner, and puts a stub where the model would
 * answer. No model call and no D1: a query missing from the cache throws.
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/unmerge-check-eval.ts <snapcache.json> <window.json>
 *     [--verdicts <unmerge_checks.json>]
 *
 * - snapcache.json: `{ [sql]: rows }` for every SELECT `loadDanglingSnapshot`
 *   makes (the #794 lab's `timeplan.mts` cache). `unmerge_checks` predates
 *   it and reads as empty.
 * - window.json: published and merged rows (`id, source_id, url, title,
 *   status, published_at, source_lang, title_en`) around the dangling rows.
 * - --verdicts: rows exported from production `unmerge_checks` after a real
 *   check (`SELECT * FROM unmerge_checks`), replayed instead of the stubs.
 *
 * Stubs: `none` links nothing (today's plan, minus the stories it would
 * hold); `oracle` links each labelled duplicate to its labelled live copy
 * and nothing else (the best the gate and window allow); `all` links every
 * story to every live row in its call (the most a model could hold).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Cluster, clusterPrompt } from "../worker/dedupe";
import {
  batchPrompt,
  CHECK_EXISTING_WINDOW,
  CHECK_VERSION,
  CHECKS_SQL,
  type CheckBatch,
  type CheckVerdict,
  checkWork,
  judgeBatch,
  type LiveRow,
  noEvidenceVerdict,
  parseChecks,
  planCheckBatches,
  type StoredCheck,
} from "../worker/unmerge/check";
import {
  loadDanglingSnapshot,
  pendingCandidates,
} from "../worker/unmerge/load";
import {
  type DanglingSnapshot,
  type PairOutcome,
  planDanglingUnmerge,
  type UnmergePlan,
} from "../worker/unmerge/plan";

interface Fixture {
  labels: Record<string, Record<string, "dup" | "no">>;
  unlabelled: Record<string, string[]>;
  copies: Record<string, string>;
}

type Stub = (
  batch: CheckBatch,
  prompt: ReturnType<typeof batchPrompt>,
  call: number
) => Cluster[];

const [snapcacheFile, windowFile] = process.argv.slice(2);
if (!snapcacheFile || !windowFile) {
  console.error(
    "usage: unmerge-check-eval.ts <snapcache.json> <window.json> [--verdicts <file>]"
  );
  process.exit(1);
}
const verdictsAt = process.argv.indexOf("--verdicts");
const verdictsFile = verdictsAt > 0 ? process.argv[verdictsAt + 1] : undefined;

const fixture = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures/unmerge-check-797.json"
    ),
    "utf8"
  )
) as Fixture;
const cache = JSON.parse(readFileSync(snapcacheFile, "utf8")) as Record<
  string,
  Record<string, unknown>[]
>;
const select = async (sql: string) => {
  if (sql === CHECKS_SQL) return [];
  const rows = cache[sql];
  if (!rows) throw new Error(`not in the cache: ${sql.slice(0, 120)}`);
  return rows;
};
const windowRows = JSON.parse(readFileSync(windowFile, "utf8")) as Record<
  string,
  unknown
>[];
const live: LiveRow[] = windowRows
  .filter((row) => row.status === "published")
  .map((row) => {
    const sourceLang = (row.source_lang as string | null) ?? null;
    const titleEn = (row.title_en as string | null) ?? null;
    return {
      id: String(row.id),
      source_id: String(row.source_id),
      url: String(row.url),
      title: String(row.title),
      published_at: Number(row.published_at),
      source_lang: sourceLang,
      title_en: sourceLang === "vi" ? titleEn : null,
      // The dump has only the English title of a Vietnamese row; the Worker
      // also reads the Vietnamese title of an English row.
      translation: sourceLang === "vi" ? titleEn : null,
    };
  });
const windowFrom = Math.min(...live.map((row) => row.published_at));
const windowTo = Math.max(...live.map((row) => row.published_at));

const snapshot = await loadDanglingSnapshot(select);
const nowMs = Date.now();

const stubs: Record<string, Stub> = {
  none: () => [],
  oracle: (batch, prompt, call) => {
    const shown = new Set(batch.chunks[call].map((row) => row.id));
    return batch.work.flatMap(({ candidate }) => {
      const copies = candidate.rows
        .map((row) => fixture.copies[row.id])
        .filter(
          (copy): copy is string => copy !== undefined && shown.has(copy)
        );
      const indices = [...prompt.owner]
        .filter(([, story]) => story === candidate.story)
        .map(([i]) => i);
      return copies.length > 0 ? [{ new: indices, existing: copies }] : [];
    });
  },
  all: (batch, prompt, call) =>
    prompt.newItems.map((item) => ({
      new: [item.i],
      existing: batch.chunks[call].map((row) => row.id),
    })),
};

interface Replay {
  plan: UnmergePlan;
  calls: number;
  rounds: number;
  promptChars: number;
  truncated: number;
  verdicts: number;
}

function withChecks(
  checks: ReadonlyMap<string, StoredCheck>
): DanglingSnapshot {
  return { ...snapshot, checks };
}

/** Checks pending stories with `stub` until none waits, as repeated
 * `--model-check` requests would. */
function replay(stub: Stub): Replay {
  const checks = new Map<string, StoredCheck>();
  const out = {
    calls: 0,
    rounds: 0,
    promptChars: 0,
    truncated: 0,
    verdicts: 0,
  };
  for (; out.rounds < 10; out.rounds++) {
    const pending = pendingCandidates(withChecks(checks), [], nowMs);
    if (pending.length === 0) break;
    out.truncated += pending.filter(
      (c) => c.from < windowFrom || c.to > windowTo
    ).length;
    const work = checkWork(pending, live);
    const verdicts: CheckVerdict[] = work
      .filter((w) => w.live.length === 0)
      .map(noEvidenceVerdict);
    for (const batch of planCheckBatches(work)) {
      const prompt = batchPrompt(batch);
      const clusters = prompt.calls.flatMap((existing, call) => {
        out.calls++;
        out.promptChars += clusterPrompt(
          prompt.newItems,
          existing,
          CHECK_EXISTING_WINDOW
        ).length;
        return stub(batch, prompt, call);
      });
      verdicts.push(...judgeBatch(batch, prompt, clusters));
    }
    for (const v of verdicts) {
      checks.set(v.story, {
        story: v.story,
        version: CHECK_VERSION,
        verdict: v.verdict,
        matches: v.matches,
      });
    }
    out.verdicts += verdicts.length;
  }
  return { ...out, plan: planDanglingUnmerge(withChecks(checks), nowMs) };
}

function replayStored(file: string): Replay {
  const checks = parseChecks(
    JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[]
  );
  return {
    plan: planDanglingUnmerge(withChecks(checks), nowMs),
    calls: 0,
    rounds: 0,
    promptChars: 0,
    truncated: 0,
    verdicts: checks.size,
  };
}

/** What became of the story a sampled lead (8-hex prefix) is in. */
function fate(plan: UnmergePlan, lead: string): string {
  const story = plan.canonicals.find((c) =>
    c.pairs.some(({ pair }) => pair.mergedId.startsWith(lead))
  );
  if (!story) return "not dangling now";
  const outcomes = story.pairs.map(({ outcome }) => outcome);
  const published = outcomes.find(
    (o): o is Extract<PairOutcome, { action: "restore" }> =>
      o.action === "restore" && o.status === "published"
  );
  if (published) return "published";
  const first = outcomes[0];
  if (first.action === "skip") {
    return first.reason === "needs-decision" &&
      first.detail.startsWith("the model check")
      ? "held by the model check"
      : `held: ${first.reason}`;
  }
  return first.action;
}

function countPairs(plan: UnmergePlan): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of plan.canonicals) {
    for (const { outcome } of c.pairs) {
      const key =
        outcome.action === "skip" || outcome.action === "noop"
          ? `${outcome.action}:${outcome.reason}`
          : outcome.action;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

const runs: [string, Replay][] = verdictsFile
  ? [["stored", replayStored(verdictsFile)]]
  : Object.entries(stubs).map(([name, stub]) => [name, replay(stub)]);

const report: Record<string, unknown> = {};
for (const [name, run] of runs) {
  const publishedStories = run.plan.canonicals.filter((c) =>
    c.pairs.some(
      ({ outcome }) =>
        outcome.action === "restore" && outcome.status === "published"
    )
  ).length;
  const samples: Record<string, unknown> = {};
  for (const [sample, labels] of Object.entries(fixture.labels)) {
    const rows = Object.entries(labels).map(([lead, label]) => ({
      lead,
      label,
      fate: fate(run.plan, lead),
    }));
    samples[sample] = {
      duplicatesPublished: rows
        .filter((r) => r.label === "dup" && r.fate === "published")
        .map((r) => r.lead),
      duplicatesHeld: rows
        .filter((r) => r.label === "dup" && r.fate.startsWith("held"))
        .map((r) => `${r.lead} (${r.fate})`),
      distinctHeldByModel: rows
        .filter((r) => r.label === "no" && r.fate === "held by the model check")
        .map((r) => r.lead),
      distinctPublished: rows.filter(
        (r) => r.label === "no" && r.fate === "published"
      ).length,
      other: rows
        .filter(
          (r) => !["published"].includes(r.fate) && !r.fate.startsWith("held")
        )
        .map((r) => `${r.lead} (${r.fate})`),
    };
  }
  for (const [sample, leads] of Object.entries(fixture.unlabelled)) {
    const fates: Record<string, number> = {};
    for (const lead of leads) {
      const f = fate(run.plan, lead);
      fates[f] = (fates[f] ?? 0) + 1;
    }
    samples[sample] = fates;
  }
  report[name] = {
    calls: run.calls,
    rounds: run.rounds,
    verdicts: run.verdicts,
    promptChars: run.promptChars,
    candidatesWithTruncatedWindow: run.truncated,
    publishedStories,
    pairs: countPairs(run.plan),
    samples,
  };
}
process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
console.error(
  `window.json covers ${new Date(windowFrom * 1000).toISOString()} to ${new Date(windowTo * 1000).toISOString()}`
);
