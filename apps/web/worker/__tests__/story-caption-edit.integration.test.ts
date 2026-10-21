/**
 * The admin caption edit rebuilds a sent story post from current D1 text and
 * edits only a message that `notifications` says was sent. Real SQLite, real
 * migrations, the real dispatcher posts first; only `fetch` is stubbed.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isHandlerError, reviseStoryCaption } from "../admin/handlers.js";
import { dispatchStoryNotifications } from "../notify/index.js";
import {
  editStoryCaption,
  type PreparedStoryPost,
} from "../notify/telegram.js";
import type { StoryPayload, StoryPostKind } from "../notify/types.js";
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
}

const NOW = new Date("2026-10-01T03:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const ID = "edit0000aaaa1111";
const TITLE_VI =
  "Anthropic mở văn phòng Tokyo để bán Claude cho các ngân hàng Nhật Bản";
const SUMMARY_VI =
  "Anthropic cho biết văn phòng mới tại Tokyo sẽ bán Claude cho các ngân hàng và công ty bảo hiểm Nhật Bản, và tuyển 40 người trước tháng 3.";
const FIXED_VI =
  "Anthropic cho biết văn phòng mới tại Tokyo sẽ bán Claude cho các ngân hàng và hãng bảo hiểm Nhật Bản, và tuyển 40 nhân viên trước tháng 3.";

interface Call {
  method: string;
  body: Record<string, unknown>;
}

let sqlite: DatabaseSync;
let env: Env;
let calls: Call[];

function auditRows(): Array<{ action: string; detail: string }> {
  return sqlite
    .prepare("SELECT action, detail FROM admin_audit")
    .all() as Array<{ action: string; detail: string }>;
}

function setSummary(summary: string) {
  sqlite
    .prepare(
      "UPDATE translations SET summary = ? WHERE item_id = ? AND lang = 'vi'"
    )
    .run(summary, ID);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  sqlite.exec(`
    WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 200)
    INSERT INTO items (id, source_id, url, title, summary, published_at, fetched_at, rank_score, llm_importance, status)
    SELECT 'filler' || n, 'hn', 'https://example.test/filler' || n, 'filler ' || n, 'x',
           ${NOW_SEC - 3600}, ${NOW_SEC - 3600}, 1, 1, 'published' FROM s`);
  sqlite
    .prepare(
      `INSERT INTO items (id, source_id, url, title, summary, published_at, fetched_at,
                          rank_score, llm_importance, status, source_lang)
       VALUES (?, 'techcrunch', ?, ?, ?, ?, ?, 10, 8, 'published', 'en')`
    )
    .run(
      ID,
      `https://example.test/${ID}`,
      "Anthropic opens a Tokyo office to sell Claude to Japanese banks",
      "Anthropic said its new Tokyo office will sell Claude to Japanese banks and insurers, and hire 40 people by March.",
      NOW_SEC - 3600,
      NOW_SEC - 3600
    );
  sqlite
    .prepare(
      "INSERT INTO translations (item_id, lang, title, summary) VALUES (?, 'vi', ?, ?)"
    )
    .run(ID, TITLE_VI, SUMMARY_VI);

  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = String(url).split("/").pop() ?? "";
      calls.push({ method, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 7 } }),
        { headers: { "content-type": "application/json" } }
      );
    })
  );
  env = {
    DB: new SqliteD1(sqlite) as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_VI_CHAT_ID: "@vi",
    TELEGRAM_EN_CHAT_ID: "@en",
  } as Env;

  await dispatchStoryNotifications(env);
  calls = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sqlite.close();
});

describe("reviseStoryCaption", () => {
  it("is a dry run by default: it shows the new caption and calls nothing", async () => {
    setSummary(FIXED_VI);

    const result = await reviseStoryCaption(env, {
      channel: "telegram",
      itemId: ID,
    });

    expect(result).toMatchObject({
      dryRun: true,
      changed: true,
      edited: false,
      messageId: "7",
      kind: "text",
    });
    if (isHandlerError(result)) throw new Error(result.error);
    expect(result.before).toContain(SUMMARY_VI);
    expect(result.after).toContain(FIXED_VI);
    expect(calls).toEqual([]);
    expect(auditRows()).toEqual([]);
  });

  it("edits the recorded message, records the new caption and audits it", async () => {
    setSummary(FIXED_VI);

    const result = await reviseStoryCaption(env, {
      channel: "telegram",
      itemId: ID,
      dryRun: false,
    });

    expect(result).toMatchObject({ edited: true, changed: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("editMessageText");
    expect(calls[0]?.body).toMatchObject({ chat_id: "@vi", message_id: 7 });
    expect(String(calls[0]?.body.text)).toContain(FIXED_VI);
    expect(
      sqlite
        .prepare(
          "SELECT caption FROM notify_posts WHERE channel = 'telegram' AND item_id = ?"
        )
        .get(ID)
    ).toEqual({ caption: calls[0]?.body.text });
    const [audit] = auditRows();
    expect(audit?.action).toBe("telegram.edit_caption");
    expect(JSON.parse(audit?.detail ?? "{}")).toMatchObject({
      channel: "telegram",
      itemId: ID,
      messageId: "7",
      kind: "text",
    });
  });

  it("does nothing when the caption is unchanged", async () => {
    const result = await reviseStoryCaption(env, {
      channel: "telegram",
      itemId: ID,
      dryRun: false,
    });

    expect(result).toMatchObject({ changed: false, edited: false });
    expect(calls).toEqual([]);
  });

  it("refuses to edit in text the send gate would refuse", async () => {
    sqlite
      .prepare(
        `INSERT INTO translation_knowledge (id, kind, source_term, vi_term, bad_vi, status, created_at)
         VALUES ('rule-insurer', 'avoid', 'insurers', 'công ty bảo hiểm', '["người bảo hiểm"]', 'active', 1)`
      )
      .run();
    setSummary(SUMMARY_VI.replace("công ty bảo hiểm", "người bảo hiểm"));

    const result = await reviseStoryCaption(env, {
      channel: "telegram",
      itemId: ID,
      dryRun: false,
    });

    expect(result).toEqual({
      error: expect.stringContaining("gate:draft"),
      status: 409,
    });
    expect(calls).toEqual([]);
  });

  it("refuses a post with no recorded caption, and a story never sent", async () => {
    sqlite.exec("DELETE FROM notify_posts");
    expect(
      await reviseStoryCaption(env, { channel: "telegram", itemId: ID })
    ).toMatchObject({ status: 409 });
    expect(
      await reviseStoryCaption(env, { channel: "telegram", itemId: "nope" })
    ).toMatchObject({ status: 404 });
    expect(
      await reviseStoryCaption(env, { channel: "facebook-en", itemId: ID })
    ).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  it("finds the digest highlight's post through its story id", async () => {
    sqlite.exec(`UPDATE notifications SET item_id = 'digest:2026-10-01:top', story_id = '${ID}'
                 WHERE channel = 'telegram' AND item_id = '${ID}'`);
    setSummary(FIXED_VI);

    const result = await reviseStoryCaption(env, {
      channel: "telegram",
      itemId: ID,
    });

    expect(result).toMatchObject({ dryRun: true, changed: true });
  });
});

describe("editStoryCaption", () => {
  const story = {
    id: ID,
    url: "https://example.test/story",
    title: "Title",
    summary: "Summary.",
    image_url: null,
    category: null,
    points: 0,
    comments: 0,
    rank_score: 1,
    llm_importance: 8,
    lang: "vi",
  } satisfies StoryPayload;
  const post: PreparedStoryPost = {
    story,
    caption: "<b>Title</b>\n\nSummary.",
    replyMarkup: { inline_keyboard: [[{ text: "Đọc bài →", url: "u" }]] },
  };

  it.each([
    ["photo", "editMessageCaption", true],
    ["video", "editMessageCaption", true],
    ["album", "editMessageCaption", false],
    ["text", "editMessageText", true],
  ] as const)(
    "edits a %s post with %s, Read button sent again: %s",
    async (kind: StoryPostKind, method, button) => {
      const result = await editStoryCaption(env, "@vi", "42", kind, post);

      expect(result).toMatchObject({ ok: true, messageId: "42" });
      expect(calls.map((call) => call.method)).toEqual([method]);
      const body = calls[0]?.body ?? {};
      expect(body.message_id).toBe(42);
      expect("reply_markup" in body).toBe(button);
      // An album's Read link lives in its caption.
      if (kind === "album") expect(String(body.caption)).toContain("<a href=");
    }
  );

  it("treats Telegram's 'message is not modified' as done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              description:
                "Bad Request: message is not modified: specified new message content and reply markup are exactly the same",
            }),
            { status: 400 }
          )
      )
    );
    expect(await editStoryCaption(env, "@vi", "42", "photo", post)).toEqual({
      ok: true,
      messageId: "42",
      post: { kind: "photo", caption: post.caption },
    });
  });
});
