import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDayVideo,
  DAY_VIDEO_ALERT_KEY,
  DAY_VIDEO_CHECK_HOUR_END,
  DAY_VIDEO_CHECK_HOUR_START,
  reelMarker,
  rerunCommand,
  shouldCheckDayVideo,
  TELEGRAM_STEP,
} from "../day-video-watchdog.js";
import { type PriorRun, runHealthCheck } from "../health.js";
import { formatAlertDm, resetOwnerDmRejections } from "../owner-alerts.js";
import type { Env } from "../types.js";

const DATE = "2026-10-14";
/** 20:30 in Asia/Ho_Chi_Minh on DATE. */
const NOW = Date.UTC(2026, 9, 14, 13, 30);
const RUN_URL = "https://github.com/duyet/aidr/actions/runs/101";
const TOKEN = "page-token-secret";

interface World {
  dayVideo: { youtube_id: string | null; short_id: string | null } | null;
  reels: { description: string }[] | { status: number };
  runs:
    | { id: number; created_at: string; conclusion: string | null }[]
    | "down";
  /** Run id -> Telegram step conclusion. */
  telegram: Record<number, string>;
}

const posted: World = {
  dayVideo: { youtube_id: "fYgTeIlk29s", short_id: "Vt8vV-f8kCA" },
  reels: [
    {
      description: `Today\nhttps://aidr.today/date/${DATE}?utm_source=facebook`,
    },
  ],
  runs: [
    { id: 101, created_at: "2026-10-14T09:40:58Z", conclusion: "success" },
  ],
  telegram: { 101: "success" },
};

/** D1 with only the day video row; every other health query is empty. */
function env(world: World, extra: Partial<Env> = {}): Env {
  const query = (sql: string, args: unknown[]) => ({
    all: async () => ({ results: [] }),
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
            ...r,
            html_url: `https://github.com/duyet/aidr/actions/runs/${r.id}`,
            status: r.conclusion ? "completed" : "in_progress",
          })),
        });
      }
      const job = url.match(/\/actions\/runs\/(\d+)\/jobs$/);
      if (job) {
        const conclusion = world.telegram[Number(job[1])] ?? "skipped";
        return json({
          jobs: [
            {
              steps: [
                { name: "Facebook Reel", conclusion: "success" },
                { name: TELEGRAM_STEP, conclusion },
              ],
            },
          ],
        });
      }
      if (url.startsWith("https://api.telegram.org/"))
        return json({ ok: true });
      throw new Error(`unexpected fetch ${url}`);
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetOwnerDmRejections();
  requests.length = 0;
});

describe("shouldCheckDayVideo", () => {
  const ran = (hoursAgo: number): PriorRun => ({
    startedAtMs: NOW - hoursAgo * 3600_000,
    steps: [],
    alerts: [DAY_VIDEO_ALERT_KEY],
  });

  it("checks only inside the evening window", () => {
    const at = (hour: number) => shouldCheckDayVideo(hour, [], NOW);
    expect(at(DAY_VIDEO_CHECK_HOUR_START - 1)).toBe(false);
    expect(at(DAY_VIDEO_CHECK_HOUR_START)).toBe(true);
    expect(at(DAY_VIDEO_CHECK_HOUR_END - 1)).toBe(true);
    expect(at(DAY_VIDEO_CHECK_HOUR_END)).toBe(false);
  });

  it("pages the owner once per evening", () => {
    expect(shouldCheckDayVideo(21, [ran(1)], NOW)).toBe(false);
  });

  // Runs can thin out (13 a day when only GitHub cron drives ingest), so
  // yesterday's alert may still sit in the last 12 runs.
  it("still checks when the only alert is yesterday's", () => {
    expect(shouldCheckDayVideo(21, [ran(24)], NOW)).toBe(true);
  });
});

describe("checkDayVideo", () => {
  it("is quiet when every target posted (2026-10-13 run)", async () => {
    serve(posted);
    expect(await checkDayVideo(env(posted), DATE, NOW)).toBeNull();
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
      telegram: {},
    };
    serve(world);
    const issue = await checkDayVideo(env(world), DATE, NOW);
    expect(issue?.key).toBe(DAY_VIDEO_ALERT_KEY);
    expect(issue?.detail).toBe(
      `${DATE}: YouTube 16:9, YouTube Short, Facebook Reel, Telegram (en) missing`
    );
    expect(issue?.evidence).toContain(
      "No daily-reel run today: the GitHub cron has not fired"
    );
    expect(issue?.evidence?.at(-1)).toBe(
      `Rerun (idempotent, skips what is posted): ${rerunCommand(DATE)}`
    );
  });

  it("flags Telegram when today's only run was a dry run", async () => {
    const world: World = { ...posted, telegram: {} };
    serve(world);
    const issue = await checkDayVideo(env(world), DATE, NOW);
    expect(issue?.detail).toBe(`${DATE}: Telegram (en) missing`);
    expect(issue?.evidence).toContain(
      `Latest daily-reel run: success ${RUN_URL}`
    );
  });

  it("does not count yesterday evening's run for today", async () => {
    const world: World = {
      ...posted,
      runs: [
        { id: 99, created_at: "2026-10-13T10:00:03Z", conclusion: "success" },
      ],
      telegram: { 99: "success" },
    };
    serve(world);
    const issue = await checkDayVideo(env(world), DATE, NOW);
    expect(issue?.detail).toBe(`${DATE}: Telegram (en) missing`);
  });

  it("reports a GitHub error as missing Telegram", async () => {
    const world: World = { ...posted, runs: "down" };
    serve(world);
    const issue = await checkDayVideo(env(world), DATE, NOW);
    expect(issue?.detail).toBe(`${DATE}: Telegram (en) missing`);
    expect(issue?.evidence?.[0]).toMatch(
      /^Telegram \(en\): check failed: GitHub GET .* HTTP 503 /
    );
    expect(issue?.evidence?.[0]).toContain("GITHUB_ALERT_TOKEN is not set");
    expect(issue?.evidence?.join("\n")).not.toContain("cron has not fired");
  });

  it("reports a Graph error as missing", async () => {
    const world: World = { ...posted, reels: { status: 400 } };
    serve(world);
    const issue = await checkDayVideo(env(world), DATE, NOW);
    expect(issue?.detail).toBe(`${DATE}: Facebook Reel missing`);
    expect(issue?.evidence).toContain(
      "Facebook Reel: check failed: Graph HTTP 400"
    );
  });

  it("puts the rerun command in the owner DM", async () => {
    const world: World = { ...posted, dayVideo: null };
    serve(world);
    const issue = await checkDayVideo(env(world), DATE, NOW);
    if (!issue) throw new Error("expected an alert");
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
  const workflow = readFileSync(
    new URL(".github/workflows/daily-reel.yml", root),
    "utf8"
  );

  it("posts Telegram in a step the watchdog reads by name", () => {
    expect(workflow).toMatch(
      new RegExp(`^\\s+- name: ${TELEGRAM_STEP}\\n`, "m")
    );
  });

  it("takes the inputs the rerun command passes", () => {
    expect(rerunCommand(DATE)).toBe(
      `gh workflow run daily-reel.yml -R duyet/aidr -f dry_run=false -f date=${DATE}`
    );
    expect(workflow).toMatch(/^\s+dry_run:\n/m);
    expect(workflow).toMatch(/^\s+date:\n/m);
  });

  it("finds the Reel by the marker publish.mjs uses", () => {
    const publish = readFileSync(
      new URL("videos/daily-news/scripts/publish.mjs", root),
      "utf8"
    );
    expect(reelMarker(DATE)).toBe(`aidr.today/date/${DATE}`);
    expect(publish).toMatch(/const marker = `aidr\.today\/date\/\$\{date\}`;/);
  });
});
