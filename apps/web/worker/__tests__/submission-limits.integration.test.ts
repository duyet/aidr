import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOgData } from "../enrich.js";
import {
  MAX_NOTE_LENGTH,
  MAX_PENDING_SUBMISSIONS_PER_USER,
  MAX_REVIEW_ATTEMPTS,
  MAX_SUBMISSIONS_PER_IP_PER_DAY,
  reviewPendingSubmissions,
  submitStory,
} from "../submissions.js";
import { MAX_PENDING_PER_USER, submitSuggestion } from "../suggestions.js";
import type { Env } from "../types.js";

vi.mock("../enrich.js", async (orig) => ({
  ...(await orig<typeof import("../enrich.js")>()),
  fetchOgData: vi.fn(async () => {
    throw new Error("og fetch failed");
  }),
}));

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

function toSqliteInput(value: unknown): SqliteInput {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  ) {
    return value as SqliteInput;
  }
  throw new TypeError("Unsupported SQLite bind value");
}

class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next.map(toSqliteInput);
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

function freshDb(): { raw: DatabaseSync; d1: D1Database } {
  const raw = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationsDir).sort()) {
    if (file.endsWith(".sql")) {
      raw.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    }
  }
  raw
    .prepare(
      `INSERT INTO items (id, source_id, external_id, url, title, summary, published_at, fetched_at, status, source_lang)
       VALUES ('item1', 'hn', 'x1', 'https://example.com/a', 'A published story', 'Summary.', 0, 0, 'published', 'en')`
    )
    .run();
  return { raw, d1: new SqliteD1(raw) as unknown as D1Database };
}

function countRows(raw: DatabaseSync, table: string): number {
  const row = raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  };
  return row.n;
}

const story = (n: number) => ({
  url: `https://example.com/story-${n}`,
  title: "A fine title here",
});

describe("submitStory note cap", () => {
  it("rejects a note over the cap without writing a row", async () => {
    const { raw, d1 } = freshDb();
    const result = await submitStory(d1, {
      ...story(1),
      note: "x".repeat(MAX_NOTE_LENGTH + 1),
      userId: "user1",
    });
    expect(result.ok).toBe(false);
    expect(countRows(raw, "submissions")).toBe(0);
  });

  it("accepts a note exactly at the cap", async () => {
    const { raw, d1 } = freshDb();
    const result = await submitStory(d1, {
      ...story(1),
      note: "x".repeat(MAX_NOTE_LENGTH),
      userId: "user1",
    });
    expect(result.ok).toBe(true);
    expect(countRows(raw, "submissions")).toBe(1);
  });
});

describe("submission limits under parallel requests", () => {
  it("never lets one user hold more than the pending cap", async () => {
    const { raw, d1 } = freshDb();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        submitStory(d1, { ...story(i), userId: "user1" })
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(
      MAX_PENDING_SUBMISSIONS_PER_USER
    );
    expect(countRows(raw, "submissions")).toBe(
      MAX_PENDING_SUBMISSIONS_PER_USER
    );
    const refused = results.find((r) => !r.ok);
    expect(refused && !refused.ok && refused.error).toMatch(
      /pending|đang chờ/i
    );
  });

  it("never lets one IP exceed the daily cap across users", async () => {
    const { raw, d1 } = freshDb();
    const total = MAX_SUBMISSIONS_PER_IP_PER_DAY + 8;
    const results = await Promise.all(
      Array.from({ length: total }, (_, i) =>
        submitStory(d1, {
          ...story(i),
          userId: `user${i}`,
          ip: "203.0.113.9",
        })
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(
      MAX_SUBMISSIONS_PER_IP_PER_DAY
    );
    expect(countRows(raw, "submissions")).toBe(MAX_SUBMISSIONS_PER_IP_PER_DAY);
    const refused = results.find((r) => !r.ok);
    expect(refused && !refused.ok && refused.error).toMatch(
      /network|mạng này/i
    );
  });

  it("reports a racing duplicate URL as already submitted", async () => {
    const { raw, d1 } = freshDb();
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        submitStory(d1, { ...story(1), userId: `user${i}` })
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(countRows(raw, "submissions")).toBe(1);
    const refused = results.filter((r) => !r.ok);
    expect(refused.every((r) => !r.ok && /already/.test(r.error))).toBe(true);
  });

  it("never lets one user hold more than the pending suggestion cap", async () => {
    const { raw, d1 } = freshDb();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        submitSuggestion(d1, {
          itemId: "item1",
          field: "title",
          suggestion: `A fine suggestion ${i}`,
          userId: "user1",
        })
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_PENDING_PER_USER);
    expect(countRows(raw, "translation_suggestions")).toBe(
      MAX_PENDING_PER_USER
    );
  });
});

describe("reviewPendingSubmissions with a row that keeps failing", () => {
  const env = (d1: D1Database) => ({ DB: d1 }) as unknown as Env;

  beforeEach(() => {
    vi.mocked(fetchOgData).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("counts each failed review and leaves the row pending", async () => {
    const { raw, d1 } = freshDb();
    await submitStory(d1, { ...story(1), userId: "user1" });
    await reviewPendingSubmissions(env(d1), 10);
    const row = raw
      .prepare("SELECT status, review_attempts FROM submissions")
      .get() as { status: string; review_attempts: number };
    expect(row).toEqual({ status: "pending", review_attempts: 1 });
  });

  it("stops selecting a row after the attempt cap so later rows reach review", async () => {
    const { raw, d1 } = freshDb();
    await submitStory(d1, { ...story(1), userId: "user1" });
    raw
      .prepare(
        "UPDATE submissions SET created_at = 1 WHERE url LIKE '%story-1'"
      )
      .run();
    raw
      .prepare("UPDATE submissions SET review_attempts = ?")
      .run(MAX_REVIEW_ATTEMPTS);
    await submitStory(d1, { ...story(2), userId: "user2" });

    await reviewPendingSubmissions(env(d1), 1);

    const reviewed = vi.mocked(fetchOgData).mock.calls.map(([url]) => url);
    expect(reviewed).toEqual([story(2).url]);
  });

  it("reviews rows with fewer failures before older rows that keep failing", async () => {
    const { raw, d1 } = freshDb();
    await submitStory(d1, { ...story(1), userId: "user1" });
    raw
      .prepare("UPDATE submissions SET created_at = 1, review_attempts = 2")
      .run();
    await submitStory(d1, { ...story(2), userId: "user2" });

    await reviewPendingSubmissions(env(d1), 1);

    const reviewed = vi.mocked(fetchOgData).mock.calls.map(([url]) => url);
    expect(reviewed).toEqual([story(2).url]);
  });
});
