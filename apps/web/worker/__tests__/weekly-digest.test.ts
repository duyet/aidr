import { describe, expect, it, vi } from "vitest";
import type { WeeklyCandidate } from "../weekly.js";

vi.mock("../weekly.js", async (original) => {
  const actual = await original<typeof import("../weekly.js")>();
  return {
    ...actual,
    loadRangeCandidates: vi.fn(
      async (): Promise<WeeklyCandidate[]> => [
        {
          id: "a",
          source_id: "hn",
          title: "Alpha",
          title_vi: "Alpha tiếng Việt",
          summary: null,
          category: null,
          importance: 8,
          quality: 7,
          points: 10,
          comments: 1,
          vote_net: 0,
          editionDays: 2,
          bestPosition: 0,
        },
      ]
    ),
    generateWeeklyCopy: vi.fn(async () => ({
      output: {
        intro_en: "Alpha led.",
        intro_vi: "Alpha dẫn đầu tuần.",
        en: new Map([["a", "Alpha shipped."]]),
        vi: new Map([["a", "Alpha ra mắt mô hình mới."]]),
      },
      tokens: 42,
    })),
  };
});

const {
  digestGateReason,
  digestWindow,
  ensureWeeklyDigest,
  isIsoWeekWindow,
  weekdayOf,
} = await import("../weekly-digest.js");
const weekly = await import("../weekly.js");

describe("digest window", () => {
  it("covers the 7 days before the send date", () => {
    expect(digestWindow("2026-10-14")).toEqual({
      start: "2026-10-07",
      end: "2026-10-13",
    });
    expect(digestWindow("2026-03-01")).toEqual({
      start: "2026-02-22",
      end: "2026-02-28",
    });
  });

  it("knows a Sunday-ending window is the ISO-week edition", () => {
    expect(weekdayOf("2026-10-11")).toBe(0);
    expect(isIsoWeekWindow("2026-10-11")).toBe(true);
    expect(isIsoWeekWindow("2026-10-13")).toBe(false);
  });
});

describe("digestGateReason", () => {
  const base = { endDate: "2026-10-13", demand: true, nowMs: 1e12 };
  it("builds on demand only, and never for an ISO week", () => {
    expect(digestGateReason({ ...base, existing: null })).toBeNull();
    expect(digestGateReason({ ...base, demand: false, existing: null })).toBe(
      "no weekly subscriber for this day"
    );
    expect(
      digestGateReason({ ...base, endDate: "2026-10-11", existing: null })
    ).toBe("served by the weekly edition");
  });

  it("retries an incomplete row only after the retry interval", () => {
    const row = {
      fallback: 1,
      intro_vi: null,
      stories_vi: "[]",
      created_at: 0,
      updated_at: base.nowMs - 1000,
    };
    expect(digestGateReason({ ...base, existing: row })).toBe(
      "incomplete digest retried recently"
    );
    expect(
      digestGateReason({ ...base, existing: { ...row, updated_at: 0 } })
    ).toBeNull();
    expect(
      digestGateReason({
        ...base,
        existing: {
          ...row,
          fallback: 0,
          intro_vi: "x",
          stories_vi: '[{"a":1}]',
        },
      })
    ).toBe("digest already written");
  });
});

function fakeDb(opts: { demand: boolean; existing?: unknown }) {
  const writes: { sql: string; args: unknown[] }[] = [];
  const db = {
    batch: async () => [],
    prepare(sql: string) {
      let args: unknown[] = [];
      const bound = {
        first: async () =>
          sql.includes("FROM subscribers")
            ? opts.demand
              ? { hit: 1 }
              : null
            : sql.includes("FROM weekly_digests")
              ? (opts.existing ?? null)
              : null,
        all: async () => ({ results: [] }),
        run: async () => {
          writes.push({ sql, args });
          return { success: true };
        },
      };
      return {
        ...bound,
        bind: (...a: unknown[]) => {
          args = a;
          return bound;
        },
      };
    },
  };
  return { env: { DB: db } as never, writes };
}

describe("ensureWeeklyDigest", () => {
  // Wednesday 2026-10-14, 10:00 ICT: window 7–13 Oct.
  const wed = Date.UTC(2026, 9, 14, 3, 0, 0);

  it("builds and writes one shared row when someone is due today", async () => {
    const { env, writes } = fakeDb({ demand: true });
    const out = await ensureWeeklyDigest(env, wed);
    expect(out).toMatchObject({
      generated: true,
      tokens: 42,
      endDate: "2026-10-13",
    });
    const insert = writes.find((w) =>
      w.sql.includes("INSERT INTO weekly_digests")
    );
    expect(insert?.args.slice(0, 2)).toEqual(["2026-10-13", "2026-10-07"]);
    expect(JSON.parse(insert?.args[6] as string)).toEqual([
      { item_id: "a", text: "Alpha ra mắt mô hình mới." },
    ]);
    expect(weekly.loadRangeCandidates).toHaveBeenCalledWith(env, {
      start: "2026-10-07",
      end: "2026-10-13",
    });
  });

  it("spends nothing when no weekly subscriber has today's weekday", async () => {
    vi.mocked(weekly.generateWeeklyCopy).mockClear();
    const { env, writes } = fakeDb({ demand: false });
    const out = await ensureWeeklyDigest(env, wed);
    expect(out.generated).toBe(false);
    expect(writes.filter((w) => w.sql.includes("weekly_digests"))).toEqual([]);
    expect(weekly.generateWeeklyCopy).not.toHaveBeenCalled();
  });

  it("leaves Monday to the ISO-week edition", async () => {
    vi.mocked(weekly.generateWeeklyCopy).mockClear();
    const { env } = fakeDb({ demand: true });
    const out = await ensureWeeklyDigest(env, Date.UTC(2026, 9, 12, 3, 0, 0));
    expect(out.reason).toBe("served by the weekly edition");
    expect(weekly.generateWeeklyCopy).not.toHaveBeenCalled();
  });
});

describe("ensureWeeklyDigest write guard", () => {
  it("reports a missing table instead of throwing after the LLM call", async () => {
    const { env } = fakeDb({ demand: true });
    const db = (env as { DB: { prepare: (sql: string) => unknown } }).DB;
    const prepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      if (sql.includes("INSERT INTO weekly_digests")) {
        return {
          bind: () => ({
            run: async () => {
              throw new Error("no such table: weekly_digests");
            },
          }),
        };
      }
      return prepare(sql);
    };
    const out = await ensureWeeklyDigest(env, Date.UTC(2026, 9, 14, 3, 0, 0));
    expect(out.generated).toBe(false);
    expect(out.reason).toContain("no such table");
  });
});
