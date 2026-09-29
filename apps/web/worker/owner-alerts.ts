import { reportPipelineException } from "./bugsink.js";
import type { HealthIssue, PriorRun } from "./health.js";
import { escapeHtml } from "./notify/telegram.js";
import type { Env } from "./types.js";

/**
 * Owner-facing side of the health check: a Telegram DM to the owner and
 * GitHub issues for alerts that need a human. Both are optional and off
 * unless `TELEGRAM_OWNER_CHAT_ID` / `GITHUB_ALERT_TOKEN` are set. Every call
 * here runs inside the durable `health-check` step and never throws: a
 * Telegram or GitHub error is logged and reported, the run carries on.
 */

export const SITE_URL = "https://aidr.today";
export const ISSUE_LABEL = "aidr-alert";
export const AIDR_REPO = "duyet/aidr";
export const ANYROUTER_REPO = "duyet/anyrouter";
/** Issues created plus comments added, per run. */
export const MAX_GITHUB_WRITES_PER_RUN = 3;
/** An open issue gets at most one comment in this window. */
export const ISSUE_COMMENT_COOLDOWN_MS = 24 * 3600 * 1000;
/** Local hours [start, end) in which the daily summary may go out. The
 *  end stays inside the health history window (12 runs) so a later run
 *  still sees the day's `daily-summary:<date>` key. */
export const SUMMARY_HOUR_START = 9;
export const SUMMARY_HOUR_END = 12;

const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 10_000;

export interface ModelStat {
  model: string;
  total: number;
  failed: number;
  /** HTTP status of failed attempts -> count. */
  statuses: Record<string, number>;
}

export interface AlertContext {
  runId: string;
  nowMs: number;
  models: ModelStat[];
  /** Hours since the newest post, per Telegram channel. */
  telegramQuietHours: Record<string, number>;
}

export interface DailySummary {
  date: string;
  runsOk: number;
  runsFailed: number;
  itemsNew: number;
  telegramPosts: Record<string, number>;
  models: ModelStat[];
  /** Alert key -> runs that raised it. */
  warnings: Record<string, number>;
}

export function runUrl(runId: string): string {
  return `${SITE_URL}/data?tab=runs&run=${encodeURIComponent(runId)}`;
}

/** LLM/provider failures belong to the router repo; the rest to aidr. */
export function isLlmIssue(issue: HealthIssue): boolean {
  return issue.key.startsWith("llm");
}

export function routeRepo(issue: HealthIssue): string {
  return isLlmIssue(issue) ? ANYROUTER_REPO : AIDR_REPO;
}

/** The model with the most failures (ties: first seen). */
function worstModel(models: ModelStat[]): ModelStat | null {
  let worst: ModelStat | null = null;
  for (const m of models) {
    if (m.failed > 0 && (!worst || m.failed > worst.failed)) worst = m;
  }
  return worst;
}

function topStatus(m: ModelStat): string {
  let best = "error";
  let n = 0;
  for (const [status, count] of Object.entries(m.statuses)) {
    if (count > n) {
      best = status;
      n = count;
    }
  }
  return best;
}

/** Stable per-problem id used to find an existing open issue. */
export function fingerprint(issue: HealthIssue, ctx: AlertContext): string {
  if (isLlmIssue(issue)) {
    const worst = worstModel(ctx.models);
    if (worst) return `llm:model=${worst.model}:status=${topStatus(worst)}`;
    return `llm:${issue.key}`;
  }
  return `aidr:${issue.key}`;
}

function pct(ok: number, total: number): string {
  return total > 0 ? `${Math.round((ok / total) * 100)}%` : "n/a";
}

function modelLines(models: ModelStat[]): string[] {
  return models.map(
    (m) =>
      `${m.model}: ${m.total - m.failed}/${m.total} ok${
        m.failed > 0
          ? ` (${Object.entries(m.statuses)
              .map(([s, c]) => `${s}×${c}`)
              .join(", ")})`
          : ""
      }`
  );
}

/** Evidence lines for one issue, shared by the DM and the issue body. */
export function issueEvidence(issue: HealthIssue, ctx: AlertContext): string[] {
  if (isLlmIssue(issue)) return modelLines(ctx.models);
  if (issue.key.startsWith("telegram-quiet:")) {
    const channel = issue.key.slice("telegram-quiet:".length);
    const hours = ctx.telegramQuietHours[channel];
    return hours === undefined ? [] : [`${channel}: ${hours}h since last post`];
  }
  return [];
}

function suggestion(issue: HealthIssue): string {
  if (isLlmIssue(issue))
    return "Check the failing model/provider in AnyRouter (status, key, quota) and drop it from the chain if it stays down.";
  if (issue.key.startsWith("telegram-quiet:"))
    return "Check notify reasons on the run page and the bot's rights in the channel.";
  if (issue.key === "tldr-failing")
    return "Open the TL;DR step on the run page and check the tldr LLM chain.";
  return "Open the run page and check the failed step's reason.";
}

/** Short HTML DM for newly fired alerts. */
export function formatAlertDm(
  issues: HealthIssue[],
  ctx: AlertContext,
  issueUrls: Record<string, string> = {}
): string {
  const lines = [
    `<b>AI;DR needs help</b> (${issues.length} alert${issues.length === 1 ? "" : "s"})`,
  ];
  for (const issue of issues) {
    lines.push(
      "",
      `• <b>${escapeHtml(issue.title)}</b>: ${escapeHtml(issue.detail)}`
    );
    for (const e of issueEvidence(issue, ctx)) lines.push(`  ${escapeHtml(e)}`);
    const url = issueUrls[issue.key];
    if (url) lines.push(`  Issue: ${escapeHtml(url)}`);
  }
  lines.push("", `Run ${escapeHtml(ctx.runId)}`, escapeHtml(runUrl(ctx.runId)));
  return lines.join("\n");
}

export function formatDailySummary(s: DailySummary): string {
  const lines = [
    `<b>AI;DR daily health</b> ${escapeHtml(s.date)}`,
    `Runs 24h: ${s.runsOk} ok, ${s.runsFailed} failed`,
    `New items: ${s.itemsNew}`,
  ];
  const posts = Object.entries(s.telegramPosts);
  lines.push(
    `Telegram posts: ${
      posts.length
        ? posts.map(([c, n]) => `${escapeHtml(c)} ${n}`).join(", ")
        : "none"
    }`
  );
  if (s.models.length) {
    lines.push("LLM success:");
    for (const m of s.models) {
      lines.push(
        `  ${escapeHtml(m.model)}: ${pct(m.total - m.failed, m.total)} (${m.total - m.failed}/${m.total})`
      );
    }
  }
  const warnings = Object.entries(s.warnings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  lines.push(
    warnings.length
      ? `Top warnings: ${warnings.map(([k, n]) => `${escapeHtml(k)} ×${n}`).join(", ")}`
      : "Top warnings: none"
  );
  return lines.join("\n");
}

export function issueTitle(issue: HealthIssue, fp: string): string {
  return `[${ISSUE_LABEL}] ${issue.title} (${fp})`;
}

function marker(fp: string): string {
  return `<!-- ${ISSUE_LABEL}:${fp} -->`;
}

/** Markdown issue/comment body. Holds only counts, names and links. */
export function buildIssueBody(
  issue: HealthIssue,
  ctx: AlertContext,
  fp: string
): string {
  const at = new Date(ctx.nowMs).toISOString();
  const rows = isLlmIssue(issue)
    ? [
        "| Model | OK | Total | Failed statuses |",
        "| --- | --- | --- | --- |",
        ...ctx.models.map(
          (m) =>
            `| ${m.model} | ${m.total - m.failed} | ${m.total} | ${
              Object.entries(m.statuses)
                .map(([s, c]) => `${s}×${c}`)
                .join(", ") || "-"
            } |`
        ),
      ]
    : [
        "| Check | Detail |",
        "| --- | --- |",
        `| ${issue.key} | ${issue.detail.replace(/\|/g, "\\|")} |`,
        ...issueEvidence(issue, ctx).map((e) => `| evidence | ${e} |`),
      ];
  return [
    marker(fp),
    `**${issue.title}** (${issue.severity})`,
    "",
    issue.detail,
    "",
    ...rows,
    "",
    `- Window: the hourly run at ${at}${isLlmIssue(issue) ? " (LLM attempts of this run)" : ""}`,
    `- Run: ${runUrl(ctx.runId)}`,
    `- Fingerprint: \`${fp}\``,
    `- Next step: ${suggestion(issue)}`,
    "",
    "_Filed by the aidr health check._",
  ].join("\n");
}

async function reportSideEffectError(what: string, error: unknown) {
  console.error(`${what} failed:`, error);
  try {
    await reportPipelineException(error, { step: "health-check", kind: what });
  } catch {
    // reporting is best-effort
  }
}

export async function sendOwnerDm(
  env: Pick<Env, "TELEGRAM_BOT_TOKEN" | "TELEGRAM_OWNER_CHAT_ID">,
  text: string
): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!res.ok) throw new Error(`owner DM HTTP ${res.status}`);
    return true;
  } catch (error) {
    await reportSideEffectError("owner-dm", error);
    return false;
  }
}

async function github<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "aidr-health",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface GhIssue {
  number: number;
  html_url: string;
  title: string;
  body?: string | null;
  pull_request?: unknown;
}

interface GhComment {
  body?: string | null;
}

/**
 * Create or update one GitHub issue per alert. Returns alert key -> issue
 * URL for the ones that were filed or already open.
 */
export async function fileGithubIssues(
  env: Pick<Env, "GITHUB_ALERT_TOKEN">,
  issues: HealthIssue[],
  ctx: AlertContext
): Promise<Record<string, string>> {
  const token = env.GITHUB_ALERT_TOKEN;
  const urls: Record<string, string> = {};
  if (!token || issues.length === 0) return urls;
  const openByRepo = new Map<string, GhIssue[]>();
  let writes = 0;
  for (const issue of issues) {
    if (writes >= MAX_GITHUB_WRITES_PER_RUN) break;
    const repo = routeRepo(issue);
    const fp = fingerprint(issue, ctx);
    try {
      let open = openByRepo.get(repo);
      if (!open) {
        open = await github<GhIssue[]>(
          token,
          "GET",
          `/repos/${repo}/issues?state=open&labels=${ISSUE_LABEL}&per_page=100`
        );
        openByRepo.set(repo, open);
      }
      const existing = open.find(
        (i) =>
          !i.pull_request &&
          (i.body?.includes(marker(fp)) || i.title.includes(`(${fp})`))
      );
      const body = buildIssueBody(issue, ctx, fp);
      if (existing) {
        urls[issue.key] = existing.html_url;
        const since = new Date(
          ctx.nowMs - ISSUE_COMMENT_COOLDOWN_MS
        ).toISOString();
        const recent = await github<GhComment[]>(
          token,
          "GET",
          `/repos/${repo}/issues/${existing.number}/comments?since=${since}&per_page=100`
        );
        if (recent.some((c) => c.body?.includes(marker(fp)))) continue;
        writes++;
        await github(
          token,
          "POST",
          `/repos/${repo}/issues/${existing.number}/comments`,
          { body }
        );
        continue;
      }
      writes++;
      const created = await github<GhIssue>(
        token,
        "POST",
        `/repos/${repo}/issues`,
        {
          title: issueTitle(issue, fp),
          body,
          labels: [ISSUE_LABEL],
        }
      );
      urls[issue.key] = created.html_url;
      open.push(created);
    } catch (error) {
      await reportSideEffectError("github-issue", error);
    }
  }
  return urls;
}

/** Alert DM + issues for freshly fired (post-cooldown) alerts. Never throws. */
export async function notifyOwner(
  env: Pick<
    Env,
    "TELEGRAM_BOT_TOKEN" | "TELEGRAM_OWNER_CHAT_ID" | "GITHUB_ALERT_TOKEN"
  >,
  issues: HealthIssue[],
  ctx: AlertContext
): Promise<void> {
  if (issues.length === 0) return;
  try {
    const urls = await fileGithubIssues(env, issues, ctx);
    await sendOwnerDm(env, formatAlertDm(issues, ctx, urls));
  } catch (error) {
    await reportSideEffectError("owner-alert", error);
  }
}

export function dailySummaryKey(date: string): string {
  return `daily-summary:${date}`;
}

/** True when this run should send today's summary (once per local day). */
export function shouldSendDailySummary(
  localHour: number,
  date: string,
  history: PriorRun[]
): boolean {
  if (localHour < SUMMARY_HOUR_START || localHour >= SUMMARY_HOUR_END)
    return false;
  const key = dailySummaryKey(date);
  return !history.some((run) => run.alerts.includes(key));
}
