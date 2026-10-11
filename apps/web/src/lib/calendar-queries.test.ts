import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { getCalendarMonth } from "./calendar-queries";
import type { DbReader } from "./db";

/** UTC+7 audience day: 17:00 UTC the day before is already the next day. */
const at = (iso: string) => Date.parse(iso) / 1000;

let sqlite: DatabaseSync;
let seq = 0;

function add(
  published: string,
  rank: number,
  extra: {
    title?: string;
    vi?: string | null;
    category?: string | null;
    status?: string;
  } = {}
) {
  const id = `i${++seq}`;
  sqlite
    .prepare(
      "INSERT INTO items (id, title, image_url, tags, category, published_at, status, rank_score) VALUES (?, ?, NULL, '[]', ?, ?, ?, ?)"
    )
    .run(
      id,
      extra.title ?? `Story ${id}`,
      extra.category === undefined ? "Models" : extra.category,
      at(published),
      extra.status ?? "published",
      rank
    );
  if (extra.vi !== undefined && extra.vi !== null) {
    sqlite
      .prepare(
        "INSERT INTO translations (item_id, lang, title) VALUES (?, 'vi', ?)"
      )
      .run(id, extra.vi);
  }
}

function d1(): DbReader {
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => {
        args = a;
        return stmt;
      },
      all: async () => ({
        results: sqlite.prepare(sql).all(...(args as never[])),
      }),
    };
    return stmt;
  };
  return {
    prepare,
    batch: async (stmts: { all: () => Promise<unknown> }[]) =>
      Promise.all(stmts.map((s) => s.all())),
  } as unknown as DbReader;
}

beforeEach(() => {
  seq = 0;
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT, image_url TEXT,
      tags TEXT, category TEXT, published_at INTEGER, status TEXT, rank_score REAL);
    CREATE TABLE translations (item_id TEXT, lang TEXT, title TEXT);`);
});

describe("getCalendarMonth", () => {
  it("returns the lead plus the next two stories by rank as runner-ups", async () => {
    add("2026-10-11T03:00:00Z", 1, { title: "Fourth" });
    add("2026-10-11T04:00:00Z", 9, { title: "Lead" });
    add("2026-10-11T05:00:00Z", 5, { title: "Second" });
    add("2026-10-11T06:00:00Z", 3, { title: "Third" });
    const cal = await getCalendarMonth(d1(), "2026-10", "2026-10");
    const [day] = cal.days;
    expect(day.title).toBe("Lead");
    expect(day.count).toBe(4);
    expect(day.runners.map((r) => r.title)).toEqual(["Second", "Third"]);
  });

  it("leaves a runner-up's Vietnamese title null instead of borrowing English", async () => {
    add("2026-10-11T03:00:00Z", 9, { title: "Lead", vi: "Dẫn đầu" });
    add("2026-10-11T04:00:00Z", 5, { title: "Second", vi: "   " });
    add("2026-10-11T05:00:00Z", 3, { title: "Third", vi: "Thứ ba" });
    const [day] = (await getCalendarMonth(d1(), "2026-10", "2026-10")).days;
    expect(day.title_vi).toBe("Dẫn đầu");
    expect(day.runners).toEqual([
      { title: "Second", title_vi: null },
      { title: "Third", title_vi: "Thứ ba" },
    ]);
  });

  it("keeps a single-story day free of runner-ups", async () => {
    add("2026-10-11T03:00:00Z", 9);
    const [day] = (await getCalendarMonth(d1(), "2026-10", "2026-10")).days;
    expect(day.runners).toEqual([]);
  });

  it("lists the three most common categories, ties broken by name", async () => {
    for (const c of [
      "Models",
      "Models",
      "Models",
      "Tools",
      "Tools",
      "Policy",
      "Safety",
      "Agents",
    ]) {
      add("2026-10-11T03:00:00Z", 1, { category: c });
    }
    add("2026-10-11T03:00:00Z", 1, { category: null });
    add("2026-10-11T03:00:00Z", 1, { category: "" });
    const [day] = (await getCalendarMonth(d1(), "2026-10", "2026-10")).days;
    expect(day.categories).toEqual(["Models", "Tools", "Agents"]);
    expect(day.count).toBe(10);
  });

  it("groups by audience day and ignores unpublished or other-month items", async () => {
    add("2026-10-10T16:59:00Z", 1, { category: "Models" });
    add("2026-10-10T17:00:00Z", 1, { category: "Tools" });
    add("2026-10-11T03:00:00Z", 1, { status: "new", category: "Policy" });
    add("2026-09-20T03:00:00Z", 1);
    const cal = await getCalendarMonth(d1(), "2026-10", "2026-10");
    expect(cal.days.map((d) => [d.date, d.categories])).toEqual([
      ["2026-10-10", ["Models"]],
      ["2026-10-11", ["Tools"]],
    ]);
    expect(cal.firstMonth).toBe("2026-09");
  });

  it("bounds the payload to three stories and three categories per day", async () => {
    for (let i = 0; i < 40; i++) {
      add("2026-10-11T03:00:00Z", i, { category: `Cat ${i % 7}` });
    }
    const [day] = (await getCalendarMonth(d1(), "2026-10", "2026-10")).days;
    expect(day.runners).toHaveLength(2);
    expect(day.categories).toHaveLength(3);
    expect(day.count).toBe(40);
  });
});
