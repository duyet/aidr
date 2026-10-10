import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteDayVideo,
  sendDayVideoTelegram,
  setDayVideo,
} from "../admin/handlers.js";
import type { Env } from "../types.js";

type Row = {
  youtube_id: string | null;
  short_id: string | null;
  title: string | null;
  youtube_id_vi: string | null;
  short_id_vi: string | null;
  title_vi: string | null;
  added_by: string | null;
};

/** Just enough D1 for the day_videos upsert / delete / audit statements. */
function makeEnv(extra: Record<string, unknown> = {}) {
  const rows = new Map<string, Row>();
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...b: unknown[]) {
          binds = b;
          return stmt;
        },
        async first() {
          if (sql.includes("FROM day_videos")) {
            return rows.get(binds[0] as string) ?? null;
          }
          return null;
        },
        async run() {
          if (sql.startsWith("INSERT INTO day_videos")) {
            const [
              date,
              youtube_id,
              short_id,
              title,
              youtube_id_vi,
              short_id_vi,
              title_vi,
              added_by,
            ] = binds as [
              string,
              string | null,
              string | null,
              string | null,
              string | null,
              string | null,
              string | null,
              string | null,
            ];
            rows.set(date, {
              youtube_id,
              short_id,
              title,
              youtube_id_vi,
              short_id_vi,
              title_vi,
              added_by,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE day_videos")) {
            const row = rows.get(binds[1] as string);
            if (row) {
              if (sql.includes("youtube_id_vi = NULL")) {
                Object.assign(row, {
                  youtube_id_vi: null,
                  short_id_vi: null,
                  title_vi: null,
                });
              } else {
                Object.assign(row, {
                  youtube_id: null,
                  short_id: null,
                  title: null,
                });
              }
            }
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (sql.startsWith("DELETE FROM day_videos")) {
            const had = rows.delete(binds[0] as string);
            return { meta: { changes: had ? 1 : 0 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { env: { DB: db, ...extra } as unknown as Env, rows };
}

describe("setDayVideo", () => {
  it("stores a desktop video and a mobile Short from pasted URLs", async () => {
    const { env, rows } = makeEnv();
    const result = await setDayVideo(
      env,
      "2026-10-02",
      {
        video: "https://youtu.be/B3vKYiV7rOw",
        short: "https://youtube.com/shorts/fStNAQhJo3M",
      },
      "admin-token"
    );
    expect(result).toMatchObject({
      ok: true,
      video: { youtube_id: "B3vKYiV7rOw", short_id: "fStNAQhJo3M" },
    });
    expect(rows.get("2026-10-02")?.added_by).toBe("admin-token");
  });

  it("sets and clears each field independently", async () => {
    const { env, rows } = makeEnv();
    await setDayVideo(env, "2026-10-02", { video: "B3vKYiV7rOw" }, null);
    await setDayVideo(env, "2026-10-02", { short: "fStNAQhJo3M" }, null);
    expect(rows.get("2026-10-02")).toMatchObject({
      youtube_id: "B3vKYiV7rOw",
      short_id: "fStNAQhJo3M",
    });
    await setDayVideo(env, "2026-10-02", { video: null }, null);
    expect(rows.get("2026-10-02")).toMatchObject({
      youtube_id: null,
      short_id: "fStNAQhJo3M",
    });
    // Clearing the last remaining id would leave an empty row: refuse.
    const refused = await setDayVideo(env, "2026-10-02", { short: "" }, null);
    expect(refused).toMatchObject({ status: 400 });
    expect(rows.get("2026-10-02")?.short_id).toBe("fStNAQhJo3M");
  });

  it("writes Vietnamese to the _vi columns and leaves English alone", async () => {
    const { env, rows } = makeEnv();
    await setDayVideo(env, "2026-10-02", { video: "B3vKYiV7rOw" }, null);
    const result = await setDayVideo(
      env,
      "2026-10-02",
      { lang: "vi", video: "fStNAQhJo3M", title: "Bản tin" },
      null
    );
    expect(result).toMatchObject({
      ok: true,
      video: { lang: "vi", youtube_id: "fStNAQhJo3M", title: "Bản tin" },
    });
    expect(rows.get("2026-10-02")).toMatchObject({
      youtube_id: "B3vKYiV7rOw",
      youtube_id_vi: "fStNAQhJo3M",
      title: null,
      title_vi: "Bản tin",
    });
    // Clearing vi keeps en; null clears, omitted is kept.
    await setDayVideo(env, "2026-10-02", { lang: "vi", video: null }, null);
    expect(rows.get("2026-10-02")).toMatchObject({
      youtube_id: "B3vKYiV7rOw",
      youtube_id_vi: null,
      title_vi: "Bản tin",
    });
  });

  it("allows a Vietnamese-only row but counts all four ids for the guard", async () => {
    const { env, rows } = makeEnv();
    expect(
      await setDayVideo(
        env,
        "2026-10-02",
        { lang: "vi", short: "fStNAQhJo3M" },
        null
      )
    ).toMatchObject({ ok: true });
    expect(rows.get("2026-10-02")).toMatchObject({
      youtube_id: null,
      short_id: null,
      short_id_vi: "fStNAQhJo3M",
    });
    // Clearing the last id of every language is refused.
    expect(
      await setDayVideo(env, "2026-10-02", { lang: "vi", short: null }, null)
    ).toMatchObject({ status: 400 });
    expect(rows.get("2026-10-02")?.short_id_vi).toBe("fStNAQhJo3M");
    // An English clear is fine while a Vietnamese id remains... but a
    // title-only English write must not conjure an English id.
    expect(
      await setDayVideo(env, "2026-10-02", { title: "EN title" }, null)
    ).toMatchObject({ ok: true, video: { youtube_id: null, short_id: null } });
  });

  it("rejects an unknown lang", async () => {
    const { env, rows } = makeEnv();
    expect(
      await setDayVideo(
        env,
        "2026-10-02",
        { lang: "fr", video: "B3vKYiV7rOw" },
        null
      )
    ).toMatchObject({ status: 400 });
    expect(rows.size).toBe(0);
  });

  it("rejects bad ids and dates before touching D1", async () => {
    const { env, rows } = makeEnv();
    for (const [date, input] of [
      ["2026-10-02", { video: "https://evil.example/watch?v=B3vKYiV7rOw" }],
      ["2026-10-02", { short: "not-an-id" }],
      ["2026-02-30", { video: "B3vKYiV7rOw" }],
      ["../x", { video: "B3vKYiV7rOw" }],
      ["2026-10-02", {}],
    ] as const) {
      expect(await setDayVideo(env, date, input, null)).toMatchObject({
        status: 400,
      });
    }
    expect(rows.size).toBe(0);
  });
});

describe("deleteDayVideo", () => {
  it("removes the row and reports whether one existed", async () => {
    const { env, rows } = makeEnv();
    await setDayVideo(env, "2026-10-02", { video: "B3vKYiV7rOw" }, null);
    expect(await deleteDayVideo(env, "2026-10-02")).toEqual({
      ok: true,
      date: "2026-10-02",
      deleted: true,
    });
    expect(rows.size).toBe(0);
    expect(await deleteDayVideo(env, "2026-10-02")).toMatchObject({
      deleted: false,
    });
    expect(await deleteDayVideo(env, "nope")).toMatchObject({ status: 400 });
  });
});

describe("deleteDayVideo with lang", () => {
  it("clears one language and drops the row only when nothing remains", async () => {
    const { env, rows } = makeEnv();
    await setDayVideo(env, "2026-10-02", { video: "B3vKYiV7rOw" }, null);
    await setDayVideo(
      env,
      "2026-10-02",
      { lang: "vi", video: "fStNAQhJo3M" },
      null
    );
    expect(await deleteDayVideo(env, "2026-10-02", "vi")).toMatchObject({
      ok: true,
      deleted: true,
    });
    expect(rows.get("2026-10-02")).toMatchObject({
      youtube_id: "B3vKYiV7rOw",
      youtube_id_vi: null,
    });
    expect(await deleteDayVideo(env, "2026-10-02", "vi")).toMatchObject({
      deleted: false,
    });
    expect(await deleteDayVideo(env, "2026-10-02", "en")).toMatchObject({
      deleted: true,
    });
    expect(rows.size).toBe(0);
    expect(await deleteDayVideo(env, "2026-10-02", "xx")).toMatchObject({
      status: 400,
    });
  });
});

describe("sendDayVideoTelegram", () => {
  afterEach(() => vi.unstubAllGlobals());

  const telegramEnv = {
    TELEGRAM_BOT_TOKEN: "tok",
    TELEGRAM_EN_CHAT_ID: "-100en",
    TELEGRAM_VI_CHAT_ID: "-100vi",
  };

  function stubTelegram(
    responses: Array<{ ok: boolean; description?: string; id?: number }>
  ) {
    const calls: Array<{ url: string; body: Record<string, any> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        const r = responses[calls.length - 1] ?? responses.at(-1)!;
        return new Response(
          JSON.stringify(
            r.ok
              ? { ok: true, result: { message_id: r.id ?? 7 } }
              : { ok: false, description: r.description }
          )
        );
      })
    );
    return calls;
  }

  async function seeded() {
    const made = makeEnv(telegramEnv);
    await setDayVideo(
      made.env,
      "2026-10-02",
      { video: "B3vKYiV7rOw", title: "EN <brief>" },
      null
    );
    await setDayVideo(
      made.env,
      "2026-10-02",
      { lang: "vi", video: "fStNAQhJo3M" },
      null
    );
    return made;
  }

  it("sends the thumbnail with caption and buttons to the language's channel", async () => {
    const { env } = await seeded();
    const calls = stubTelegram([{ ok: true, id: 42 }]);
    const result = await sendDayVideoTelegram(env, "2026-10-02", {
      lang: "vi",
    });
    expect(result).toEqual({ ok: true, chat_id: "-100vi", message_id: "42" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/bottok/sendPhoto");
    expect(calls[0].body).toMatchObject({
      chat_id: "-100vi",
      photo: "https://i.ytimg.com/vi/fStNAQhJo3M/maxresdefault.jpg",
      parse_mode: "HTML",
    });
    expect(calls[0].body.caption).toContain("Bản tin AI;DR — 2026-10-02");
    expect(calls[0].body.caption).toContain("https://youtu.be/fStNAQhJo3M");
    const [row] = calls[0].body.reply_markup.inline_keyboard;
    expect(row[0]).toEqual({
      text: "▶ YouTube",
      url: "https://youtu.be/fStNAQhJo3M",
    });
    expect(row[1].url).toMatch(
      /^https:\/\/aidr\.today\/date\/2026-10-02\?.*lang=vi/
    );
  });

  it("uses the English title (escaped), an explicit chat_id and the en id", async () => {
    const { env } = await seeded();
    const calls = stubTelegram([{ ok: true }]);
    const result = await sendDayVideoTelegram(env, "2026-10-02", {
      lang: "en",
      chat_id: "-100staging",
    });
    expect(result).toMatchObject({ ok: true, chat_id: "-100staging" });
    expect(calls[0].body.photo).toContain("/B3vKYiV7rOw/");
    expect(calls[0].body.caption).toContain("EN &lt;brief&gt;");
  });

  it("falls back to sendMessage when sendPhoto is rejected", async () => {
    const { env } = await seeded();
    const calls = stubTelegram([
      { ok: false, description: "Bad Request: wrong file identifier" },
      { ok: true, id: 9 },
    ]);
    const result = await sendDayVideoTelegram(env, "2026-10-02", {
      lang: "en",
    });
    expect(result).toEqual({ ok: true, chat_id: "-100en", message_id: "9" });
    expect(calls.map((c) => c.url.split("/").pop())).toEqual([
      "sendPhoto",
      "sendMessage",
    ]);
    expect(calls[1].body.text).toContain("https://youtu.be/B3vKYiV7rOw");
  });

  it("404s when that language has no video, without calling Telegram", async () => {
    const { env } = makeEnv(telegramEnv);
    await setDayVideo(env, "2026-10-02", { video: "B3vKYiV7rOw" }, null);
    const calls = stubTelegram([{ ok: true }]);
    expect(
      await sendDayVideoTelegram(env, "2026-10-02", { lang: "vi" })
    ).toMatchObject({ status: 404 });
    expect(
      await sendDayVideoTelegram(env, "2026-10-03", { lang: "en" })
    ).toMatchObject({ status: 404 });
    expect(await sendDayVideoTelegram(env, "2026-10-02", {})).toMatchObject({
      status: 400,
    });
    expect(calls).toHaveLength(0);
  });

  it("reports a missing chat or token as 409", async () => {
    const { env } = makeEnv({ TELEGRAM_BOT_TOKEN: "tok" });
    await setDayVideo(env, "2026-10-02", { video: "B3vKYiV7rOw" }, null);
    stubTelegram([{ ok: true }]);
    expect(
      await sendDayVideoTelegram(env, "2026-10-02", { lang: "en" })
    ).toMatchObject({ status: 409 });
  });
});
