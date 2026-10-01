#!/usr/bin/env tsx
/**
 * Local agent CLI: audit production and run or rerun pipeline steps without
 * sending any email or Telegram.
 *
 * Usage (from repo root):
 *   pnpm --filter @aidr/web agent audit [--run <id>] [--runs N]
 *   pnpm --filter @aidr/web agent ranking [--limit N]
 *   pnpm --filter @aidr/web agent tldr-preview
 *   pnpm --filter @aidr/web agent run [--steps a,b] [--force] [--wait]
 *   pnpm --filter @aidr/web agent rerun <step> [--force] [--wait]
 *
 * `run` and `rerun` are dry runs unless `--live` is passed. A dry run sends
 * no email, Telegram or owner alert and only previews the TL;DR, but still
 * writes fetched items to D1 (see apps/web/ALGORITHM.md, "Dry runs").
 *
 * Reads NEWS_ADMIN_TOKEN and optional AIDR_BASE_URL (default
 * https://aidr.today) from the environment or the repo-root `.env.local`.
 * Prints compact JSON on stdout and a short summary on stderr. Never prints
 * the token.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPipelineStep, PIPELINE_STEPS } from "../worker/ingest/mode";

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

interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--") && takesValue(name)) {
      flags.set(name, next);
      i++;
    } else {
      flags.set(name, true);
    }
  }
  return { positional, flags };
}

function takesValue(flag: string): boolean {
  return ["run", "runs", "limit", "steps"].includes(flag);
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
  const result = {
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
  const [command, stepArg] = args.positional;
  switch (command) {
    case "audit":
      return audit(args);
    case "ranking":
      return ranking(args);
    case "tldr-preview":
      return tldrPreview();
    case "run":
      return trigger(args, parseSteps(args.flags.get("steps")));
    case "rerun":
      if (!stepArg) fail("rerun needs a step name");
      return trigger(args, parseSteps(stepArg));
    default:
      fail(
        "usage: aidr-agent audit [--run <id>] [--runs N] | ranking [--limit N] | tldr-preview | run [--steps a,b] [--force] [--wait] [--live] | rerun <step> [--force] [--wait] [--live]"
      );
  }
}

main().catch((error: unknown) =>
  fail(error instanceof Error ? error.message : String(error))
);
