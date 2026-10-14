/**
 * Right after the daily digest, each Telegram channel posts the digest's top
 * postable story on its own, once. Real SQLite, real migrations, the real
 * dispatcher; only `fetch` is stubbed. The rules under test: a retry never
 * posts the highlight twice, an ambiguous digest never triggers it, it does
 * not count as a trending post, a gated top story falls back to the next
 * card story, and a highlight with no postable story is skipped once.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchStoryNotifications,
  forceSendDigest,
  localDayStartMs,
  trendingGapSql,
} from "../notify/index.js";
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

// 10:00 in the audience timezone, after the 08:00 digest hour.
const NOW = new Date("2026-10-01T03:00:00Z");
const TODAY = "2026-10-01";
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const SUMMARY =
  "The report says the companies are in early talks, with a deal that could be reached within weeks if regulators do not object.";
const SUMMARY_VI =
  "Báo cáo cho biết hai công ty đang đàm phán ở giai đoạn đầu và thỏa thuận có thể đạt được trong vài tuần nếu cơ quan quản lý không phản đối.";

/** Importance 5 keeps every story under the trending floor, so the only
 *  story post a run can make is the highlight. */
const STORIES = Array.from({ length: 8 }, (_, i) => ({
  id: `${(0xa0 + i).toString(16)}00000011111111`,
  title: `Muse Wonder story number ${i} puts Meta back in the AI lead`,
  titleVi: `Tin số ${i}: Muse Wonder đưa Meta trở lại vị thế dẫn đầu về AI`,
  rank: 50 - i,
}));
const TOP = STORIES[0];

interface Call {
  method: string;
  body: Record<string, unknown>;
}

let sqlite: DatabaseSync;
let env: Env;
let calls: Call[];
let respond: (call: Call) => Response | Promise<Response>;

const ok = () =>
  new Response(
    JSON.stringify({ ok: true, result: { message_id: 100 + calls.length } }),
    { headers: { "content-type": "application/json" } }
  );
const rejected = () =>
  new Response(JSON.stringify({ ok: false, description: "bad request" }), {
    status: 400,
  });

const isDigest = (call: Call) =>
  call.method === "sendMessage" &&
  /AI news today|AI hôm nay có gì/.test(String(call.body.text));
const callsTo = (chat: string) =>
  calls.filter((call) => call.body.chat_id === chat);

function row(channel: string, key: string) {
  return sqlite
    .prepare(
      "SELECT status, attempts FROM notifications WHERE channel = ? AND item_id = ?"
    )
    .get(channel, key) as { status: string; attempts: number } | undefined;
}

function lastError(channel: string, key: string): string | null {
  const found = sqlite
    .prepare(
      "SELECT last_error FROM notifications WHERE channel = ? AND item_id = ?"
    )
    .get(channel, key) as { last_error: string | null } | undefined;
  return found?.last_error ?? null;
}

/** A Vietnamese summary under the post-quality minimum: the story fails the
 *  gate on the VI channel only. */
function gateVietnamese(storyId: string) {
  sqlite
    .prepare(
      "UPDATE translations SET summary = 'Tin từ nguồn.' WHERE item_id = ? AND lang = 'vi'"
    )
    .run(storyId);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  for (const story of STORIES) {
    sqlite
      .prepare(
        `INSERT INTO items (id, source_id, url, title, summary, image_url, published_at,
                            fetched_at, rank_score, llm_importance, status)
         VALUES (?, 'hn', ?, ?, ?, ?, ?, ?, ?, 5, 'published')`
      )
      .run(
        story.id,
        `https://example.test/${story.id}`,
        story.title,
        SUMMARY,
        `https://img.example.test/${story.id}.jpg`,
        NOW_SEC - 3600,
        NOW_SEC - 3600,
        story.rank
      );
    sqlite
      .prepare(
        "INSERT INTO translations (item_id, lang, title, summary) VALUES (?, 'vi', ?, ?)"
      )
      .run(story.id, story.titleVi, SUMMARY_VI);
  }
  const bullets = (lang: "en" | "vi") =>
    JSON.stringify(
      STORIES.slice(0, 3).map((story) => ({
        text: lang === "en" ? story.title : story.titleVi,
        item_ids: [story.id],
      }))
    );
  sqlite
    .prepare(
      "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(TODAY, bullets("en"), bullets("vi"), NOW.getTime());

  calls = [];
  respond = ok;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = String(url).split("/").pop() ?? "";
      const call = { method, body: JSON.parse(String(init?.body ?? "{}")) };
      calls.push(call);
      return respond(call);
    })
  );
  env = {
    DB: new SqliteD1(sqlite) as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_VI_CHAT_ID: "@vi",
    TELEGRAM_EN_CHAT_ID: "@en",
  } as Env;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sqlite.close();
});

describe("digest highlight", () => {
  it("posts the top story right after the digest, once, and not as trending", async () => {
    const report = await dispatchStoryNotifications(env);

    const en = callsTo("@en");
    expect(en).toHaveLength(2);
    expect(isDigest(en[0])).toBe(true);
    // The story send path: its own photo, the full caption, a Read button.
    expect(en[1].method).toBe("sendPhoto");
    expect(en[1].body.photo).toBe(`https://img.example.test/${TOP.id}.jpg`);
    expect(String(en[1].body.caption)).toContain(TOP.title);
    expect(String(en[1].body.caption)).toContain(SUMMARY);
    expect(JSON.stringify(en[1].body.reply_markup)).toContain(
      TOP.id.slice(0, 8)
    );
    const viCalls = callsTo("@vi");
    expect(viCalls).toHaveLength(2);
    expect(String(viCalls[1].body.caption)).toContain(TOP.titleVi);
    expect(row("telegram-en", `digest:${TODAY}:top`)?.status).toBe("sent");
    expect(report.sent["telegram-en"]).toBe(2);

    // Trending's daily count and 3h gap do not see the highlight.
    const gap = sqlite
      .prepare(trendingGapSql)
      .get(
        localDayStartMs(NOW.getTime(), "Asia/Ho_Chi_Minh"),
        "telegram-en"
      ) as {
      sent_today: number | null;
      last_posted_at: number | null;
    };
    expect(gap.sent_today ?? 0).toBe(0);
    expect(gap.last_posted_at).toBeNull();

    // A retried notify step, or the next scheduled run, posts nothing.
    calls = [];
    await dispatchStoryNotifications(env);
    vi.setSystemTime(new Date(NOW.getTime() + 30 * 60_000));
    await dispatchStoryNotifications(env);
    expect(calls).toEqual([]);

    // A digest sent hours ago (an older deploy) gets no late highlight.
    sqlite.exec(`DELETE FROM notifications WHERE item_id LIKE '%:top'`);
    vi.setSystemTime(new Date(NOW.getTime() + 6 * 3600_000));
    await dispatchStoryNotifications(env);
    expect(calls).toEqual([]);
    expect(row("telegram-en", `digest:${TODAY}:top`)).toBeUndefined();
  });

  it("does not post the highlight after an ambiguous digest", async () => {
    // Vietnamese digest times out (it may be in the channel); English sends.
    respond = (call) => {
      if (call.body.chat_id === "@vi" && isDigest(call)) {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }
      return ok();
    };

    await dispatchStoryNotifications(env);

    expect(callsTo("@vi")).toHaveLength(1);
    expect(row("telegram", `digest:${TODAY}`)?.status).toBe("ambiguous");
    expect(row("telegram", `digest:${TODAY}:top`)).toBeUndefined();
    expect(callsTo("@en")).toHaveLength(2);
    expect(row("telegram-en", `digest:${TODAY}:top`)?.status).toBe("sent");

    calls = [];
    vi.setSystemTime(new Date(NOW.getTime() + 30 * 60_000));
    await dispatchStoryNotifications(env);
    expect(callsTo("@vi")).toEqual([]);
  });

  it("posts the next card story when the top one fails the channel's gate", async () => {
    // 2026-10-14: the top story's VI summary was source chrome, so the VI
    // channel got no highlight at all.
    gateVietnamese(TOP.id);
    const next = STORIES[1];

    const report = await dispatchStoryNotifications(env);

    const viCalls = callsTo("@vi");
    expect(viCalls).toHaveLength(2);
    expect(String(viCalls[1].body.caption)).toContain(next.titleVi);
    expect(String(viCalls[1].body.caption)).not.toContain(TOP.titleVi);
    expect(row("telegram", `digest:${TODAY}:top`)).toEqual({
      status: "sent",
      attempts: 1,
    });
    expect(report.reasons.telegram?.highlight).toBe("sent");
    expect(report.reasons.telegram?.highlightStory).toBe(next.id);
    expect(lastError("telegram", `digest:${TODAY}:top`)).toContain(
      `${TOP.id} gate:short`
    );

    // English copy of the top story passes, so English is unchanged.
    const en = callsTo("@en");
    expect(en).toHaveLength(2);
    expect(String(en[1].body.caption)).toContain(TOP.title);
    expect(report.reasons["telegram-en"]?.highlightStory).toBe(TOP.id);
    expect(lastError("telegram-en", `digest:${TODAY}:top`)).toBeNull();
  });

  it("skips once, with no retry, when the first three card stories fail the gate", async () => {
    // The fourth story passes, so a post here would mean the cap is gone.
    for (const story of STORIES.slice(0, 3)) gateVietnamese(story.id);

    const report = await dispatchStoryNotifications(env);

    expect(callsTo("@vi")).toHaveLength(1);
    expect(isDigest(callsTo("@vi")[0])).toBe(true);
    const key = `digest:${TODAY}:top`;
    expect(row("telegram", key)).toEqual({ status: "skipped", attempts: 1 });
    expect(report.reasons.telegram?.highlight).toBe("skipped");
    for (const story of STORIES.slice(0, 3)) {
      expect(lastError("telegram", key)).toContain(`${story.id} gate:short`);
    }
    expect(row("telegram-en", key)?.status).toBe("sent");

    // Later runs inside the highlight window neither post nor re-claim it.
    for (const minutes of [30, 60]) {
      calls = [];
      vi.setSystemTime(new Date(NOW.getTime() + minutes * 60_000));
      const later = await dispatchStoryNotifications(env);
      expect(callsTo("@vi")).toEqual([]);
      expect(later.reasons.telegram?.highlight).toBeUndefined();
    }
    expect(row("telegram", key)).toEqual({ status: "skipped", attempts: 1 });
  });

  it("lets an admin force-send retry a skipped highlight, once", async () => {
    for (const story of STORIES.slice(0, 3)) gateVietnamese(story.id);
    await dispatchStoryNotifications(env);
    const key = `digest:${TODAY}:top`;
    expect(row("telegram", key)?.status).toBe("skipped");

    // The VI copy is fixed, then the owner forces the digest out again.
    sqlite
      .prepare(
        "UPDATE translations SET summary = ? WHERE item_id = ? AND lang = 'vi'"
      )
      .run(SUMMARY_VI, STORIES[2].id);
    calls = [];
    await forceSendDigest(env);

    const viCalls = callsTo("@vi");
    expect(viCalls.filter((call) => !isDigest(call))).toHaveLength(1);
    expect(String(viCalls[1].body.caption)).toContain(STORIES[2].titleVi);
    expect(row("telegram", key)?.status).toBe("sent");
    // English already had its highlight: the force-send does not repeat it.
    expect(callsTo("@en").filter((call) => !isDigest(call))).toEqual([]);

    calls = [];
    vi.setSystemTime(new Date(NOW.getTime() + 30 * 60_000));
    await dispatchStoryNotifications(env);
    expect(callsTo("@vi")).toEqual([]);
  });

  it("retries a rejected highlight on the next run without reposting the digest", async () => {
    // Telegram answers every story call with a definite rejection: nothing
    // was posted, so the highlight is a clean retry.
    respond = (call) => (isDigest(call) ? ok() : rejected());

    await dispatchStoryNotifications(env);

    expect(row("telegram-en", `digest:${TODAY}`)?.status).toBe("sent");
    expect(row("telegram-en", `digest:${TODAY}:top`)).toEqual({
      status: "failed",
      attempts: 1,
    });

    calls = [];
    respond = ok;
    vi.setSystemTime(new Date(NOW.getTime() + 30 * 60_000));
    await dispatchStoryNotifications(env);

    const en = callsTo("@en");
    expect(en.some(isDigest)).toBe(false);
    expect(en).toHaveLength(1);
    expect(String(en[0].body.caption)).toContain(TOP.title);
    expect(row("telegram-en", `digest:${TODAY}:top`)?.status).toBe("sent");
  });
});
