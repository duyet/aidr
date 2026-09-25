import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ratePendingTranslations } from "../translation-qa.js";
import {
  listTranslationReviewQueue,
  resolveTranslationReview,
} from "../translation-review-queue.js";
import type { Env } from "../types.js";

const migration = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../migrations/0023_translation_reviews.sql"
  ),
  "utf8"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

function sqliteInput(value: unknown): SqliteInput {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  ) {
    return value as SqliteInput;
  }
  throw new TypeError("unsupported SQLite bind value");
}

class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next.map(sqliteInput);
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
      status TEXT NOT NULL DEFAULT 'published',
      published_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE translations (
      item_id TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'vi',
      title TEXT,
      summary TEXT,
      qa_rating REAL,
      qa_at INTEGER,
      PRIMARY KEY (item_id, lang)
    );
    INSERT INTO items (id, title, summary)
    VALUES ('item-1', 'OpenAI ships Model X', 'The launch is 2024-05-01.');
    INSERT INTO translations (item_id, lang, title, summary)
    VALUES ('item-1', 'vi', 'OpenAI ra mắt Model X', 'Ngày là 2024-05-01.');
  `);
  sqlite.exec(migration);
  return { db: new SqliteD1(sqlite), close: () => sqlite.close() };
}

function makeEnv(db: SqliteD1): Env {
  return {
    DB: db as unknown as D1Database,
    NEWS_INGEST: {} as Workflow,
    ANYROUTER_BASE_URL: "https://anyrouter.test/v1",
    ANYROUTER_MODEL: "generator/model",
    ANYROUTER_TRANSLATE_MODEL: "generator/model",
    ANYROUTER_REVIEW_MODEL: "reviewer/model",
    ANYROUTER_API_KEY: "test-key",
    NEWS_ADMIN_TOKEN: "test-token",
  };
}

function malformedReviewResponse(): Response {
  return new Response(
    'data: {"choices":[{"delta":{"content":"not-json"}}]}\n\ndata: [DONE]\n\n'
  );
}

describe("translation QA cross-run retry state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("caps automatic attempts and permits exactly one authenticated retry", async () => {
    const { db, close } = makeDatabase();
    try {
      const env = makeEnv(db);
      const fetchMock = vi.fn(async () => malformedReviewResponse());
      vi.stubGlobal("fetch", fetchMock);

      for (let run = 0; run < 3; run++) {
        db.prepare(
          "UPDATE translation_review_state SET next_retry_at = 0"
        ).run();
        const stats = await ratePendingTranslations(env);
        expect(stats.calls).toBe(1);
      }
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(
        await db
          .prepare(
            "SELECT decision, terminal, attempt_count, manual_retry_count FROM translation_review_state"
          )
          .first()
      ).toMatchObject({
        decision: "human_review",
        terminal: 1,
        attempt_count: 3,
        manual_retry_count: 0,
      });

      const fourth = await ratePendingTranslations(env);
      expect(fourth.calls).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const queue = await listTranslationReviewQueue(env);
      expect(queue[0]?.can_retry).toBe(true);
      const resolution = await resolveTranslationReview(env, {
        attemptId: queue[0]!.attempt_id,
        action: "retry",
        actor: "admin-token",
        note: "Checked the source and requested one retry.",
      });
      expect(resolution).toMatchObject({ ok: true, action: "retry" });

      db.prepare("UPDATE translation_review_state SET next_retry_at = 0").run();
      expect((await ratePendingTranslations(env)).calls).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(
        await db
          .prepare(
            "SELECT decision, terminal, attempt_count, manual_retry_count FROM translation_review_state"
          )
          .first()
      ).toMatchObject({
        decision: "human_review",
        terminal: 1,
        attempt_count: 4,
        manual_retry_count: 1,
      });

      const exhaustedQueue = await listTranslationReviewQueue(env);
      expect(exhaustedQueue[0]?.can_retry).toBe(false);
      expect(
        await resolveTranslationReview(env, {
          attemptId: exhaustedQueue[0]!.attempt_id,
          action: "retry",
          actor: "admin-token",
          note: "This retry must be rejected.",
        })
      ).toMatchObject({ ok: false, status: 409 });
    } finally {
      close();
    }
  });

  it("stores the final re-review attempt as current repaired provenance", async () => {
    const { db, close } = makeDatabase();
    try {
      const env = makeEnv(db);
      db.prepare(
        "UPDATE items SET title = 'A catalog entry for Model X', summary = 'Release date 2024-05-01.' WHERE id = 'item-1'"
      ).run();
      db.prepare(
        "UPDATE translations SET title = 'A catalog entry for Model Y', summary = 'Release date 2024-05-01.' WHERE item_id = 'item-1' AND lang = 'vi'"
      ).run();
      const review = (verdict: "repair" | "accept") =>
        JSON.stringify({
          schema_version: 2,
          direction: "en-vi",
          verdict,
          fidelity: 0.95,
          naturalness: 0.9,
          confidence: 0.9,
          checks: {
            entities: "pass",
            numbers: "pass",
            dates: "pass",
            units: "pass",
            polarity: "pass",
            uncertainty: "pass",
            omission: "pass",
            addition: "pass",
            terminology: "pass",
          },
          reason:
            verdict === "repair" ? "needs repair" : "faithful and natural",
        });
      let call = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          call++;
          const content =
            call === 1
              ? review("repair")
              : call === 2
                ? JSON.stringify({
                    title: "A catalog entry for Model X",
                    summary: "Release date 2024-05-01.",
                  })
                : review("accept");
          return new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`
          );
        })
      );

      const stats = await ratePendingTranslations(env);
      expect(stats.adjusted).toBe(1);
      expect(stats.accepted).toBe(1);
      expect(call).toBe(3);

      const state = (await db
        .prepare(
          `SELECT attempt_id, candidate_hash, candidate_title
             FROM translation_review_state WHERE item_id = 'item-1'`
        )
        .first()) as {
        attempt_id: string;
        candidate_hash: string;
        candidate_title: string;
      };
      const finalAttempt = (await db
        .prepare(
          `SELECT attempt_id, phase, decision, candidate_hash
             FROM translation_review_attempts
            WHERE attempt_id = ?`
        )
        .bind(state.attempt_id)
        .first()) as {
        attempt_id: string;
        phase: string;
        decision: string;
        candidate_hash: string;
      };
      expect(finalAttempt).toMatchObject({
        phase: "re_review",
        decision: "accepted",
        candidate_hash: state.candidate_hash,
      });
      expect(state.candidate_title).toBe("A catalog entry for Model X");
      expect(
        await db
          .prepare(
            "SELECT qa_candidate_hash FROM translations WHERE item_id = 'item-1' AND lang = 'vi'"
          )
          .first()
      ).toEqual({ qa_candidate_hash: state.candidate_hash });
    } finally {
      close();
    }
  });
});
