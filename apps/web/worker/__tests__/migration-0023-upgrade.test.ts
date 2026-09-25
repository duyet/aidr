import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(dirname, "../../migrations/0023_translation_reviews.sql"),
  "utf8"
);

function createPre0023Database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'published'
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
    VALUES ('item-1', 'OpenAI ships Model X', 'Launch is 2024-05-01.');
    INSERT INTO translations (item_id, lang, title, summary)
    VALUES ('item-1', 'en', 'OpenAI ships Model X', 'Launch is 2024-05-01.');
  `);
  return db;
}

describe("migration 0023 translation QA upgrade", () => {
  it("upgrades a pre-0023 database and preserves legacy rows", () => {
    const db = createPre0023Database();
    try {
      expect(() =>
        db.prepare("SELECT qa_candidate_hash FROM translations LIMIT 1").get()
      ).toThrow();
      db.exec(sql);

      const item = db
        .prepare(
          "SELECT source_lang, source_revision FROM items WHERE id = 'item-1'"
        )
        .get() as { source_lang: string; source_revision: number };
      const translation = db
        .prepare(
          "SELECT source_lang, target_lang, qa_candidate_hash FROM translations WHERE item_id = 'item-1' AND lang = 'en'"
        )
        .get() as {
        source_lang: string;
        target_lang: string;
        qa_candidate_hash: string | null;
      };
      expect(item).toEqual({ source_lang: "en", source_revision: 0 });
      expect(translation).toEqual({
        source_lang: "en",
        target_lang: "en",
        qa_candidate_hash: null,
      });
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'translation_review%' ORDER BY name"
          )
          .all()
      ).toHaveLength(4);
    } finally {
      db.close();
    }
  });

  it("invalidates current state on source and candidate writes", () => {
    const db = createPre0023Database();
    try {
      db.exec(sql);
      db.prepare(
        `INSERT INTO translation_review_state (
          state_id, item_id, lang, source_lang, target_lang, direction,
          source_hash, candidate_hash, source_revision, candidate_title,
          candidate_summary, criteria_fingerprint, prompt_fingerprint,
          policy_fingerprint, decision, attempt_id, attempt_count,
          manual_retry_count, terminal, next_retry_at, lease_token, lease_until,
          created_at, updated_at
        ) VALUES ('state-1', 'item-1', 'en', 'en', 'en', 'vi-en',
          'source-hash', 'candidate-hash', 0,
          'OpenAI ships Model X', 'Launch is 2024-05-01.',
          'criteria', 'prompt', 'policy', 'human_review',
          'attempt-1', 1, 0, 1, NULL, NULL, NULL, 1, 1)`
      ).run();

      db.prepare(
        "UPDATE translations SET title = 'OpenAI did not ship Model X', summary = 'Launch is 2024-05-01.', qa_candidate_hash = NULL, qa_source_hash = NULL, qa_source_revision = NULL, qa_direction = NULL, qa_reviewer_model = NULL, qa_criteria_version = NULL WHERE item_id = 'item-1' AND lang = 'en'"
      ).run();
      expect(
        db
          .prepare(
            "SELECT decision, terminal FROM translation_review_state WHERE state_id = 'state-1'"
          )
          .get()
      ).toEqual({ decision: "pending", terminal: 0 });

      db.prepare(
        `INSERT INTO translation_review_state (
          state_id, item_id, lang, source_lang, target_lang, direction,
          source_hash, candidate_hash, source_revision, candidate_title,
          candidate_summary, criteria_fingerprint, prompt_fingerprint,
          policy_fingerprint, decision, attempt_id, attempt_count,
          manual_retry_count, terminal, next_retry_at, lease_token, lease_until,
          created_at, updated_at
        ) VALUES ('state-2', 'item-1', 'en', 'en', 'en', 'vi-en',
          'source-hash-2', 'candidate-hash-old', 0,
          'OpenAI ships Model X', 'Launch is 2024-05-01.',
          'criteria', 'prompt', 'policy', 'pending', NULL, 1,
          0, 0, NULL, 'lease-2', 999, 1, 1)`
      ).run();
      db.prepare(
        `UPDATE translations SET title = 'Repaired candidate', summary = 'Repaired summary.',
          qa_candidate_hash = 'candidate-hash-new'
         WHERE item_id = 'item-1' AND lang = 'en'`
      ).run();
      expect(
        db
          .prepare(
            "SELECT lease_token FROM translation_review_state WHERE state_id = 'state-2'"
          )
          .get()
      ).toEqual({ lease_token: "lease-2" });

      db.prepare(
        "UPDATE items SET summary = 'Launch is 2024-05-02.' WHERE id = 'item-1'"
      ).run();
      const item = db
        .prepare("SELECT source_revision FROM items WHERE id = 'item-1'")
        .get() as { source_revision: number };
      expect(item.source_revision).toBe(1);
    } finally {
      db.close();
    }
  });

  it("keeps attempts/resolutions append-only and idempotent", () => {
    const db = createPre0023Database();
    try {
      db.exec(sql);
      const insertAttempt = db.prepare(
        `INSERT OR IGNORE INTO translation_review_attempts (
          attempt_id, state_id, item_id, lang, source_lang, target_lang, direction,
          source_hash, candidate_hash, source_revision, attempt_number, round, phase,
          criteria_fingerprint, prompt_fingerprint, policy_fingerprint, model_fingerprint,
          decision, reason, reviewer_chain, created_at
        ) VALUES (?, 'state-1', 'item-1', 'en', 'en', 'en', 'vi-en',
          'source-hash', 'candidate-hash', 0, 1, 1, 'initial',
          'criteria', 'prompt', 'policy', 'model', 'accepted', 'ok', 'reviewer/model', 1)`
      );
      insertAttempt.run("attempt-1");
      insertAttempt.run("attempt-1");
      expect(
        db
          .prepare("SELECT COUNT(*) AS count FROM translation_review_attempts")
          .get()
      ).toEqual({ count: 1 });
      expect(() =>
        db
          .prepare(
            "UPDATE translation_review_attempts SET reason = 'changed' WHERE attempt_id = 'attempt-1'"
          )
          .run()
      ).toThrow(/immutable/);
      expect(() =>
        db
          .prepare(
            "DELETE FROM translation_review_attempts WHERE attempt_id = 'attempt-1'"
          )
          .run()
      ).toThrow(/immutable/);

      db.prepare(
        `INSERT INTO translation_review_resolutions (
          resolution_id, attempt_id, state_id, item_id, source_hash, candidate_hash,
          action, actor, note, created_at
        ) VALUES ('resolution-1', 'attempt-1', 'state-1', 'item-1',
          'source-hash', 'candidate-hash', 'retry', 'admin-token', 'check source', 1)`
      ).run();
      expect(() =>
        db
          .prepare(
            "UPDATE translation_review_resolutions SET note = 'changed' WHERE resolution_id = 'resolution-1'"
          )
          .run()
      ).toThrow(/immutable/);
    } finally {
      db.close();
    }
  });
});
