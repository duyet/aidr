import type { HealthIssue, PriorRun } from "./health.js";
import {
  facebookConfigured,
  facebookGraphVersion,
  GRAPH_ORIGIN,
} from "./notify/facebook.js";
import { AIDR_REPO, github } from "./owner-alerts.js";
import { getLocalHourAndDate } from "./subscribe/send.js";
import { AUDIENCE_TIMEZONE } from "./time.js";
import type { Env } from "./types.js";

/**
 * The English daily video must reach YouTube (16:9 and Short), the Facebook
 * Reel and Telegram every day (`.github/workflows/daily-reel.yml`). Each
 * target is confirmed against its own record, never against the workflow's
 * own success, so a run that never started is caught too.
 */

export const DAY_VIDEO_ALERT_KEY = "day-video-missing";
/** Local hours [start, end). The 09:30 cron starts 5 to 9 hours late on
 *  GitHub, and the end leaves time for a same-date rerun before midnight. */
export const DAY_VIDEO_CHECK_HOUR_START = 20;
export const DAY_VIDEO_CHECK_HOUR_END = 23;
const DAILY_REEL_WORKFLOW = "daily-reel.yml";
export const TELEGRAM_STEP = "Telegram";
const MAX_RUNS_READ = 3;
const TIMEOUT_MS = 10_000;

const DAY_VIDEO_TARGETS = {
  youtube: "YouTube 16:9",
  short: "YouTube Short",
  facebook: "Facebook Reel",
  telegram: "Telegram (en)",
} as const;
type DayVideoTarget = keyof typeof DAY_VIDEO_TARGETS;

/** `true` when confirmed, otherwise why not. */
type DayVideoChecks = Record<DayVideoTarget, true | string>;

export function rerunCommand(date: string): string {
  return `gh workflow run ${DAILY_REEL_WORKFLOW} -R ${AIDR_REPO} -f dry_run=false -f date=${date}`;
}

/** publish.mjs finds the day's Reel by this link in its caption. */
export function reelMarker(date: string): string {
  return `aidr.today/date/${date}`;
}

/** Inside the window, until a run in today's window raised the alert. */
export function shouldCheckDayVideo(
  localHour: number,
  history: PriorRun[],
  nowMs: number
): boolean {
  if (
    localHour < DAY_VIDEO_CHECK_HOUR_START ||
    localHour >= DAY_VIDEO_CHECK_HOUR_END
  )
    return false;
  const windowMs =
    (DAY_VIDEO_CHECK_HOUR_END - DAY_VIDEO_CHECK_HOUR_START) * 3600 * 1000;
  return !history.some(
    (run) =>
      run.startedAtMs !== null &&
      nowMs - run.startedAtMs < windowMs &&
      run.alerts.includes(DAY_VIDEO_ALERT_KEY)
  );
}

function dayVideoIssue(
  date: string,
  checks: DayVideoChecks,
  runLine: string | null
): HealthIssue | null {
  const missing = (Object.keys(DAY_VIDEO_TARGETS) as DayVideoTarget[]).filter(
    (target) => checks[target] !== true
  );
  if (missing.length === 0) return null;
  return {
    key: DAY_VIDEO_ALERT_KEY,
    severity: "error",
    title: "Daily video not posted",
    detail: `${date}: ${missing.map((t) => DAY_VIDEO_TARGETS[t]).join(", ")} missing`,
    evidence: [
      ...missing.map((t) => `${DAY_VIDEO_TARGETS[t]}: ${checks[t]}`),
      ...(runLine ? [runLine] : []),
      `Rerun (idempotent, skips what is posted): ${rerunCommand(date)}`,
    ],
  };
}

function reason(error: unknown): string {
  return `check failed: ${error instanceof Error ? error.message : String(error)}`;
}

async function checkDayPage(
  env: Env,
  date: string
): Promise<Pick<DayVideoChecks, "youtube" | "short">> {
  try {
    const row = await env.DB.prepare(
      "SELECT youtube_id, short_id FROM day_videos WHERE date = ?"
    )
      .bind(date)
      .first<{ youtube_id: string | null; short_id: string | null }>();
    return {
      youtube: row?.youtube_id ? true : "not on the day page",
      short: row?.short_id ? true : "not on the day page",
    };
  } catch (error) {
    return { youtube: reason(error), short: reason(error) };
  }
}

async function checkFacebookReel(
  env: Env,
  date: string
): Promise<true | string> {
  try {
    const { pageId, token } = facebookConfigured(env);
    if (!pageId || !token)
      return "FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN is not set on the Worker";
    const res = await fetch(
      `${GRAPH_ORIGIN}/${facebookGraphVersion(env)}/${encodeURIComponent(pageId)}/video_reels?fields=id,description&limit=25`,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!res.ok) return `check failed: Graph HTTP ${res.status}`;
    const body = (await res.json()) as {
      data?: { description?: unknown }[];
    };
    const marker = reelMarker(date);
    const found = (body.data ?? []).some(
      (reel) =>
        typeof reel.description === "string" &&
        reel.description.includes(marker)
    );
    return found ? true : `no Page Reel mentions ${marker}`;
  } catch (error) {
    return reason(error);
  }
}

interface GhRun {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  created_at: string;
}

interface GhJobs {
  jobs: { steps?: { name: string; conclusion: string | null }[] }[];
}

/** A dry run skips the Telegram step, so only a succeeded step counts. */
async function checkTelegram(
  env: Pick<Env, "GITHUB_ALERT_TOKEN">,
  date: string,
  nowMs: number
): Promise<{ telegram: true | string; runLine: string | null }> {
  try {
    const since = new Date(nowMs - 30 * 3600 * 1000).toISOString();
    const { workflow_runs } = await github<{ workflow_runs: GhRun[] }>(
      env.GITHUB_ALERT_TOKEN,
      "GET",
      `/repos/${AIDR_REPO}/actions/workflows/${DAILY_REEL_WORKFLOW}/runs?created=%3E%3D${since}&per_page=20`
    );
    const today = workflow_runs.filter(
      (run) =>
        getLocalHourAndDate(Date.parse(run.created_at), AUDIENCE_TIMEZONE)
          .date === date
    );
    const latest = today[0];
    const runLine = latest
      ? `Latest daily-reel run: ${latest.conclusion ?? latest.status} ${latest.html_url}`
      : "No daily-reel run today: the GitHub cron has not fired";
    for (const run of today.slice(0, MAX_RUNS_READ)) {
      const { jobs } = await github<GhJobs>(
        env.GITHUB_ALERT_TOKEN,
        "GET",
        `/repos/${AIDR_REPO}/actions/runs/${run.id}/jobs`
      );
      const posted = jobs.some((job) =>
        (job.steps ?? []).some(
          (s) => s.name === TELEGRAM_STEP && s.conclusion === "success"
        )
      );
      if (posted) return { telegram: true, runLine };
    }
    return {
      telegram: latest
        ? `no ${DAILY_REEL_WORKFLOW} run today posted it (step "${TELEGRAM_STEP}")`
        : `no ${DAILY_REEL_WORKFLOW} run today`,
      runLine,
    };
  } catch (error) {
    const hint = env.GITHUB_ALERT_TOKEN
      ? ""
      : " (GITHUB_ALERT_TOKEN is not set on the Worker)";
    return { telegram: `${reason(error)}${hint}`, runLine: null };
  }
}

/** The alert for `date`, or null when every target is confirmed. Never throws. */
export async function checkDayVideo(
  env: Env,
  date: string,
  nowMs: number
): Promise<HealthIssue | null> {
  const [page, facebook, { telegram, runLine }] = await Promise.all([
    checkDayPage(env, date),
    checkFacebookReel(env, date),
    checkTelegram(env, date, nowMs),
  ]);
  return dayVideoIssue(date, { ...page, facebook, telegram }, runLine);
}
