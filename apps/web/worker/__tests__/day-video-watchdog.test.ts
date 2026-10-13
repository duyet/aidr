import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDayVideo,
  DAY_VIDEO_ALERT_KEY,
  DAY_VIDEO_CHECK_HOUR_END,
  DAY_VIDEO_CHECK_HOUR_START,
  type DayVideoVerdict,
  DRY_RUN_TITLE,
  dayVideoConfirmedKey,
  isLastDayVideoCheck,
  reelMarker,
  rerunCommand,
  shouldCheckDayVideo,
  TELEGRAM_STEP,
  TELEGRAM_VI_STEP,
  YOUTUBE_STEP,
} from "../day-video-watchdog.js";
import { type PriorRun, runHealthCheck } from "../health.js";
import { formatAlertDm, resetOwnerDmRejections } from "../owner-alerts.js";
import type { Env } from "../types.js";

const DATE = "2026-10-14";
/** 20:30 in Asia/Ho_Chi_Minh on DATE: the window's second check. */
const NOW = Date.UTC(2026, 9, 14, 13, 30);
/** 22:30 local: no later run lands inside the window. */
const LAST = Date.UTC(2026, 9, 14, 15, 30);
const RUN_URL = "https://github.com/duyet/aidr/actions/runs/101";
const TOKEN = "page-token-secret";

type Steps = Record<string, string>;
const LIVE: Steps = {
  [YOUTUBE_STEP]: "success",
  "Facebook Reel": "success",
  [TELEGRAM_STEP]: "success",
  [TELEGRAM_VI_STEP]: "success",
};
const DRY: Steps = {
  [YOUTUBE_STEP]: "skipped",
  "Facebook Reel": "skipped",
  [TELEGRAM_STEP]: "skipped",
  [TELEGRAM_VI_STEP]: "skipped",
};
/** Live, on a day an agent already published: the workflow skips both Telegram posts. */
const BY_HAND: Steps = {
  ...LIVE,
  [TELEGRAM_STEP]: "skipped",
  [TELEGRAM_VI_STEP]: "skipped",
};

interface Run {
  id: number;
  created_at: string;
  status?: string;
  conclusion?: string | null;
  /** `display_title`; runs before the date `run-name` are all "Daily Reel". */
  title?: string;
  steps: Steps;
}

interface World {
  dayVideo: {
    youtube_id: string | null;
    short_id: string | null;
    youtube_id_vi: string | null;
  } | null;
  reels: { description: string }[] | { status: number };
  runs: Run[] | "down";
  /** Prior Worker runs (`workflow_runs` rows), newest first. */
  history?: { started_at: number; stats: string }[];
}

const posted: World = {
  dayVideo: {
    youtube_id: "fYgTeIlk29s",
    short_id: "Vt8vV-f8kCA",
    youtube_id_vi: "Qw3rTyUi0pA",
  },
  reels: [
    {
      description: `Today\nhttps://aidr.today/date/${DATE}?utm_source=facebook`,
    },
  ],
  runs: [{ id: 101, created_at: "2026-10-14T09:40:58Z", steps: LIVE }],
};

/** D1 with the day video row and the prior runs; every other query is empty. */
function env(world: World, extra: Partial<Env> = {}): Env {
  const query = (sql: string, args: unknown[]) => ({
    all: async () => ({
      results: sql.includes("FROM workflow_runs") ? (world.history ?? []) : [],
    }),
    first: async () =>
      sql.includes("FROM day_videos")
        ? args[0] === DATE
          ? world.dayVideo
          : null
        : { total: 0, failed: 0 },
  });
  return {
    DB: {
      prepare: (sql: string) => ({
        ...query(sql, []),
        bind: (...args: unknown[]) => query(sql, args),
      }),
    },
    FACEBOOK_PAGE_ID: "123456",
    FACEBOOK_PAGE_ACCESS_TOKEN: TOKEN,
    ...extra,
  } as unknown as Env;
}

const requests: { url: string; init?: RequestInit }[] = [];
const jobRequests = () =>
  requests.filter((r) => /\/actions\/runs\/\d+\/jobs$/.test(r.url));

function serve(world: World) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status });
      if (url.startsWith("https://graph.facebook.com/")) {
        return "status" in world.reels
          ? json({ error: { message: "bad" } }, world.reels.status)
          : json({ data: world.reels });
      }
      if (url.includes("/actions/workflows/daily-reel.yml/runs")) {
        if (world.runs === "down") return json({}, 503);
        return json({
          workflow_runs: world.runs.map((r) => ({
            id: r.id,
            created_at: r.created_at,
            status: r.status ?? "completed",
            conclusion:
              r.conclusion === undefined
                ? (r.status ?? "completed") === "completed"
                  ? "success"
                  : null
                : r.conclusion,
            display_title: r.title ?? "Daily Reel",
            html_url: `https://github.com/duyet/aidr/actions/runs/${r.id}`,
          })),
        });
      }
      const job = url.match(/\/actions\/runs\/(\d+)\/jobs$/);
      if (job && world.runs !== "down") {
        const run = world.runs.find((r) => r.id === Number(job[1]));
        const steps = Object.entries(run?.steps ?? {}).map(
          ([name, conclusion]) => ({ name, conclusion })
        );
        return json({ jobs: [{ steps }] });
      }
      if (url.startsWith("https://api.telegram.org/"))
        return json({ ok: true });
      throw new Error(`unexpected fetch ${url}`);
    })
  );
}

function alertOf(verdict: DayVideoVerdict) {
  if (verdict.kind !== "alert")
    throw new Error(`expected an alert, got ${verdict.kind}`);
  return verdict.issue;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetOwnerDmRejections();
  requests.length = 0;
});

describe("shouldCheckDayVideo", () => {
  const ran = (hoursAgo: number, alert: string): PriorRun => ({
    startedAtMs: NOW - hoursAgo * 3600_000,
    steps: [],
    alerts: [alert],
  });

  it("checks only inside the evening window", () => {
    const at = (hour: number) => shouldCheckDayVideo(hour, DATE, [], NOW);
    expect(at(DAY_VIDEO_CHECK_HOUR_START - 1)).toBe(false);
    expect(at(DAY_VIDEO_CHECK_HOUR_START)).toBe(true);
    expect(at(DAY_VIDEO_CHECK_HOUR_END - 1)).toBe(true);
    expect(at(DAY_VIDEO_CHECK_HOUR_END)).toBe(false);
  });

  it("pages the owner once per evening", () => {
    expect(
      shouldCheckDayVideo(21, DATE, [ran(1, DAY_VIDEO_ALERT_KEY)], NOW)
    ).toBe(false);
  });

  // Runs can thin out (13 a day when only GitHub cron drives ingest), so
  // yesterday's alert may still sit in the last 12 runs.
  it("still checks when the only alert is yesterday's", () => {
    expect(
      shouldCheckDayVideo(21, DATE, [ran(24, DAY_VIDEO_ALERT_KEY)], NOW)
    ).toBe(true);
  });

  it("stops checking once today is confirmed, not after yesterday's", () => {
    const today = ran(1, dayVideoConfirmedKey(DATE));
    const yesterday = ran(24, dayVideoConfirmedKey("2026-10-13"));
    expect(shouldCheckDayVideo(21, DATE, [today], NOW)).toBe(false);
    expect(shouldCheckDayVideo(21, DATE, [yesterday], NOW)).toBe(true);
  });
});

describe("isLastDayVideoCheck", () => {
  const local = (h: number, m: number) => Date.UTC(2026, 9, 14, h - 7, m);

  it("is the run after which no run lands in the window", () => {
    expect(isLastDayVideoCheck(local(20, 0))).toBe(false);
    expect(isLastDayVideoCheck(local(22, 29))).toBe(false);
    expect(isLastDayVideoCheck(local(22, 31))).toBe(true);
  });
});

describe("checkDayVideo", () => {
  it("confirms the day when every channel posted (2026-10-13 run)", async () => {
    serve(posted);
    expect(await checkDayVideo(env(posted), DATE, NOW)).toEqual({
      kind: "confirmed",
    });
    const graph = requests.find((r) => r.url.includes("graph.facebook.com"));
    expect(graph?.url).not.toContain(TOKEN);
    expect(new Headers(graph?.init?.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`
    );
  });

  it("names every target and the rerun when nothing posted (2026-10-11)", async () => {
    const world: World = {
      dayVideo: null,
      reels: [{ description: "https://aidr.today/date/2026-10-13" }],
      runs: [],
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.key).toBe(DAY_VIDEO_ALERT_KEY);
    expect(issue.detail).toBe(
      `${DATE}: YouTube 16:9, YouTube Short, Facebook Reel, Telegram (en), YouTube (vi), Telegram (vi) missing`
    );
    expect(issue.evidence).toContain(
      "No daily-reel run today: the GitHub cron has not fired"
    );
    expect(issue.evidence?.at(-1)).toBe(
      `Rerun (idempotent, skips what is posted): ${rerunCommand(DATE)}`
    );
  });

  it("flags the Vietnamese channel on its own", async () => {
    const world: World = {
      ...posted,
      dayVideo: { ...posted.dayVideo!, youtube_id_vi: null },
      runs: [
        {
          id: 101,
          created_at: "2026-10-14T09:40:58Z",
          steps: { ...LIVE, [TELEGRAM_VI_STEP]: "failure" },
        },
      ],
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.detail).toBe(`${DATE}: YouTube (vi), Telegram (vi) missing`);
    expect(issue.evidence).toContain("YouTube (vi): not on the day page");
  });

  // The YouTube step may continue on error, and then reports `success` after
  // a failed upload. Only the day page row proves the video is up.
  it("counts YouTube from the day page, not the upload step", async () => {
    const world: World = {
      ...posted,
      dayVideo: { ...posted.dayVideo!, youtube_id: null, short_id: null },
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.detail).toBe(`${DATE}: YouTube 16:9, YouTube Short missing`);
  });

  it("flags a missing YouTube video on a hand-published day", async () => {
    const world: World = {
      ...posted,
      dayVideo: { ...posted.dayVideo!, youtube_id: null },
      runs: [{ id: 101, created_at: "2026-10-14T09:40:58Z", steps: BY_HAND }],
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.detail).toBe(
      `${DATE}: YouTube 16:9, Telegram (en), Telegram (vi) missing`
    );
    expect(issue.evidence).toContain("YouTube 16:9: not on the day page");
  });

  it("flags both Telegram channels when today's only run was a dry run", async () => {
    const world: World = {
      ...posted,
      runs: [{ id: 101, created_at: "2026-10-14T09:40:58Z", steps: DRY }],
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.detail).toBe(`${DATE}: Telegram (en), Telegram (vi) missing`);
    expect(issue.evidence).toContain(
      `Latest daily-reel run: success ${RUN_URL}`
    );
  });

  it("does not count yesterday evening's run for today", async () => {
    const world: World = {
      ...posted,
      runs: [{ id: 99, created_at: "2026-10-13T10:00:03Z", steps: LIVE }],
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.detail).toBe(`${DATE}: Telegram (en), Telegram (vi) missing`);
  });

  it("matches a run by its date input, not the day it started", async () => {
    const world: World = {
      ...posted,
      runs: [
        {
          id: 102,
          created_at: "2026-10-14T12:00:00Z",
          title: "Daily Reel 2026-10-12",
          steps: LIVE,
        },
        {
          id: 99,
          created_at: "2026-10-13T16:30:00Z",
          title: `Daily Reel ${DATE}`,
          steps: LIVE,
        },
      ],
    };
    serve(world);
    expect(await checkDayVideo(env(world), DATE, NOW)).toEqual({
      kind: "confirmed",
    });
    expect(jobRequests().map((r) => r.url)).toEqual([
      expect.stringMatching(/\/runs\/99\/jobs$/),
    ]);
  });

  it("finds the live run behind later dry runs, without reading the dry ones it can name", async () => {
    const oldDry = (id: number): Run => ({
      id,
      created_at: `2026-10-14T${8 + id - 200}:00:00Z`,
      steps: DRY,
    });
    const world: World = {
      ...posted,
      runs: [
        {
          id: 300,
          created_at: "2026-10-14T13:25:00Z",
          title: `Daily Reel ${DATE} ${DRY_RUN_TITLE}`,
          steps: DRY,
        },
        oldDry(205),
        oldDry(204),
        oldDry(203),
        oldDry(202),
        { id: 101, created_at: "2026-10-14T09:40:58Z", steps: LIVE },
      ],
    };
    serve(world);
    expect(await checkDayVideo(env(world), DATE, NOW)).toEqual({
      kind: "confirmed",
    });
    expect(jobRequests().some((r) => r.url.includes("/runs/300/"))).toBe(false);
  });

  it("waits for a run still in progress, and reports it at the last check", async () => {
    const world: World = {
      ...posted,
      dayVideo: null,
      reels: [],
      runs: [
        {
          id: 101,
          created_at: "2026-10-14T13:20:00Z",
          status: "in_progress",
          steps: { [YOUTUBE_STEP]: "", [TELEGRAM_STEP]: "" },
        },
      ],
    };
    serve(world);
    expect(await checkDayVideo(env(world), DATE, NOW)).toEqual({
      kind: "wait",
    });
    const issue = alertOf(await checkDayVideo(env(world), DATE, LAST));
    expect(issue.evidence).toContain(
      "YouTube 16:9: a daily-reel run of this date is still running"
    );
    expect(issue.evidence).toContain(
      `Latest daily-reel run: in_progress ${RUN_URL}`
    );
  });

  it("does not wait for a dry run, which cannot post", async () => {
    const world: World = {
      ...posted,
      dayVideo: null,
      runs: [
        {
          id: 300,
          created_at: "2026-10-14T13:20:00Z",
          status: "in_progress",
          title: `Daily Reel ${DATE} ${DRY_RUN_TITLE}`,
          steps: {},
        },
        { id: 101, created_at: "2026-10-14T09:40:58Z", steps: LIVE },
      ],
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.detail).toBe(
      `${DATE}: YouTube 16:9, YouTube Short, YouTube (vi) missing`
    );
  });

  it("reports a failed GitHub lookup only at the last check", async () => {
    const world: World = { ...posted, runs: "down" };
    serve(world);
    expect(await checkDayVideo(env(world), DATE, NOW)).toEqual({
      kind: "wait",
    });
    const issue = alertOf(await checkDayVideo(env(world), DATE, LAST));
    expect(issue.detail).toBe(`${DATE}: Telegram (en), Telegram (vi) missing`);
    expect(issue.evidence?.[0]).toMatch(
      /^Telegram \(en\): check failed: GitHub GET .* HTTP 503 /
    );
    expect(issue.evidence?.[0]).toContain("GITHUB_ALERT_TOKEN is not set");
    expect(issue.evidence?.join("\n")).not.toContain("cron has not fired");
  });

  it("reports a failed Graph lookup only at the last check", async () => {
    const world: World = { ...posted, reels: { status: 400 } };
    serve(world);
    expect(await checkDayVideo(env(world), DATE, NOW)).toEqual({
      kind: "wait",
    });
    const issue = alertOf(await checkDayVideo(env(world), DATE, LAST));
    expect(issue.detail).toBe(`${DATE}: Facebook Reel missing`);
    expect(issue.evidence).toContain(
      "Facebook Reel: check failed: Graph HTTP 400"
    );
  });

  it("says a hand-published day skips Telegram, with no rerun that cannot post", async () => {
    const world: World = {
      ...posted,
      runs: [{ id: 101, created_at: "2026-10-14T09:40:58Z", steps: BY_HAND }],
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.detail).toBe(`${DATE}: Telegram (en), Telegram (vi) missing`);
    expect(issue.evidence?.[0]).toBe(
      "Telegram (en): published by hand; daily-reel skips this post on purpose, so a rerun cannot post it"
    );
    expect(issue.evidence?.join("\n")).not.toContain("gh workflow run");
  });

  it("does not take a cancelled run for a hand-published day", async () => {
    const world: World = {
      ...posted,
      runs: [
        {
          id: 101,
          created_at: "2026-10-14T09:40:58Z",
          conclusion: "cancelled",
          steps: BY_HAND,
        },
      ],
    };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    expect(issue.evidence?.join("\n")).not.toContain("published by hand");
    expect(issue.evidence?.at(-1)).toBe(
      `Rerun (idempotent, skips what is posted): ${rerunCommand(DATE)}`
    );
  });

  it("puts the rerun command in the owner DM", async () => {
    const world: World = { ...posted, dayVideo: null };
    serve(world);
    const issue = alertOf(await checkDayVideo(env(world), DATE, NOW));
    const dm = formatAlertDm([issue], {
      runId: "run-1",
      nowMs: NOW,
      models: [],
      telegramQuietHours: {},
    });
    expect(dm).toContain(rerunCommand(DATE));
    expect(dm).toContain("YouTube Short: not on the day page");
  });
});

describe("runHealthCheck", () => {
  const owner = { TELEGRAM_BOT_TOKEN: "bot", TELEGRAM_OWNER_CHAT_ID: "42" };
  const dms = () =>
    requests
      .filter((r) => r.url.includes("api.telegram.org"))
      .map((r) => JSON.parse(String(r.init?.body)).text as string);
  const githubCalls = () =>
    requests.filter((r) => r.url.startsWith("https://api.github.com/"));

  it("DMs the owner once the evening check finds a gap", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const world: World = { ...posted, dayVideo: null };
    serve(world);
    const keys = await runHealthCheck(env(world, owner), {
      runId: "run-1",
      steps: [],
    });
    expect(keys).toEqual([DAY_VIDEO_ALERT_KEY]);
    expect(dms()).toHaveLength(1);
    expect(dms()[0]).toContain(rerunCommand(DATE));
  });

  it("records a confirmed day, and later checks skip the lookups", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    serve(posted);
    const keys = await runHealthCheck(env(posted, owner), {
      runId: "run-1",
      steps: [],
    });
    expect(keys).toEqual([dayVideoConfirmedKey(DATE)]);
    expect(dms()).toEqual([]);

    requests.length = 0;
    vi.setSystemTime(NOW + 30 * 60_000);
    const later: World = {
      ...posted,
      history: [
        {
          started_at: Math.floor(NOW / 1000),
          stats: JSON.stringify({ alerts: keys }),
        },
      ],
    };
    serve(later);
    expect(
      await runHealthCheck(env(later, owner), { runId: "run-2", steps: [] })
    ).toEqual([]);
    expect(githubCalls()).toEqual([]);
  });

  it("keeps the confirmed marker out of the daily summary's warnings", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 14, 3, 0), toFake: ["Date"] });
    const world: World = {
      ...posted,
      history: [
        {
          started_at: Date.UTC(2026, 9, 13, 13, 0) / 1000,
          stats: JSON.stringify({
            alerts: [dayVideoConfirmedKey("2026-10-13")],
          }),
        },
      ],
    };
    serve(world);
    await runHealthCheck(env(world, owner), { runId: "run-1", steps: [] });
    expect(dms()).toHaveLength(1);
    expect(dms()[0]).toContain("Top warnings: none");
  });

  it("stays quiet before the deadline", async () => {
    vi.useFakeTimers({
      now: Date.UTC(2026, 9, 14, 9, 0),
      toFake: ["Date"],
    });
    serve({ ...posted, dayVideo: null });
    const keys = await runHealthCheck(
      env({ ...posted, dayVideo: null }, owner),
      {
        runId: "run-1",
        steps: [],
      }
    );
    expect(keys).toEqual([]);
    expect(requests).toEqual([]);
  });
});

// Renaming either side turns the check into a nightly false alarm.
describe("daily-reel contract", () => {
  const root = new URL("../../../../", import.meta.url);
  const read = (path: string) => readFileSync(new URL(path, root), "utf8");
  const workflow = read(".github/workflows/daily-reel.yml");

  it("runs every step the watchdog reads by name", () => {
    for (const step of [YOUTUBE_STEP, TELEGRAM_STEP, TELEGRAM_VI_STEP]) {
      const name = step.replace(/[()+]/g, "\\$&");
      expect(workflow).toMatch(new RegExp(`^\\s+- name: ${name}\\n`, "m"));
    }
  });

  // The jobs API reports a failed `continue-on-error` step as `success`, so
  // the watchdog would count the failed post as sent. YOUTUBE_STEP may
  // continue on error: it is read only as "the step ran" (a hand-published day).
  it("sees each Telegram post fail", () => {
    for (const step of [TELEGRAM_STEP, TELEGRAM_VI_STEP]) {
      const block = workflow
        .split(/^ {6}- /m)
        .find((b) => b.startsWith(`name: ${step}\n`));
      expect(block, step).toBeDefined();
      expect(block, step).not.toMatch(/^\s*continue-on-error: true$/m);
    }
  });

  it("names each run after its date input and dry run", () => {
    const runName = workflow.match(/^run-name: (.+)$/m)?.[1];
    expect(runName).toContain("inputs.date");
    expect(runName).toContain(`inputs.dry_run && ' ${DRY_RUN_TITLE}'`);
  });

  it("takes the inputs the rerun command passes", () => {
    expect(rerunCommand(DATE)).toBe(
      `gh workflow run daily-reel.yml -R duyet/aidr -f dry_run=false -f date=${DATE}`
    );
    expect(workflow).toMatch(/^\s+dry_run:\n/m);
    expect(workflow).toMatch(/^\s+date:\n/m);
  });

  it("gives the same rerun command in ALGORITHM.md", () => {
    expect(read("apps/web/ALGORITHM.md")).toContain(rerunCommand("<date>"));
  });

  it("reads the Vietnamese day video from a real column", () => {
    const migrations = readdirSync(new URL("apps/web/migrations/", root))
      .map((f) => read(`apps/web/migrations/${f}`))
      .join("\n");
    expect(migrations).toMatch(/\byoutube_id_vi TEXT\b/);
  });

  it("finds the Reel by the marker publish.mjs uses", () => {
    const publish = read("videos/daily-news/scripts/publish.mjs");
    expect(reelMarker(DATE)).toBe(`aidr.today/date/${DATE}`);
    expect(publish).toMatch(/const marker = `aidr\.today\/date\/\$\{date\}`;/);
  });
});
