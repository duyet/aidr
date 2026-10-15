#!/usr/bin/env tsx
/**
 * Local agent CLI: audit production and run or rerun pipeline steps without
 * sending any email or Telegram.
 *
 * Usage (from repo root):
 *   pnpm --filter @aidr/web agent audit [--run <id>] [--runs N]
 *   pnpm --filter @aidr/web agent ranking [--limit N]
 *   pnpm --filter @aidr/web agent tldr-preview
 *   pnpm --filter @aidr/web agent tldr-regenerate [--date YYYY-MM-DD]
 *     [--dry-run]   (writes the row only if it is a model digest)
 *   pnpm --filter @aidr/web agent run [--steps a,b] [--force] [--wait]
 *   pnpm --filter @aidr/web agent rerun <step> [--force] [--wait]
 *   pnpm --filter @aidr/web agent day-video <YYYY-MM-DD> [--video <url|id>]
 *     [--short <url|id>] [--title <text>] [--lang en|vi] [--clear-video]
 *     [--clear-short] [--delete]
 *   pnpm --filter @aidr/web agent day-video-telegram <YYYY-MM-DD>
 *     --lang en|vi [--chat <id>]   (sends a real Telegram message)
 *   pnpm --filter @aidr/web agent day-video-posted <YYYY-MM-DD>
 *     --channel telegram-en|telegram-vi --ref <chat_id>/<message_id>
 *   pnpm --filter @aidr/web agent unmerge <pairs.json> [--apply]
 *     (dry run reads prod D1 with SELECTs only; --apply writes, sends nothing)
 *   pnpm --filter @aidr/web agent unmerge --dangling [decisions.json] [--apply]
 *     (restores merged rows whose canonical id names no item, #791; same
 *     read-only dry run and undo as unmerge; decisions.json holds
 *     `{ mergedId, sameAs | distinctFrom }` entries for held stories)
 *   pnpm --filter @aidr/web agent unmerge --undo <batchId>
 *     [--canonical <id,...>] [--apply]
 *     (reverses one apply from its admin_audit rows, or only the named
 *     canonicals' writes in it; dry run by default)
 *   pnpm --filter @aidr/web agent backfill-tags [--apply]
 *     (fallback tags for published stories stored with none; the dry run
 *     reads prod D1 with SELECTs only, neither calls a model; undo with
 *     unmerge --undo <batchId>)
 *
 * `run` and `rerun` are dry runs unless `--live` is passed. A dry run sends
 * no email, Telegram or owner alert and only previews the TL;DR, but still
 * writes fetched items to D1 (see apps/web/ALGORITHM.md, "Dry runs").
 * `rerun weekly --wait` previews last week's weekly edition (`weeklyPreview`
 * in the run summary) without writing `weekly_snapshots`.
 * `tldr-regenerate` rebuilds one date's TL;DR row (default today, ICT) and
 * sends nothing; see apps/web/ALGORITHM.md, "Admin regenerate".
 *
 * Reads NEWS_ADMIN_TOKEN and optional AIDR_BASE_URL (default
 * https://aidr.today) from the environment or the repo-root `.env.local`.
 * Prints compact JSON on stdout and a short summary on stderr. Never prints
 * the token.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { latestArchiveDate } from "../src/lib/day-archive";
import type {
  BackfillTagsResult,
  UndoUnmergeResult,
  UnmergeResult,
} from "../worker/admin/handlers";
import { isPipelineStep, PIPELINE_STEPS } from "../worker/ingest/mode";
import { loadTagBackfill, planTagBackfill } from "../worker/tag-backfill";
import {
  loadDanglingSnapshot,
  loadUnmergeSnapshot,
} from "../worker/unmerge/load";
import {
  parseDanglingDecisions,
  parseUnmergePairs,
  planDanglingUnmerge,
  planUnmerge,
  toWirePair,
  unknownDecisionIds,
} from "../worker/unmerge/plan";
import { countUnmerge } from "../worker/unmerge/report";
import { loadUndo, planUndo, scopeUndoRecords } from "../worker/unmerge/undo";
import {
  type Args,
  parseArgs,
  parseUnmergeCommand,
  type UnmergeCommand,
  undoScopeMismatch,
} from "./agent-args";
import { wranglerSelect, wranglerSelectTotals } from "./cf-d1";

const DEFAULT_BASE = "https://aidr.today";
const WAIT_INTERVAL_MS = 15_000;
const WAIT_TIMEOUT_MS = 30 * 60 * 1000;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

const fileEnv = readEnvFile(path.join(repoRoot, ".env.local"));
const env = (name: string): string | undefined =>
  process.env[name] || fileEnv[name] || undefined;

const base = (env("AIDR_BASE_URL") ?? DEFAULT_BASE).replace(/\/$/, "");

function fail(message: string): never {
  console.error(`aidr-agent: ${message}`);
  process.exit(1);
}

function token(): string {
  const value = env("NEWS_ADMIN_TOKEN");
  if (!value) fail("NEWS_ADMIN_TOKEN is not set (env or .env.local)");
  return value;
}

async function api<T>(
  pathname: string,
  init: { method?: string; body?: unknown; admin?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.admin) headers.authorization = `Bearer ${token()}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${pathname}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { body: text.slice(0, 200) };
  }
  if (!response.ok) {
    fail(
      `${init.method ?? "GET"} ${pathname} -> HTTP ${response.status}: ${JSON.stringify(json)}`
    );
  }
  return json as T;
}

function flagNumber(args: Args, name: string, fallback: number): number {
  const raw = args.flags.get(name);
  const n = typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function print(value: unknown, summary: string): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  console.error(summary);
}

interface RunStep {
  name: string;
  action: string;
  reason?: string;
}

interface RunRow {
  id: string;
  started_at: number | null;
  finished_at: number | null;
  items_fetched: number | null;
  items_new: number | null;
  error: string | null;
  stats: {
    steps?: RunStep[];
    mode?: string;
    selectedSteps?: string[];
    tldrPreview?: unknown;
    weeklyPreview?: unknown;
    published?: number;
    tokens?: number;
  } | null;
}

function compactRun(run: RunRow) {
  return {
    id: run.id,
    started_at: run.started_at,
    finished_at: run.finished_at,
    finished: isFinished(run),
    error: run.error,
    mode: run.stats?.mode ?? "live",
    selectedSteps: run.stats?.selectedSteps,
    fetched: run.items_fetched,
    new: run.items_new,
    published: run.stats?.published,
    tokens: run.stats?.tokens,
    tldrPreview: run.stats?.tldrPreview,
    weeklyPreview: run.stats?.weeklyPreview,
    steps: (run.stats?.steps ?? []).map((s) =>
      s.reason
        ? `${s.name}: ${s.action} (${s.reason})`
        : `${s.name}: ${s.action}`
    ),
  };
}

/** `finished_at` equals `started_at` on an opened row, so it cannot tell a
 * finished run apart; `close-run` is the last step every run records. */
function isFinished(run: RunRow): boolean {
  return (run.stats?.steps ?? []).some((s) => s.name === "close-run");
}

async function loadRuns(): Promise<RunRow[]> {
  const { runs } = await api<{ runs: RunRow[] }>("/api/system/runs");
  return runs ?? [];
}

/** `LlmCallRow` from src/lib/system-queries.ts. */
interface Attempt {
  task: string;
  model: string;
  route?: string[];
  provider?: string | null;
  ok: boolean;
  durationMs: number;
  tokens: number;
  error: string | null;
  errorCode: string | null;
}

async function audit(args: Args): Promise<void> {
  const runCount = flagNumber(args, "runs", 5);
  const [overview, runs] = await Promise.all([
    api<Record<string, unknown>>("/api/system/overview"),
    loadRuns(),
  ]);
  const wanted = args.flags.get("run");
  const target =
    typeof wanted === "string" ? runs.find((r) => r.id === wanted) : runs[0];
  if (typeof wanted === "string" && !target) {
    fail(`run ${wanted} is not in the last ${runs.length} runs`);
  }
  const attempts = target
    ? await api<{ attempts: Attempt[]; status: string; truncated: boolean }>(
        `/api/system/run-attempts?run_id=${encodeURIComponent(target.id)}`
      )
    : null;
  const lastRun = overview.lastRun as RunRow | undefined;
  // Digest "useful?" votes; needs NEWS_ADMIN_TOKEN, null until 0054 is applied.
  const mailFeedback = env("NEWS_ADMIN_TOKEN")
    ? await api<{
        feedback: Array<{
          date: string;
          lang: string;
          yes: number;
          no: number;
        }> | null;
      }>("/api/admin/mail/feedback?days=7", { admin: true }).then(
        (r) => r.feedback
      )
    : null;
  const result = {
    mailFeedback,
    health: {
      runsToday: overview.runsToday,
      lastRun: lastRun ? compactRun(lastRun) : null,
      totals: overview.totals,
    },
    runs: runs.slice(0, runCount).map(compactRun),
    attempts: attempts
      ? {
          runId: target?.id,
          status: attempts.status,
          truncated: attempts.truncated,
          calls: attempts.attempts.map((a) => ({
            task: a.task,
            model: a.model,
            route: a.route ?? [],
            provider: a.provider ?? null,
            ok: a.ok,
            durationMs: a.durationMs,
            tokens: a.tokens,
            error: a.error,
            errorCode: a.errorCode,
          })),
        }
      : null,
  };
  const failed = result.attempts?.calls.filter((c) => !c.ok).length ?? 0;
  print(
    result,
    `audit: ${runs.length} runs, latest ${target?.id ?? "none"} (${target ? (isFinished(target) ? "finished" : "running") : "-"}), ${result.attempts?.calls.length ?? 0} LLM attempts, ${failed} failed`
  );
}

async function ranking(args: Args): Promise<void> {
  const limit = flagNumber(args, "limit", 20);
  const result = await api<{ items: { rank: number; title: string }[] }>(
    `/api/admin/preview/ranking?limit=${limit}`,
    { admin: true }
  );
  print(
    result,
    `ranking: ${result.items.length} items; #1 ${result.items[0]?.title ?? "-"}`
  );
}

async function tldrPreview(): Promise<void> {
  const result = await api<{
    generated: boolean;
    reason: string;
    bullets_en: unknown[];
    bullets_vi: unknown[];
    operationId: string;
  }>("/api/admin/preview/tldr", { method: "POST", admin: true });
  print(
    result,
    `tldr-preview: ${result.bullets_en.length} en / ${result.bullets_vi.length} vi bullets (${result.reason}); LLM calls under ${result.operationId}; nothing written or sent`
  );
}

/** Plan (default) or apply an unmerge. The dry run reads production D1
 * through `wrangler d1 execute` with SELECTs only, so it needs no deploy;
 * `--apply` posts the pairs to the admin endpoint, which re-plans from live
 * rows and writes. */
async function unmerge(args: Args): Promise<void> {
  const command = parseUnmergeCommand(args);
  if ("error" in command) fail(command.error);
  if (command.kind === "undo") return undoUnmergeBatch(command);
  if (command.kind === "dangling") return unmergeDangling(command);
  const raw: unknown = JSON.parse(readFileSync(command.file, "utf-8"));
  const parsed = parseUnmergePairs(
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { pairs?: unknown }).pairs
      : raw
  );
  if ("error" in parsed) fail(parsed.error);
  if (command.apply) {
    const result = await api<UnmergeResult>("/api/admin/unmerge", {
      method: "POST",
      admin: true,
      body: { pairs: parsed.pairs.map(toWirePair), dryRun: false },
    });
    print(
      result,
      `unmerge: applied ${result.applied?.canonicals ?? 0} canonical(s) as batch ${result.applied?.batchId} (undo: --undo ${result.applied?.batchId}), ${JSON.stringify(result.counts.pairs)}${result.applied?.remaining ? `; ${result.applied.remaining} canonical(s) over the statement budget, rerun --apply` : ""}${result.applied?.stale.length ? `; ${result.applied.stale.length} canonical(s) changed since planning and were not written, rerun --apply` : ""}${result.applied?.failed ? `; stopped at ${result.applied.failed.canonicalId}: ${result.applied.failed.error}` : ""}`
    );
    return;
  }
  const snapshot = await loadUnmergeSnapshot(
    async (sql) => wranglerSelect(sql),
    parsed.pairs
  );
  const plan = planUnmerge(parsed.pairs, snapshot, Date.now());
  const counts = countUnmerge(plan);
  print(
    { dryRun: true, readOnly: wranglerSelectTotals, counts, plan },
    `unmerge dry run (nothing written; ${wranglerSelectTotals.queries} read-only queries): ${JSON.stringify(counts.pairs)}`
  );
}

/** Plan (default) or apply the restore of merged rows whose canonical id
 * names no item (#791). Same read and apply paths as `unmerge`; the apply
 * posts the same decisions, so it plans what the dry run printed. */
async function unmergeDangling({
  file,
  apply,
}: Extract<UnmergeCommand, { kind: "dangling" }>): Promise<void> {
  const raw: unknown = file
    ? JSON.parse(readFileSync(file, "utf-8"))
    : undefined;
  const decisions =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { decisions?: unknown }).decisions
      : raw;
  const parsed = parseDanglingDecisions(decisions);
  if ("error" in parsed) fail(parsed.error);
  if (apply) {
    const result = await api<UnmergeResult>("/api/admin/unmerge", {
      method: "POST",
      admin: true,
      body: { dangling: true, decisions, dryRun: false },
    });
    print(
      result,
      `unmerge --dangling: applied ${result.applied?.canonicals ?? 0} story batch(es) as batch ${result.applied?.batchId} (undo: --undo ${result.applied?.batchId}), ${JSON.stringify(result.counts.pairs)}${result.applied?.remaining ? `; ${result.applied.remaining} batch(es) over the statement budget, rerun --apply` : ""}${result.applied?.stale.length ? `; ${result.applied.stale.length} batch(es) changed since planning and were not written, rerun --apply` : ""}${result.applied?.failed ? `; stopped at ${result.applied.failed.canonicalId}: ${result.applied.failed.error}` : ""}`
    );
    return;
  }
  const snapshot = await loadDanglingSnapshot(
    async (sql) => wranglerSelect(sql),
    parsed.decisions
  );
  const unknown = unknownDecisionIds(parsed.decisions, snapshot);
  if (unknown.length > 0) fail(`decisions name no item: ${unknown.join(", ")}`);
  const plan = planDanglingUnmerge(snapshot, Date.now(), parsed.decisions);
  const counts = countUnmerge(plan);
  print(
    { dryRun: true, readOnly: wranglerSelectTotals, counts, plan },
    `unmerge --dangling dry run (nothing written; ${wranglerSelectTotals.queries} read-only queries): ${snapshot.dangling.length} rows in ${plan.canonicals.length} stories, ${JSON.stringify(counts.pairs)}`
  );
}

/** Plan (default) or apply the undo of one unmerge apply, or of the named
 * canonicals in it. The dry run reads the batch's `admin_audit` rows and the
 * touched rows through `wrangler d1 execute` with SELECTs only. */
async function undoUnmergeBatch({
  batchId,
  canonicalIds,
  apply,
}: Extract<UnmergeCommand, { kind: "undo" }>): Promise<void> {
  const label = `${batchId}${canonicalIds ? ` (${canonicalIds.length} canonical(s))` : ""}`;
  if (apply) {
    if (canonicalIds) await assertUndoScoped(batchId, canonicalIds);
    const result = await api<UndoUnmergeResult>("/api/admin/unmerge/undo", {
      method: "POST",
      admin: true,
      body: {
        batchId,
        ...(canonicalIds ? { canonicalIds } : {}),
        dryRun: false,
      },
    });
    print(
      result,
      `unmerge undo of ${label}: wrote ${result.applied?.canonicals ?? 0} canonical(s), ${result.applied?.stale.length ?? 0} changed since planning${result.applied?.failed ? `; stopped at ${result.applied.failed.canonicalId}: ${result.applied.failed.error}` : ""}`
    );
    return;
  }
  const { records, state } = await loadUndo(
    async (sql) => wranglerSelect(sql),
    batchId
  );
  if (records.length === 0) fail(`no unmerge audit rows for batch ${batchId}`);
  const scoped = scopeUndoRecords(records, canonicalIds);
  if ("error" in scoped) fail(scoped.error);
  const plan = planUndo(batchId, scoped.records, state);
  const states: Record<string, number> = {};
  for (const c of plan.canonicals) states[c.state] = (states[c.state] ?? 0) + 1;
  print(
    { dryRun: true, readOnly: wranglerSelectTotals, plan },
    `unmerge undo dry run of ${label} (nothing written; ${wranglerSelectTotals.queries} read-only queries): ${JSON.stringify(states)}`
  );
}

/** The local dry run runs this checkout's code; `--apply` runs the deployed
 * Worker's. A Worker from before `canonicalIds` (#795) ignores the field and
 * would undo the whole batch, so ask it for a dry run first and refuse
 * unless it plans exactly the named canonicals. */
async function assertUndoScoped(
  batchId: number,
  canonicalIds: readonly string[]
): Promise<void> {
  const dry = await api<UndoUnmergeResult>("/api/admin/unmerge/undo", {
    method: "POST",
    admin: true,
    body: { batchId, canonicalIds, dryRun: true },
  });
  const mismatch = undoScopeMismatch(
    dry.plan.canonicals.map((c) => c.canonicalId),
    canonicalIds
  );
  if (mismatch) fail(`${mismatch}. Nothing written.`);
}

/** Plan (default) or apply the fallback-tag backfill. The dry run reads
 * production D1 through `wrangler d1 execute` with SELECTs only; `--apply`
 * posts to the admin endpoint, which re-plans from live rows and writes. */
async function backfillTags(args: Args): Promise<void> {
  if (args.flags.has("apply")) {
    const result = await api<BackfillTagsResult>("/api/admin/tags/backfill", {
      method: "POST",
      admin: true,
      body: { dryRun: false },
    });
    const applied = result.applied;
    print(
      result,
      `backfill-tags: tagged ${applied?.canonicals ?? 0} stories as batch ${applied?.batchId} (undo: unmerge --undo ${applied?.batchId}), ${JSON.stringify(result.counts)}${applied?.remaining ? `; ${applied.remaining} over the statement budget, rerun --apply` : ""}${applied?.stale.length ? `; ${applied.stale.length} changed since planning and were not written, rerun --apply` : ""}${applied?.failed ? `; stopped at ${applied.failed.canonicalId}: ${applied.failed.error}` : ""}`
    );
    return;
  }
  const { rows, known } = await loadTagBackfill(async (sql) =>
    wranglerSelect(sql)
  );
  const plan = planTagBackfill(rows, known, Date.now());
  const counts = {
    tag: plan.tag.length,
    noMatch: plan.noMatch.length,
    recent: plan.recent.length,
  };
  print(
    { dryRun: true, readOnly: wranglerSelectTotals, counts, plan },
    `backfill-tags dry run (nothing written, no model call; ${wranglerSelectTotals.queries} read-only queries): ${JSON.stringify(counts)}`
  );
}

/** Rebuild one date's TL;DR row. Always uses the dated route, which a
 * server without it answers 404, so nothing is written there. */
async function tldrRegenerate(args: Args): Promise<void> {
  const raw = args.flags.get("date");
  if (raw === true) fail("--date needs a YYYY-MM-DD value");
  const date = raw ?? latestArchiveDate(Date.now());
  const dryRun = args.flags.has("dry-run");
  const result = await api<{
    written: boolean;
    reason: string;
    bullets_en: unknown[];
    bullets_vi: unknown[];
    operationId: string;
  }>(`/api/admin/tldr/regenerate/${encodeURIComponent(date)}`, {
    method: "POST",
    body: dryRun ? { dryRun: true } : {},
    admin: true,
  });
  print(
    result,
    `tldr-regenerate ${date}${dryRun ? " (dry run)" : ""}: ${result.written ? "written" : "not written"}, ${result.bullets_en.length} en / ${result.bullets_vi.length} vi bullets (${result.reason}); LLM calls under ${result.operationId}; nothing sent`
  );
}

/** Set, clear or delete the YouTube media on `/date/<date>`. */
async function dayVideo(args: Args, date: string | undefined): Promise<void> {
  if (!date) fail("day-video needs a YYYY-MM-DD date");
  const pathname = `/api/admin/day-videos/${encodeURIComponent(date)}`;
  const value = (name: string): string | undefined => {
    const raw = args.flags.get(name);
    if (raw === true) fail(`--${name} needs a value`);
    return raw;
  };
  const lang = value("lang");
  if (lang !== undefined && lang !== "en" && lang !== "vi") {
    fail("--lang must be en or vi");
  }
  if (args.flags.has("delete")) {
    const result = await api<{ deleted: boolean }>(
      lang ? `${pathname}?lang=${lang}` : pathname,
      { method: "DELETE", admin: true }
    );
    print(
      result,
      `day-video ${date}${lang ? ` (${lang})` : ""}: ${result.deleted ? "deleted" : "none"}`
    );
    return;
  }
  const body: Record<string, string | null> = {};
  if (lang) body.lang = lang;
  const video = value("video");
  const short = value("short");
  const title = value("title");
  if (video !== undefined) body.video = video;
  if (short !== undefined) body.short = short;
  if (title !== undefined) body.title = title;
  if (args.flags.has("clear-video")) body.video = null;
  if (args.flags.has("clear-short")) body.short = null;
  if (Object.keys(body).filter((key) => key !== "lang").length === 0) {
    fail("day-video needs --video, --short, --title, --clear-* or --delete");
  }
  const result = await api<{
    video: { youtube_id: string | null; short_id: string | null };
    digest_button: string;
  }>(pathname, { method: "PUT", body, admin: true });
  print(
    result,
    `day-video ${date}${lang ? ` (${lang})` : ""}: video=${result.video.youtube_id ?? "-"} short=${result.video.short_id ?? "-"} → ${base}/date/${date} (digest button: ${result.digest_button})`
  );
}

/** Post the day's video for one language to Telegram (a real message). */
async function dayVideoTelegram(
  args: Args,
  date: string | undefined
): Promise<void> {
  if (!date) fail("day-video-telegram needs a YYYY-MM-DD date");
  const lang = args.flags.get("lang");
  if (lang !== "en" && lang !== "vi") fail("--lang en|vi is required");
  const chat = args.flags.get("chat");
  if (chat === true) fail("--chat needs a value");
  const result = await api<{
    chat_id: string;
    message_id: string;
    digest_button?: string;
  }>(`/api/admin/day-videos/${encodeURIComponent(date)}/telegram`, {
    method: "POST",
    body: { lang, ...(chat ? { chat_id: chat } : {}) },
    admin: true,
  });
  print(
    result,
    `day-video-telegram ${date} (${lang}): message ${result.message_id} in chat ${result.chat_id}${result.digest_button ? ` (digest button: ${result.digest_button})` : ""}`
  );
}

/** Record a Telegram post of the day's video for the day video watchdog. */
async function dayVideoPosted(
  args: Args,
  date: string | undefined
): Promise<void> {
  if (!date) fail("day-video-posted needs a YYYY-MM-DD date");
  const channel = args.flags.get("channel");
  const ref = args.flags.get("ref");
  if (typeof channel !== "string" || typeof ref !== "string")
    fail("day-video-posted needs --channel and --ref");
  const result = await api<{ channel: string; ref: string }>(
    `/api/admin/day-videos/${encodeURIComponent(date)}/posts`,
    { method: "PUT", body: { channel, ref }, admin: true }
  );
  print(result, `day-video-posted ${date}: ${result.channel} ${result.ref}`);
}

function parseSteps(raw: string | true | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  if (raw === true) fail("--steps needs a comma-separated list");
  const steps = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = steps.filter((s) => !isPipelineStep(s));
  if (unknown.length > 0) {
    fail(
      `unknown steps: ${unknown.join(", ")} (valid: ${PIPELINE_STEPS.join(", ")})`
    );
  }
  return steps;
}

async function assertDryRunSupported(): Promise<void> {
  const response = await fetch(`${base}/api/admin/preview/ranking?limit=1`, {
    headers: { authorization: `Bearer ${token()}` },
  });
  if (response.status === 404) {
    fail(
      `${base} does not support dry runs or step selection yet (deploy first); nothing was triggered`
    );
  }
  if (!response.ok) {
    fail(
      `dry-run support probe -> HTTP ${response.status}; nothing was triggered`
    );
  }
}

async function trigger(args: Args, steps: string[] | undefined): Promise<void> {
  const live = args.flags.has("live");
  if (live && args.flags.has("dry-run"))
    fail("pass --dry-run or --live, not both");
  const body = {
    ...(args.flags.has("force") ? { force: true } : {}),
    ...(live ? {} : { dryRun: true }),
    ...(steps ? { steps } : {}),
  };
  // A server without dry-run support ignores the body, so `{ dryRun }`
  // would start a real run that emails and posts to Telegram. Probe a
  // route that shipped with dry runs before sending anything.
  if (body.dryRun || steps) await assertDryRunSupported();
  const result = await api<{
    id: string | null;
    skipped: boolean;
    reason?: string;
    dryRun?: boolean;
    steps?: string[];
  }>("/api/admin/ingest", { method: "POST", body, admin: true });
  if (body.dryRun && result.id && result.dryRun !== true) {
    fail(
      `server started ${result.id} WITHOUT confirming dry run; it may send email/Telegram. Check /api/system/runs now.`
    );
  }
  const label = live ? "LIVE" : "dry run";
  if (result.skipped || !result.id) {
    print(
      result,
      `${label}: skipped (${result.reason ?? "no id"}); pass --force to bypass`
    );
    return;
  }
  if (!args.flags.has("wait")) {
    print(
      result,
      `${label}: started ${result.id}${steps ? ` steps=${steps.join(",")}` : ""}`
    );
    return;
  }
  console.error(`${label}: started ${result.id}, waiting for close-run...`);
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    const run = (await loadRuns()).find((r) => r.id === result.id);
    if (run && isFinished(run)) {
      const compact = compactRun(run);
      print(
        compact,
        `${label}: ${run.id} finished${run.error ? ` with error: ${run.error}` : ""}`
      );
      return;
    }
  }
  fail(`run ${result.id} did not finish within ${WAIT_TIMEOUT_MS / 60000}m`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) fail(args.error);
  const [command, stepArg] = args.positional;
  switch (command) {
    case "audit":
      return audit(args);
    case "ranking":
      return ranking(args);
    case "tldr-preview":
      return tldrPreview();
    case "tldr-regenerate":
      return tldrRegenerate(args);
    case "run":
      return trigger(args, parseSteps(args.flags.get("steps")));
    case "rerun":
      if (!stepArg) fail("rerun needs a step name");
      return trigger(args, parseSteps(stepArg));
    case "day-video":
      return dayVideo(args, stepArg);
    case "day-video-telegram":
      return dayVideoTelegram(args, stepArg);
    case "day-video-posted":
      return dayVideoPosted(args, stepArg);
    case "unmerge":
      return unmerge(args);
    case "backfill-tags":
      return backfillTags(args);
    default:
      fail(
        "usage: aidr-agent audit [--run <id>] [--runs N] | ranking [--limit N] | tldr-preview | tldr-regenerate [--date YYYY-MM-DD] [--dry-run] | run [--steps a,b] [--force] [--wait] [--live] | rerun <step> [--force] [--wait] [--live] | day-video <YYYY-MM-DD> [--video <url|id>] [--short <url|id>] [--title <text>] [--lang en|vi] [--clear-video] [--clear-short] [--delete] | day-video-telegram <YYYY-MM-DD> --lang en|vi [--chat <id>] | day-video-posted <YYYY-MM-DD> --channel telegram-en|telegram-vi --ref <chat_id>/<message_id> | unmerge <pairs.json> [--apply] | unmerge --dangling [decisions.json] [--apply] | unmerge --undo <batchId> [--canonical <id,...>] [--apply] | backfill-tags [--apply]"
      );
  }
}

main().catch((error: unknown) =>
  fail(error instanceof Error ? error.message : String(error))
);
