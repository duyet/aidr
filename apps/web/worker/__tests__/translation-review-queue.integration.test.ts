import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveTranslationReview } from "../translation-review-queue.js";
import type { Env } from "../types.js";

const migration = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../migrations/0023_translation_reviews.sql"
  ),
  "utf8"
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
        return {
          success: true,
          meta: { changes: Number(result.changes) },
        };
      },
    };
    return prepared;
  }

  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    const results: unknown[] = [];
    for (const statement of statements) results.push(await statement.run());
    return results as Array<{ meta: { changes: number } }>;
  }
}

function makeDatabase(): { db: SqliteD1; close: () => void } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'published'
    );
    CREATE TABLE translations (
      item_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      qa_rating REAL,
      qa_at INTEGER,
      PRIMARY KEY (item_id, lang)
    );
    INSERT INTO items (id, title, summary)
    VALUES ('item-1', 'OpenAI may ship Model X', 'The date is 2024-05-01.');
    INSERT INTO translations (item_id, lang, title, summary)
    VALUES ('item-1', 'vi', 'OpenAI có thể ra mắt Model X', 'Ngày là 2024-05-01.');
  `);
  sqlite.exec(migration);
  sqlite.exec(`
    INSERT INTO translation_review_state (
      state_id, item_id, lang, source_lang, target_lang, direction,
      source_hash, candidate_hash, source_revision, candidate_title,
      candidate_summary, criteria_fingerprint, prompt_fingerprint,
      policy_fingerprint, decision, attempt_id, attempt_count,
      manual_retry_count, terminal, next_retry_at, lease_token, lease_until,
      created_at, updated_at
    ) VALUES (
      'state-1', 'item-1', 'vi', 'en', 'vi', 'en-vi',
      'source-hash', 'candidate-hash', 0,
      'OpenAI có thể ra mắt Model X', 'Ngày là 2024-05-01.',
      'criteria', 'prompt', 'policy', 'human_review', 'attempt-1', 1,
      0, 1, NULL, NULL, NULL, 1, 1
    );
  `);
  return { db: new SqliteD1(sqlite), close: () => sqlite.close() };
}

function env(db: SqliteD1): Env {
  return {
    DB: db as unknown as D1Database,
    NEWS_INGEST: {} as Workflow,
    ANYROUTER_BASE_URL: "https://anyrouter.test/v1",
    ANYROUTER_MODEL: "test-model",
    ANYROUTER_API_KEY: "test-key",
    NEWS_ADMIN_TOKEN: "test-token",
  };
}

describe("translation review queue SQLite CAS", () => {
  it("accepts a human decision with a marker and append-only audit", async () => {
    const { db, close } = makeDatabase();
    try {
      const result = await resolveTranslationReview(env(db), {
        attemptId: "attempt-1",
        action: "accept_original",
        actor: "admin-token",
        note: "Checked against the source article.",
      });
      expect(result).toEqual({
        ok: true,
        stateId: "state-1",
        action: "accept_original",
      });
      const marker = (await db
        .prepare(
          "SELECT qa_candidate_hash, qa_reviewer_model FROM translations WHERE item_id = 'item-1' AND lang = 'vi'"
        )
        .first()) as { qa_candidate_hash: string; qa_reviewer_model: string };
      expect(marker).toEqual({
        qa_candidate_hash: "candidate-hash",
        qa_reviewer_model: "human:admin-token",
      });
      expect(
        await db
          .prepare(
            "SELECT decision, terminal FROM translation_review_state WHERE state_id = 'state-1'"
          )
          .first()
      ).toEqual({ decision: "human_accepted", terminal: 1 });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM translation_review_resolutions"
          )
          .first()
      ).toEqual({ count: 1 });
    } finally {
      close();
    }
  });

  it("requeues exactly one human retry and records it append-only", async () => {
    const { db, close } = makeDatabase();
    try {
      const result = await resolveTranslationReview(env(db), {
        attemptId: "attempt-1",
        action: "retry",
        actor: "admin-token",
        note: "Re-run after checking the source.",
      });
      expect(result).toEqual({
        ok: true,
        stateId: "state-1",
        action: "retry",
      });
      expect(
        await db
          .prepare(
            "SELECT decision, terminal, manual_retry_count, next_retry_at FROM translation_review_state WHERE state_id = 'state-1'"
          )
          .first()
      ).toMatchObject({
        decision: "retry_requested",
        terminal: 0,
        manual_retry_count: 1,
      });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM translation_review_resolutions WHERE action = 'retry'"
          )
          .first()
      ).toEqual({ count: 1 });
      const second = await resolveTranslationReview(env(db), {
        attemptId: "attempt-1",
        action: "retry",
        actor: "admin-token",
        note: "A second retry must not bypass the cap.",
      });
      expect(second).toMatchObject({ ok: false, status: 404 });
    } finally {
      close();
    }
  });
  it("rejects a stale candidate instead of resolving the current translation", async () => {
    const { db, close } = makeDatabase();
    try {
      db.prepare(
        "UPDATE translations SET title = 'A different candidate' WHERE item_id = 'item-1' AND lang = 'vi'"
      ).run();
      const result = await resolveTranslationReview(env(db), {
        attemptId: "attempt-1",
        action: "retry",
        actor: "admin-token",
        note: "Check the updated source.",
      });
      expect(result).toEqual({
        ok: false,
        error: "review is not an open human-review item",
        status: 404,
      });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM translation_review_resolutions"
          )
          .first()
      ).toEqual({ count: 0 });
    } finally {
      close();
    }
  });
});
