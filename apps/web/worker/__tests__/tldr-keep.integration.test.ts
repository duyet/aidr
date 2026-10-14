import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TldrBullet, TldrResult } from "../llm.js";

const tldrResult = vi.hoisted(() => ({ next: null as TldrResult | null }));

vi.mock("../llm.js", async (original) => ({
  ...(await original<typeof import("../llm.js")>()),
  generateTldr: vi.fn(async () => {
    if (!tldrResult.next) throw new Error("no stubbed TL;DR result");
    return tldrResult.next;
  }),
}));

vi.mock("../subscribe/send.js", async (original) => ({
  ...(await original<typeof import("../subscribe/send.js")>()),
  sendDailyTldr: vi.fn(),
}));

vi.mock("../notify/index.js", async (original) => ({
  ...(await original<typeof import("../notify/index.js")>()),
  dispatchStoryNotifications: vi.fn(),
  forceSendDigest: vi.fn(),
}));

const { generateTldr } = await import("../llm.js");
const { sendDailyTldr } = await import("../subscribe/send.js");
const { dispatchStoryNotifications, forceSendDigest } = await import(
  "../notify/index.js"
);
const { isHandlerError, regenerateTldr } = await import("../admin/handlers.js");
const { ensureDailyTldr, previewDailyTldr, TLDR_REFRESH_MS } = await import(
  "../tldr.js"
);
const { getFeed } = await import("../../src/lib/feed-queries.js");
const { generateTldr: tldrStep } = await import("../ingest/publish.js");
const { stepState } = await import("../../src/components/system/run-format.js");

import type { WorkflowStep } from "cloudflare:workers";
import type { IngestContext } from "../ingest/context.js";

import type { Env } from "../types.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next as SqliteInput[];
        return prepared;
      },
      all: async () => ({ results: statement.all(...args) as unknown[] }),
      first: async () => statement.get(...args) ?? null,
      run: async () => {
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return prepared;
  }

  async batch(statements: Array<{ all: () => Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.all()));
  }
}

const FIRST_WRITE = new Date("2026-10-09T02:59:36Z");
const DATE = "2026-10-09";
const CHAIN_DOWN =
  "anyrouter chain exhausted: poolside/laguna-s-2.1: anyrouter request timed out | anyrouter/auto: anyrouter request timed out";

const STORIES = Array.from({ length: 8 }, (_, i) => ({
  id: `${(0xb0 + i).toString(16)}00000022222222`,
  title: `Lab ${i} ships an open-weight model that beats last year's frontier`,
  titleVi: `Phòng thí nghiệm ${i} ra mắt mô hình mở vượt mốc năm ngoái`,
}));

const modelDigest = (lang: "en" | "vi"): TldrBullet[] =>
  STORIES.map((story, i) => ({
    text:
      lang === "en"
        ? `Lab ${i}'s release puts an open model level with closed ones on coding benchmarks.`
        : `Bản phát hành của phòng thí nghiệm ${i} đưa mô hình mở ngang hàng mô hình đóng về lập trình.`,
    item_ids: [story.id],
  }));

const GOOD: TldrResult = {
  bullets_en: modelDigest("en"),
  bullets_vi: modelDigest("vi"),
  tokens: 4_200,
};
const FAILED: TldrResult = {
  bullets_en: [],
  bullets_vi: [],
  tokens: 0,
  error: CHAIN_DOWN,
};

let sqlite: DatabaseSync;
let env: Env;

function insertStory(
  story: { id: string; title: string; titleVi: string },
  rank: number,
  publishedSec: number
): void {
  sqlite
    .prepare(
      `INSERT INTO items (id, source_id, url, title, summary, published_at,
                          fetched_at, rank_score, status)
       VALUES (?, 'hn', ?, ?, ?, ?, ?, ?, 'published')`
    )
    .run(
      story.id,
      `https://example.test/${story.id}`,
      story.title,
      `${story.title}, according to the release notes.`,
      publishedSec,
      publishedSec,
      rank
    );
  sqlite
    .prepare(
      "INSERT INTO translations (item_id, lang, title, summary) VALUES (?, 'vi', ?, ?)"
    )
    .run(story.id, story.titleVi, story.titleVi);
}

function storedDigest(): {
  bullets_en: TldrBullet[];
  bullets_vi: TldrBullet[];
} {
  const row = sqlite
    .prepare("SELECT bullets_en, bullets_vi FROM tldr_snapshots WHERE date = ?")
    .get(DATE) as { bullets_en: string; bullets_vi: string };
  return {
    bullets_en: JSON.parse(row.bullets_en),
    bullets_vi: JSON.parse(row.bullets_vi),
  };
}

function at(ms: number): void {
  vi.setSystemTime(new Date(ms));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(FIRST_WRITE.getTime());
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  const nowSec = Math.floor(FIRST_WRITE.getTime() / 1000);
  STORIES.forEach((story, i) => {
    insertStory(story, 50 - i, nowSec - 3600);
  });
  env = { DB: new SqliteD1(sqlite) } as unknown as Env;
  tldrResult.next = null;
  vi.mocked(generateTldr).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

describe("TL;DR refresh that degrades to headlines", () => {
  it("keeps the model digest already stored for the date", async () => {
    tldrResult.next = GOOD;
    expect(await ensureDailyTldr(env)).toMatchObject({ generated: true });

    at(FIRST_WRITE.getTime() + TLDR_REFRESH_MS + 60_000);
    tldrResult.next = FAILED;
    const stats = await ensureDailyTldr(env);

    expect(generateTldr).toHaveBeenCalledTimes(2);
    expect(storedDigest()).toEqual({
      bullets_en: GOOD.bullets_en,
      bullets_vi: GOOD.bullets_vi,
    });
    expect(stats.generated).toBe(false);
    expect(stats.reason).toMatch(/^kept model digest/);
    expect(stats.reason).toContain(CHAIN_DOWN);
  });

  it("shows a kept digest as degraded in the run log", async () => {
    tldrResult.next = GOOD;
    await ensureDailyTldr(env);
    at(FIRST_WRITE.getTime() + TLDR_REFRESH_MS + 60_000);
    tldrResult.next = FAILED;
    const ctx: IngestContext = {
      step: {
        do: async (_name: string, a: unknown, b?: unknown) =>
          (typeof a === "function" ? a : (b as () => unknown))(),
      } as unknown as WorkflowStep,
      env,
      runId: "run-1",
      steps: [],
      mode: { dryRun: false, steps: ["tldr"] },
    };

    await tldrStep(ctx);

    expect(ctx.steps.map(stepState)).toEqual(["degraded"]);
  });

  it("waits the refresh interval before retrying a kept digest", async () => {
    tldrResult.next = GOOD;
    await ensureDailyTldr(env);
    const failedAt = FIRST_WRITE.getTime() + TLDR_REFRESH_MS + 60_000;
    at(failedAt);
    tldrResult.next = FAILED;
    await ensureDailyTldr(env);

    at(failedAt + 30 * 60_000);
    expect(await ensureDailyTldr(env)).toMatchObject({ generated: false });
    expect(generateTldr).toHaveBeenCalledTimes(2);

    at(failedAt + TLDR_REFRESH_MS);
    tldrResult.next = GOOD;
    expect(await ensureDailyTldr(env)).toMatchObject({ generated: true });
  });

  it("replaces a model digest too thin for the current stories", async () => {
    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at, fallback) VALUES (?, ?, ?, ?, 0)"
      )
      .run(
        DATE,
        JSON.stringify(GOOD.bullets_en.slice(0, 3)),
        JSON.stringify(GOOD.bullets_vi.slice(0, 3)),
        FIRST_WRITE.getTime() - 60_000
      );
    tldrResult.next = FAILED;

    expect(await ensureDailyTldr(env)).toMatchObject({ generated: true });
    expect(storedDigest().bullets_en.map((b) => b.text)).toEqual(
      STORIES.map((story) => story.title)
    );

    at(FIRST_WRITE.getTime() + 30 * 60_000);
    await ensureDailyTldr(env);
    expect(generateTldr).toHaveBeenCalledTimes(1);
  });

  it("stores the headlines when the date has no digest yet", async () => {
    tldrResult.next = FAILED;
    const stats = await ensureDailyTldr(env);

    expect(stats.generated).toBe(true);
    expect(storedDigest().bullets_en.map((b) => b.text)).toEqual(
      STORIES.map((story) => story.title)
    );
    expect(storedDigest().bullets_vi.map((b) => b.text)).toEqual(
      STORIES.map((story) => story.titleVi)
    );
  });

  it("replaces stored headlines with fresher headlines", async () => {
    tldrResult.next = FAILED;
    await ensureDailyTldr(env);

    const later = FIRST_WRITE.getTime() + TLDR_REFRESH_MS + 60_000;
    at(later);
    const breaking = {
      id: "c000000033333333",
      title: "A new frontier model tops every leaderboard",
      titleVi: "Mô hình mới dẫn đầu mọi bảng xếp hạng",
    };
    insertStory(breaking, 99, Math.floor(later / 1000) - 60);
    await ensureDailyTldr(env);

    expect(storedDigest().bullets_en[0]?.text).toBe(breaking.title);
  });

  it("does not keep a homepage headline rebuild as a model digest", async () => {
    sqlite.exec("UPDATE items SET published_at = published_at - 2 * 86400");
    const nowSec = Math.floor(FIRST_WRITE.getTime() / 1000);
    sqlite
      .prepare("UPDATE items SET published_at = ? WHERE id = ?")
      .run(nowSec - 3600, STORIES[0].id);
    tldrResult.next = {
      ...GOOD,
      bullets_en: GOOD.bullets_en.slice(0, 1),
      bullets_vi: GOOD.bullets_vi.slice(0, 1),
    };
    await ensureDailyTldr(env);
    await getFeed(env.DB);
    expect(storedDigest().bullets_en).toHaveLength(STORIES.length);

    tldrResult.next = FAILED;
    const stats = await ensureDailyTldr(env);

    expect(stats.reason).not.toMatch(/^kept model digest/);
    expect(storedDigest().bullets_en.map((b) => b.text)).toEqual([
      STORIES[0].title,
    ]);
  });

  it("does not keep a homepage Vietnamese-only headline rebuild as a model digest", async () => {
    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at, fallback) VALUES (?, ?, ?, ?, 0)"
      )
      .run(
        DATE,
        JSON.stringify(GOOD.bullets_en),
        JSON.stringify(GOOD.bullets_en),
        FIRST_WRITE.getTime() - 60_000
      );
    await getFeed(env.DB);
    expect(storedDigest().bullets_en).toEqual(GOOD.bullets_en);
    expect(storedDigest().bullets_vi.map((b) => b.text)).toEqual(
      STORIES.map((story) => story.titleVi)
    );

    at(FIRST_WRITE.getTime() + TLDR_REFRESH_MS + 60_000);
    tldrResult.next = FAILED;
    const stats = await ensureDailyTldr(env);

    expect(stats.reason).not.toMatch(/^kept model digest/);
    expect(storedDigest().bullets_en.map((b) => b.text)).toEqual(
      STORIES.map((story) => story.title)
    );
  });

  it("leaves a stored digest alone when the homepage has nothing to rebuild it from", async () => {
    sqlite.prepare("DELETE FROM items WHERE id <> ?").run(STORIES[0].id);
    const createdAt = FIRST_WRITE.getTime() - 60_000;
    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at, fallback) VALUES (?, ?, ?, ?, 0)"
      )
      .run(
        DATE,
        JSON.stringify(GOOD.bullets_en),
        JSON.stringify(GOOD.bullets_en),
        createdAt
      );

    await getFeed(env.DB);

    expect(
      sqlite
        .prepare(
          "SELECT created_at, fallback FROM tldr_snapshots WHERE date = ?"
        )
        .get(DATE)
    ).toEqual({ created_at: createdAt, fallback: 0 });
  });

  it("overwrites a pre-migration row whose fallback is NULL", async () => {
    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at, fallback) VALUES (?, ?, ?, ?, NULL)"
      )
      .run(
        DATE,
        JSON.stringify(GOOD.bullets_en),
        JSON.stringify(GOOD.bullets_vi),
        FIRST_WRITE.getTime() - TLDR_REFRESH_MS - 60_000
      );
    tldrResult.next = FAILED;

    const stats = await ensureDailyTldr(env);

    expect(stats.generated).toBe(true);
    expect(stats.reason).not.toMatch(/^kept model digest/);
    expect(storedDigest().bullets_en.map((b) => b.text)).toEqual(
      STORIES.map((story) => story.title)
    );
  });
});

describe("TL;DR dry-run preview", () => {
  const createdAt = () =>
    (
      sqlite
        .prepare("SELECT created_at FROM tldr_snapshots WHERE date = ?")
        .get(DATE) as { created_at: number }
    ).created_at;

  it("reports the kept model digest and writes nothing", async () => {
    tldrResult.next = GOOD;
    await ensureDailyTldr(env);
    const before = createdAt();
    at(FIRST_WRITE.getTime() + TLDR_REFRESH_MS + 60_000);
    tldrResult.next = FAILED;

    const preview = await previewDailyTldr(env);

    expect(preview).toMatchObject({ generated: false, kept: true });
    expect(preview.reason).toMatch(/^preview: kept model digest/);
    expect(preview.bullets_en).toEqual(GOOD.bullets_en);
    expect(preview.bullets_vi).toEqual(GOOD.bullets_vi);
    expect(createdAt()).toBe(before);
    expect(storedDigest().bullets_en).toEqual(GOOD.bullets_en);
  });

  it("rates a kept dry-run digest degraded and shows its bullets", async () => {
    tldrResult.next = GOOD;
    await ensureDailyTldr(env);
    at(FIRST_WRITE.getTime() + TLDR_REFRESH_MS + 60_000);
    tldrResult.next = FAILED;
    const ctx: IngestContext = {
      step: {
        do: async (_name: string, a: unknown, b?: unknown) =>
          (typeof a === "function" ? a : (b as () => unknown))(),
      } as unknown as WorkflowStep,
      env,
      runId: "run-1",
      steps: [],
      mode: { dryRun: true, steps: ["tldr"] },
    };

    const result = await tldrStep(ctx);

    expect(ctx.steps[0]?.action).toBe("kept");
    expect(ctx.steps.map(stepState)).toEqual(["degraded"]);
    expect(result.generated).toBe(false);
    expect(result.preview?.bullets).toBe(STORIES.length);
    expect(result.preview?.en[0]).toBe(GOOD.bullets_en[0].text);
  });

  it("still previews headlines when there is no model digest to keep", async () => {
    tldrResult.next = FAILED;

    const preview = await previewDailyTldr(env);

    expect(preview.generated).toBe(true);
    expect(preview.kept).toBeUndefined();
    expect(preview.bullets_en.map((b) => b.text)).toEqual(
      STORIES.map((story) => story.title)
    );
  });
});

describe("admin TL;DR regenerate", () => {
  const DAY_MS = 86_400_000;
  const row = () =>
    sqlite.prepare("SELECT * FROM tldr_snapshots WHERE date = ?").get(DATE);
  const headlines = (lang: "en" | "vi"): TldrBullet[] =>
    STORIES.map((story) => ({
      text: lang === "en" ? story.title : story.titleVi,
      item_ids: [story.id],
    }));
  const seedRow = (
    bullets: { bullets_en: TldrBullet[]; bullets_vi: TldrBullet[] },
    fallback: number | null
  ) =>
    sqlite
      .prepare(
        "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at, fallback, sent_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        DATE,
        JSON.stringify(bullets.bullets_en),
        JSON.stringify(bullets.bullets_vi),
        FIRST_WRITE.getTime() - 60_000,
        fallback,
        FIRST_WRITE.getTime() - 30_000
      );
  const HEADLINES = {
    bullets_en: headlines("en"),
    bullets_vi: headlines("vi"),
  };

  // Today is DATE itself; "a closed date" is DATE seen two days later.
  const WHEN = [
    { label: "today", laterMs: 10 * 60_000, input: {} },
    { label: "a closed date", laterMs: 2 * DAY_MS, input: { date: DATE } },
  ];

  it("writes a closed date's model digest from that date's stories only", async () => {
    seedRow(HEADLINES, null);
    const nextDay = {
      id: "d000000044444444",
      title: "Next-day story that belongs to 2026-10-10",
      titleVi: "Tin của ngày hôm sau",
    };
    const dayBefore = {
      id: "e000000055555555",
      title: "Previous-day story that belongs to 2026-10-08",
      titleVi: "Tin của ngày hôm trước",
    };
    // 2026-10-10 00:30 ICT and 2026-10-08 23:30 ICT.
    insertStory(nextDay, 99, Date.parse("2026-10-09T17:30:00Z") / 1000);
    insertStory(dayBefore, 98, Date.parse("2026-10-08T16:30:00Z") / 1000);
    at(FIRST_WRITE.getTime() + 2 * DAY_MS);
    tldrResult.next = GOOD;

    const result = await regenerateTldr(env, { date: DATE });

    expect(result).toMatchObject({ date: DATE, written: true });
    const sent = vi.mocked(generateTldr).mock.calls[0]?.[1] ?? [];
    expect(sent.map((item) => item.id).sort()).toEqual(
      STORIES.map((story) => story.id).sort()
    );
    expect(row()).toMatchObject({
      bullets_en: JSON.stringify(GOOD.bullets_en),
      bullets_vi: JSON.stringify(GOOD.bullets_vi),
      fallback: 0,
      sent_at: FIRST_WRITE.getTime() - 30_000,
    });
    expect(sendDailyTldr).not.toHaveBeenCalled();
    expect(dispatchStoryNotifications).not.toHaveBeenCalled();
    expect(forceSendDigest).not.toHaveBeenCalled();
  });

  it.each(WHEN)(
    "leaves a good model digest untouched when $label degrades",
    async ({ laterMs, input }) => {
      seedRow(GOOD, 0);
      const before = row();
      at(FIRST_WRITE.getTime() + laterMs);
      tldrResult.next = FAILED;

      const result = await regenerateTldr(env, input);

      expect(generateTldr).toHaveBeenCalledTimes(1);
      expect(row()).toEqual(before);
      expect(result).toMatchObject({ written: false });
      if (isHandlerError(result)) throw new Error(result.error);
      expect(result.reason).toContain(CHAIN_DOWN);
    }
  );

  it.each(WHEN)(
    "leaves a headline row unchanged when $label degrades",
    async ({ laterMs, input }) => {
      seedRow(HEADLINES, null);
      const before = row();
      at(FIRST_WRITE.getTime() + laterMs);
      tldrResult.next = FAILED;

      await regenerateTldr(env, input);

      expect(generateTldr).toHaveBeenCalledTimes(1);
      expect(row()).toEqual(before);
    }
  );

  it.each([
    {
      label: "Vietnamese fell back to headlines",
      translated: true,
      next: { ...GOOD, bullets_vi: GOOD.bullets_en },
    },
    {
      label: "Vietnamese is English with no title_vi to fall back to",
      translated: false,
      next: { ...GOOD, bullets_vi: GOOD.bullets_en },
    },
    {
      label: "English is empty",
      translated: true,
      next: { ...GOOD, bullets_en: [] },
    },
  ])("does not write a digest whose $label", async ({ translated, next }) => {
    if (!translated) sqlite.exec("DELETE FROM translations");
    seedRow(HEADLINES, null);
    const before = row();
    at(FIRST_WRITE.getTime() + 2 * DAY_MS);
    tldrResult.next = next;

    const result = await regenerateTldr(env, { date: DATE });

    expect(result).toMatchObject({ written: false });
    expect(row()).toEqual(before);
  });

  it("accepts a date exactly 14 days back", async () => {
    tldrResult.next = FAILED;

    const result = await regenerateTldr(env, { date: "2026-09-25" });

    expect(result).toMatchObject({ date: "2026-09-25", written: false });
    expect(generateTldr).not.toHaveBeenCalled();
  });

  it("dry run shows the model digest and writes nothing", async () => {
    seedRow(HEADLINES, null);
    const before = row();
    at(FIRST_WRITE.getTime() + 2 * DAY_MS);
    tldrResult.next = GOOD;

    const result = await regenerateTldr(env, { date: DATE, dryRun: true });

    expect(result).toMatchObject({
      date: DATE,
      generated: true,
      written: false,
      bullets_en: GOOD.bullets_en,
      bullets_vi: GOOD.bullets_vi,
    });
    expect(row()).toEqual(before);
  });

  it.each([
    { label: "tomorrow", input: { date: "2026-10-10" } },
    { label: "an impossible day", input: { date: "2026-02-30" } },
    { label: "a non-ISO date", input: { date: "10/09/2026" } },
    { label: "15 days back", input: { date: "2026-09-24" } },
    { label: "a non-boolean dryRun", input: { date: DATE, dryRun: "yes" } },
  ])("rejects $label without calling the model", async ({ input }) => {
    seedRow(GOOD, 0);
    const before = row();
    tldrResult.next = FAILED;

    const result = await regenerateTldr(env, input);

    expect(result).toMatchObject({ status: 400 });
    expect(generateTldr).not.toHaveBeenCalled();
    expect(row()).toEqual(before);
  });
});
