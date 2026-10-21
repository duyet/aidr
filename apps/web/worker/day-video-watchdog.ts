import type { DayVideoPostChannel } from "../src/lib/day-video.js";
import type { HealthIssue, PriorRun } from "./health.js";
import { INGEST_ALARM_INTERVAL_MS } from "./ingest-schedule.js";
import {
  facebookConfigured,
  facebookGraphVersion,
  GRAPH_ORIGIN,
} from "./notify/facebook.js";
import { AIDR_REPO, github } from "./owner-alerts.js";
import { getLocalHourAndDate } from "./subscribe/send.js";
import { AUDIENCE_TIMEZONE } from "./time.js";
import type { Env } from "./types.js";
import { shiftDate } from "./weekly-digest.js";

/**
 * The daily video must reach YouTube (16:9 and Short), the Facebook Reel and
 * Telegram in English, and the Vietnamese day page and channel every day
 * (`.github/workflows/daily-reel.yml`). Each target is confirmed against its
 * own record, never against the workflow's own success, so a run that never
 * started is caught too. Telegram cannot be read back, so its record is the
 * `day_video_posts` row the post path writes.
 */

export const DAY_VIDEO_ALERT_KEY = "day-video-missing";
/** Recorded in `stats.alerts` once every target is confirmed for the date. */
export const DAY_VIDEO_CONFIRMED_PREFIX = "day-video-ok:";
/** Local hours [start, end). The 09:30 cron starts 5 to 9 hours late on
 *  GitHub, and the end leaves time for a same-date rerun before midnight. */
export const DAY_VIDEO_CHECK_HOUR_START = 20;
export const DAY_VIDEO_CHECK_HOUR_END = 23;
const DAILY_REEL_WORKFLOW = "daily-reel.yml";
/** The end of a dry run's `run-name`. */
export const DRY_RUN_TITLE = "(dry run)";
const TIMEOUT_MS = 10_000;

/** Days before the checked date that the missing streak looks back over. */
export const STREAK_LOOKBACK_DAYS = 6;

const DAY_VIDEO_TARGETS = {
  youtube: "YouTube 16:9",
  short: "YouTube Short",
  facebook: "Facebook Reel",
  telegram: "Telegram (en)",
  youtubeVi: "YouTube (vi)",
  telegramVi: "Telegram (vi)",
} as const;
type DayVideoTarget = keyof typeof DAY_VIDEO_TARGETS;

/** What a rerun cannot fix once a target stays missing: its credentials. */
const TARGET_CREDENTIALS: Record<DayVideoTarget, string> = {
  youtube: "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN",
  short: "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN",
  youtubeVi: "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN",
  facebook: "FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN",
  telegram: "TELEGRAM_BOT_TOKEN, TELEGRAM_EN_CHAT_ID",
  telegramVi: "TELEGRAM_BOT_TOKEN, TELEGRAM_VI_CHAT_ID",
};

/**
 * What a target's record says. `unsure` (a run of the date is still going, or
 * the lookup failed) waits for the window's last check.
 */
type TargetState =
  | { state: "posted" }
  | { state: "unsure"; why: string }
  | { state: "missing"; why: string; days: number };
type DayVideoChecks = Record<DayVideoTarget, TargetState>;

export type DayVideoVerdict =
  | { kind: "confirmed" }
  | { kind: "wait" }
  | { kind: "alert"; issue: HealthIssue };

const POSTED: TargetState = { state: "posted" };
const RUNNING: TargetState = {
  state: "unsure",
  why: "a daily-reel run of this date is still running",
};

/** Consecutive days ending at `date` with no post, looking back
 *  `STREAK_LOOKBACK_DAYS` days; `postedDates` holds the days that did post. */
function missingDays(postedDates: Set<string>, date: string): number {
  let days = 1;
  while (
    days <= STREAK_LOOKBACK_DAYS &&
    !postedDates.has(shiftDate(date, -days))
  )
    days++;
  return days;
}

function missing(
  why: string,
  postedDates: Set<string>,
  date: string
): TargetState {
  return { state: "missing", why, days: missingDays(postedDates, date) };
}

function streakNote(days: number): string {
  if (days < 2) return "";
  return days > STREAK_LOOKBACK_DAYS
    ? ` (missing ${days}+ days in a row)`
    : ` (missing ${days} days in a row)`;
}

export function rerunCommand(date: string): string {
  return `gh workflow run ${DAILY_REEL_WORKFLOW} -R ${AIDR_REPO} -f dry_run=false -f date=${date}`;
}

export function dayVideoConfirmedKey(date: string): string {
  return `${DAY_VIDEO_CONFIRMED_PREFIX}${date}`;
}

/** publish.mjs finds the day's Reel by this link in its caption. */
export function reelMarker(date: string): string {
  return `aidr.today/date/${date}`;
}

const REEL_DAY_LINK = /aidr\.today\/date\/(\d{4}-\d{2}-\d{2})/g;

/** Inside the window, until today is confirmed or a run in today's window
 *  raised the alert. */
export function shouldCheckDayVideo(
  localHour: number,
  date: string,
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
      run.alerts.includes(dayVideoConfirmedKey(date)) ||
      (run.startedAtMs !== null &&
        nowMs - run.startedAtMs < windowMs &&
        run.alerts.includes(DAY_VIDEO_ALERT_KEY))
  );
}

/** True when the next ingest run starts after the window: anything still
 *  unsure is reported now. If that run never comes, it is never reported. */
export function isLastDayVideoCheck(nowMs: number): boolean {
  const next = getLocalHourAndDate(
    nowMs + INGEST_ALARM_INTERVAL_MS,
    AUDIENCE_TIMEZONE
  );
  return next.hour >= DAY_VIDEO_CHECK_HOUR_END;
}

function dayVideoVerdict(
  date: string,
  checks: DayVideoChecks,
  runLine: string,
  last: boolean
): DayVideoVerdict {
  const open = (Object.keys(DAY_VIDEO_TARGETS) as DayVideoTarget[]).flatMap(
    (target) => {
      const check = checks[target];
      return check.state === "posted" ? [] : [{ target, ...check }];
    }
  );
  if (open.length === 0) return { kind: "confirmed" };
  if (!last && open.every((t) => t.state === "unsure")) return { kind: "wait" };
  const stuck = open.filter((t) => t.state === "missing" && t.days >= 2);
  const credentials = [
    ...new Set(stuck.map((t) => TARGET_CREDENTIALS[t.target])),
  ];
  const telegramLangs = open.flatMap((t) =>
    t.target === "telegram"
      ? ["en"]
      : t.target === "telegramVi"
        ? ["visub"]
        : []
  );
  return {
    kind: "alert",
    issue: {
      key: DAY_VIDEO_ALERT_KEY,
      severity: "error",
      title: "Daily video not posted",
      detail: `${date}: ${open.map((t) => DAY_VIDEO_TARGETS[t.target]).join(", ")} missing`,
      evidence: [
        ...open.map(
          (t) =>
            `${DAY_VIDEO_TARGETS[t.target]}: ${t.why}${t.state === "missing" ? streakNote(t.days) : ""}`
        ),
        runLine,
        ...(credentials.length
          ? [
              `A rerun cannot fix a target that stays missing day after day. Check its credentials first (GitHub Actions secrets for ${DAILY_REEL_WORKFLOW}): ${credentials.join("; ")}`,
            ]
          : []),
        `Rerun (idempotent, skips what is posted): ${rerunCommand(date)}`,
        `Rerun before local midnight: a past date needs a committed videos/daily-news/editions/${date}/edition.json`,
        ...(telegramLangs.length
          ? [
              `A HAND_PUBLISHED day's rerun skips Telegram; post it from videos/daily-news after checking the channel: node scripts/publish.mjs ${date} --lang ${telegramLangs.join(",")} --steps telegram --prod`,
            ]
          : []),
      ],
    },
  };
}

function lookupFailed(error: unknown): TargetState {
  return {
    state: "unsure",
    why: `check failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}

async function checkDayPage(
  env: Env,
  date: string
): Promise<Pick<DayVideoChecks, "youtube" | "short" | "youtubeVi">> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT date, youtube_id, short_id, youtube_id_vi FROM day_videos WHERE date >= ? AND date <= ?"
    )
      .bind(shiftDate(date, -STREAK_LOOKBACK_DAYS), date)
      .all<{
        date: string;
        youtube_id: string | null;
        short_id: string | null;
        youtube_id_vi: string | null;
      }>();
    const rows = results ?? [];
    const onPage = (
      column: "youtube_id" | "short_id" | "youtube_id_vi"
    ): TargetState => {
      const dates = new Set(rows.filter((r) => r[column]).map((r) => r.date));
      return dates.has(date)
        ? POSTED
        : missing("not on the day page", dates, date);
    };
    return {
      youtube: onPage("youtube_id"),
      short: onPage("short_id"),
      youtubeVi: onPage("youtube_id_vi"),
    };
  } catch (error) {
    const failed = lookupFailed(error);
    return { youtube: failed, short: failed, youtubeVi: failed };
  }
}

async function checkFacebookReel(env: Env, date: string): Promise<TargetState> {
  try {
    const { pageId, token } = facebookConfigured(env);
    if (!pageId || !token)
      return {
        state: "missing",
        days: 1,
        why: "FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN is not set on the Worker",
      };
    const res = await fetch(
      `${GRAPH_ORIGIN}/${facebookGraphVersion(env)}/${encodeURIComponent(pageId)}/video_reels?fields=id,description&limit=25`,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!res.ok)
      return { state: "unsure", why: `check failed: Graph HTTP ${res.status}` };
    const body = (await res.json()) as {
      data?: { description?: unknown }[];
    };
    const dates = new Set<string>();
    for (const reel of body.data ?? [])
      if (typeof reel.description === "string")
        for (const [, day] of reel.description.matchAll(REEL_DAY_LINK))
          if (day) dates.add(day);
    return dates.has(date)
      ? POSTED
      : missing(`no Page Reel mentions ${reelMarker(date)}`, dates, date);
  } catch (error) {
    return lookupFailed(error);
  }
}

/** Both Telegram channels, from the posts that publish.mjs and the Worker's
 *  card post record in `day_video_posts`. */
async function checkTelegram(
  env: Env,
  date: string
): Promise<Pick<DayVideoChecks, "telegram" | "telegramVi">> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT date, channel FROM day_video_posts WHERE date >= ? AND date <= ?"
    )
      .bind(shiftDate(date, -STREAK_LOOKBACK_DAYS), date)
      .all<{ date: string; channel: string }>();
    const rows = results ?? [];
    const onChannel = (channel: DayVideoPostChannel): TargetState => {
      const dates = new Set(
        rows.filter((r) => r.channel === channel).map((r) => r.date)
      );
      return dates.has(date)
        ? POSTED
        : missing("no post recorded for this date", dates, date);
    };
    return {
      telegram: onChannel("telegram-en"),
      telegramVi: onChannel("telegram-vi"),
    };
  } catch (error) {
    const failed = lookupFailed(error);
    return { telegram: failed, telegramVi: failed };
  }
}

interface GhRun {
  html_url: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  /** The workflow's `run-name`: `Daily Reel[ <date input>][ (dry run)]`. */
  display_title: string;
}

/** The run's `date` input from its title; else (scheduled runs, and runs
 *  from before the title had it) the local day it was created. */
function runDate(run: GhRun): string {
  return (
    run.display_title.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
    getLocalHourAndDate(Date.parse(run.created_at), AUDIENCE_TIMEZONE).date
  );
}

/** The date's daily-reel runs, for the alert's context and to wait while a
 *  live one is still posting. Not a record of any target: a failed lookup
 *  only loses that context. */
async function readDailyReelRuns(
  env: Pick<Env, "GITHUB_ALERT_TOKEN">,
  date: string,
  nowMs: number
): Promise<{ running: boolean; runLine: string }> {
  try {
    const since = new Date(nowMs - 30 * 3600 * 1000).toISOString();
    const { workflow_runs } = await github<{ workflow_runs: GhRun[] }>(
      env.GITHUB_ALERT_TOKEN,
      "GET",
      `/repos/${AIDR_REPO}/actions/workflows/${DAILY_REEL_WORKFLOW}/runs?created=%3E%3D${since}&per_page=20`
    );
    const ofDate = workflow_runs.filter((run) => runDate(run) === date);
    const latest = ofDate[0];
    return {
      running: ofDate.some(
        (run) =>
          run.status !== "completed" &&
          !run.display_title.endsWith(DRY_RUN_TITLE)
      ),
      runLine: latest
        ? `Latest daily-reel run: ${latest.conclusion ?? latest.status} ${latest.html_url}`
        : "No daily-reel run today: the GitHub cron has not fired",
    };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return {
      running: false,
      runLine: `daily-reel runs unknown: ${why}${env.GITHUB_ALERT_TOKEN ? "" : " (GITHUB_ALERT_TOKEN is not set on the Worker)"}`,
    };
  }
}

/** Whether every target is confirmed for `date`, and the alert when one is
 *  not. Never throws. */
export async function checkDayVideo(
  env: Env,
  date: string,
  nowMs: number
): Promise<DayVideoVerdict> {
  const [page, telegram, facebook, runs] = await Promise.all([
    checkDayPage(env, date),
    checkTelegram(env, date),
    checkFacebookReel(env, date),
    readDailyReelRuns(env, date, nowMs),
  ]);
  const checks: DayVideoChecks = { ...page, ...telegram, facebook };
  if (runs.running)
    for (const target of Object.keys(checks) as DayVideoTarget[])
      if (checks[target].state !== "posted") checks[target] = RUNNING;
  return dayVideoVerdict(
    date,
    checks,
    runs.runLine,
    isLastDayVideoCheck(nowMs)
  );
}
