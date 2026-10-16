import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { Route } from "../../src/routes/api/extension";
import { parseExtensionEvent, recordExtensionEvent } from "../ext-events";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("../../migrations/0068_ext_events.sql", import.meta.url),
      "utf8"
    )
  );
  const db = {
    prepare: (sql: string) => ({
      all: async () => ({ results: sqlite.prepare(sql).all() }),
      bind: (...args: any[]) => ({
        run: async () => {
          sqlite.prepare(sql).run(...args);
          return {};
        },
      }),
    }),
  } as unknown as D1Database;
  const rows = () =>
    sqlite
      .prepare("SELECT day, event, key, count FROM ext_events ORDER BY event")
      .all();
  return { db, rows };
}

const send = (db: D1Database, content: string | null, ua = BROWSER) =>
  recordExtensionEvent({
    ua,
    ip: "203.0.113.7",
    limiter: undefined,
    content,
    db,
    day: "2026-10-16",
  });

describe("parseExtensionEvent", () => {
  it.each([
    ["page_view", { event: "page_view", key: "" }],
    ["lang_change_vi", { event: "lang_change", key: "vi" }],
    ["prefs_change_trending_off", { event: "prefs_change", key: "" }],
    [
      "channel_click_telegram_httpst.meaidr",
      { event: "channel_click", key: "telegram" },
    ],
    ["channel_click_chrome", { event: "channel_click", key: "chrome" }],
  ])("accepts %s", (content, expected) => {
    expect(parseExtensionEvent(content)).toEqual(expected);
  });

  it.each([
    "bogus",
    "page_viewx",
    "page_view_extra",
    "lang_change_fr",
    "lang_change",
    "prefs_change_colour_on",
    "prefs_change_tldr_maybe",
    "channel_click_myspace_x",
    "channel_click_chrome_a b",
    "",
  ])("drops %s", (content) => {
    expect(parseExtensionEvent(content)).toBeNull();
  });
});

describe("recordExtensionEvent", () => {
  it("increments a valid event (defect: events never reach D1)", async () => {
    const { db, rows } = makeDb();
    await send(db, "channel_click_telegram_x");
    await send(db, "channel_click_telegram_y");
    await send(db, "page_view");
    expect(rows()).toEqual([
      { day: "2026-10-16", event: "channel_click", key: "telegram", count: 2 },
      { day: "2026-10-16", event: "page_view", key: "", count: 1 },
    ]);
  });

  it("drops an unknown event or param (defect: free text reaches the table)", async () => {
    const { db, rows } = makeDb();
    await send(db, "evil_event");
    await send(db, "lang_change_<script>");
    await send(db, null);
    expect(rows()).toEqual([]);
  });

  it("drops a bot user agent (defect: crawlers inflate opens)", async () => {
    const { db, rows } = makeDb();
    await send(db, "page_view", "Googlebot/2.1");
    await send(db, "page_view", "");
    expect(rows()).toEqual([]);
  });

  it("drops a repeat past the per-IP limiter and an IP-less request", async () => {
    const { db, rows } = makeDb();
    const limit = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    const base = {
      ua: BROWSER,
      limiter: { limit } as unknown as RateLimit,
      content: "page_view",
      db,
      day: "2026-10-16",
    };
    await recordExtensionEvent({ ...base, ip: "203.0.113.7" });
    await recordExtensionEvent({ ...base, ip: "203.0.113.7" });
    await recordExtensionEvent({ ...base, ip: null });
    expect(rows()).toEqual([
      { day: "2026-10-16", event: "page_view", key: "", count: 1 },
    ]);
  });

  // Keyed on the raw content, a different `to` slug or a trailing "_" got its
  // own allowance, so one IP could inflate channel_click without limit.
  it("keys the limiter on the parsed event, not the raw query", async () => {
    const { db } = makeDb();
    const limit = vi.fn().mockResolvedValue({ success: true });
    const base = {
      ua: BROWSER,
      ip: "203.0.113.7",
      limiter: { limit } as unknown as RateLimit,
      db,
      day: "2026-10-16",
    };
    await recordExtensionEvent({
      ...base,
      content: "channel_click_telegram_a",
    });
    await recordExtensionEvent({
      ...base,
      content: "channel_click_telegram_b",
    });
    const keys = limit.mock.calls.map(([arg]) => (arg as { key: string }).key);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("ext|203.0.113.7|channel_click|telegram");
  });

  it("does not throw when the write fails (defect: a D1 error turned the route into a 500)", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error("no such table: ext_events");
          },
        }),
      }),
    } as unknown as D1Database;
    await expect(
      recordExtensionEvent({
        ua: BROWSER,
        ip: null,
        limiter: undefined,
        content: "page_view",
        db,
        day: "2026-10-16",
      })
    ).resolves.toBeUndefined();
  });
});

describe("GET /api/extension", () => {
  const get = (
    Route.options.server as unknown as {
      handlers: { GET: (a: unknown) => Promise<Response> };
    }
  ).handlers.GET;

  it("answers identically whether or not an event is counted (defect: the counter changes the response)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 }))
    );
    const { db, rows } = makeDb();
    const ask = async (qs: string, context: unknown) => {
      const res = await get({
        request: new Request(`https://aidr.today/api/extension${qs}`, {
          headers: { "User-Agent": BROWSER },
        }),
        context,
      });
      return {
        status: res.status,
        body: await res.text(),
        headers: [...res.headers].sort(),
      };
    };
    const counted = await ask("?utm_content=page_view", {
      cloudflare: { env: { DB: db } },
    });
    const plain = await ask("", {});
    expect(counted).toEqual(plain);
    expect(rows()).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
