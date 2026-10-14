import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
  reportHealthAlert: vi.fn(async () => {}),
}));

import { runHealthCheck } from "../health.js";
import { resetOwnerDmRejections } from "../owner-alerts.js";
import { buildRunStats, serializeRunStats } from "../run-stats.js";
import {
  evaluateViEnglish,
  parseViEnglish,
  tallyViEnglish,
  VI_ENGLISH_ALERT_RATE,
  VI_ENGLISH_MIN_ROWS,
  type ViEnglishTally,
  viEnglishKey,
} from "../translation-english.js";
import type { Env } from "../types.js";

const LAGUNA = "poolside/laguna-s-2.1";
const GEMMA = "google/gemma-latest";
const VI = { title: "Mô hình mới", summary: "Tóm tắt tiếng Việt." };

describe("tallyViEnglish", () => {
  it("counts a row whose summary has no Vietnamese, per model", () => {
    expect(
      tallyViEnglish([
        { model: LAGUNA, ...VI },
        { model: LAGUNA, summary: "An English summary." },
        { model: GEMMA, ...VI },
      ])
    ).toEqual({
      [LAGUNA]: { translated: 2, english: 1 },
      [GEMMA]: { translated: 1, english: 0 },
    });
  });

  // The prompt keeps a paper title it cannot render, and product names with
  // versions, in English on purpose. Prod 2026-10: 12 of the 20 hits in 7 days
  // were an English title over a Vietnamese summary.
  it("does not count an English title over a Vietnamese summary", () => {
    const rows = [
      "Byte Language Models: Scaling, Emergent Abstractions",
      "llm-gemini 0.35",
    ].map((title) => ({ model: LAGUNA, ...VI, title }));
    expect(tallyViEnglish(rows)).toEqual({
      [LAGUNA]: { translated: 2, english: 0 },
    });
  });

  it("skips Vietnamese passthrough rows and does not count an empty summary", () => {
    expect(
      tallyViEnglish([
        { model: null, summary: "Already English" },
        { model: LAGUNA, summary: "" },
      ])
    ).toEqual({ [LAGUNA]: { translated: 1, english: 0 } });
  });

  it("survives the run-stats JSON round trip", () => {
    const viEnglish = { [LAGUNA]: { translated: 7, english: 2 } };
    const stats = JSON.parse(serializeRunStats(buildRunStats({ viEnglish })));
    expect(parseViEnglish(JSON.stringify(stats.viEnglish))).toEqual(viEnglish);
    expect(
      JSON.parse(serializeRunStats(buildRunStats({ viEnglish: {} })))
    ).not.toHaveProperty("viEnglish");
  });

  it("reads malformed stats as no rows", () => {
    expect(parseViEnglish(null)).toEqual({});
    expect(parseViEnglish("not json")).toEqual({});
    expect(
      parseViEnglish(
        JSON.stringify({ a: { translated: -1, english: 1 }, b: "x" })
      )
    ).toEqual({});
    expect(
      parseViEnglish(JSON.stringify({ a: { translated: 2, english: 9 } }))
    ).toEqual({ a: { translated: 2, english: 2 } });
  });
});

describe("evaluateViEnglish", () => {
  const at = (translated: number, english: number): ViEnglishTally => ({
    [LAGUNA]: { translated, english },
  });
  const fired = (tally: ViEnglishTally, alerted: string[] = []) =>
    evaluateViEnglish(tally, new Set(alerted)).map((i) => i.key);

  it("fires above the rate once the model has enough rows", () => {
    const issues = evaluateViEnglish(at(40, 7), new Set());
    expect(issues.map((i) => i.key)).toEqual([viEnglishKey(LAGUNA)]);
    expect(issues[0]!.detail).toContain("7 of 40");
    expect(issues[0]!.evidence).toEqual([`${LAGUNA}: 7/40 (18%)`]);
  });

  it("stays quiet at the measured baselines and at the threshold itself", () => {
    // 7 days to 2026-10-14: gemini 1.2%, Laguna 6.4%, gemma-latest 8.3%.
    expect(fired(at(120, 8))).toEqual([]);
    expect(fired({ [GEMMA]: { translated: 120, english: 10 } })).toEqual([]);
    expect(VI_ENGLISH_ALERT_RATE * 40).toBe(6);
    expect(fired(at(40, 6))).toEqual([]);
  });

  it("stays quiet below the minimum rows, however bad the rate", () => {
    expect(fired(at(VI_ENGLISH_MIN_ROWS - 1, VI_ENGLISH_MIN_ROWS - 1))).toEqual(
      []
    );
  });

  it("does not fire a model twice in the window, and keeps models apart", () => {
    const both: ViEnglishTally = {
      [LAGUNA]: { translated: 60, english: 30 },
      [GEMMA]: { translated: 60, english: 30 },
    };
    expect(fired(both, [viEnglishKey(LAGUNA)])).toEqual([viEnglishKey(GEMMA)]);
  });

  it("never routes to the router repo", () => {
    expect(viEnglishKey(LAGUNA).startsWith("llm")).toBe(false);
  });
});

describe("English-in-VI alert through the health check", () => {
  /** 14:00 local, outside the daily-summary and day-video windows. */
  const NOW = Date.UTC(2026, 9, 14, 7, 0);

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetOwnerDmRejections();
  });

  /** One `workflow_runs` row as the 24h window query returns it. */
  type WindowRow = { vi_english: string | null; alerts: string | null };

  function setup(windowRows: WindowRow[]) {
    const dms: string[] = [];
    const issues: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("api.telegram.org")) {
          dms.push(JSON.parse(String(init?.body)).text);
        }
        if (url.includes("api.github.com") && init?.method === "POST") {
          issues.push(JSON.parse(String(init.body)).title);
          return Response.json({ number: 1, html_url: "https://gh/1" });
        }
        return Response.json([]);
      })
    );
    const binds: unknown[][] = [];
    const query = (q: string, args: unknown[] = []) => ({
      all: async () => {
        if (q.includes("$.viEnglish") && q.includes("$.alerts")) {
          binds.push(args);
          return { results: windowRows };
        }
        return { results: [] };
      },
    });
    const env = {
      DB: {
        prepare: (q: string) => ({
          ...query(q),
          bind: (...args: unknown[]) => query(q, args),
        }),
      },
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_OWNER_CHAT_ID: "12345",
      GITHUB_ALERT_TOKEN: "gh",
    } as unknown as Env;
    return { env, dms, issues, binds };
  }

  const row = (tally: ViEnglishTally, alerts: string[] = []): WindowRow => ({
    vi_english: JSON.stringify(tally),
    alerts: JSON.stringify(alerts),
  });

  it("sums the last 24h with this run, DMs the owner and files an aidr issue", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms, issues, binds } = setup([
      row({ [LAGUNA]: { translated: 30, english: 6 } }),
      // A run with unreadable stats reads as NULL and must not break the sum.
      { vi_english: null, alerts: null },
    ]);
    const fired = await runHealthCheck(env, {
      runId: "r1",
      steps: [],
      viEnglish: { [LAGUNA]: { translated: 10, english: 3 } },
    });
    expect(fired).toEqual([viEnglishKey(LAGUNA)]);
    expect(binds[0]).toEqual(["r1", Math.floor(NOW / 1000) - 24 * 3600]);
    expect(dms).toHaveLength(1);
    expect(dms[0]).toContain("9 of 40");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(`aidr:${viEnglishKey(LAGUNA)}`);
  });

  it("stays quiet when an earlier run in the 24h already fired the key", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms, issues } = setup([
      row({ [LAGUNA]: { translated: 30, english: 6 } }, [viEnglishKey(LAGUNA)]),
    ]);
    const fired = await runHealthCheck(env, {
      runId: "r2",
      steps: [],
      viEnglish: { [LAGUNA]: { translated: 10, english: 3 } },
    });
    expect(fired).toEqual([]);
    expect(dms).toEqual([]);
    expect(issues).toEqual([]);
  });

  it("stays quiet below the threshold", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms } = setup([
      row({ [LAGUNA]: { translated: 110, english: 7 } }),
    ]);
    const fired = await runHealthCheck(env, {
      runId: "r3",
      steps: [],
      viEnglish: { [LAGUNA]: { translated: 10, english: 1 } },
    });
    expect(fired).toEqual([]);
    expect(dms).toEqual([]);
  });
});
