import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(dirname, "../../migrations/0023_translation_reviews.sql"),
  "utf-8"
);

describe("migration 0023_translation_reviews", () => {
  it("adds current-candidate provenance columns to translations", () => {
    expect(sql).toContain("ADD COLUMN qa_source_hash TEXT");
    expect(sql).toContain("ADD COLUMN qa_candidate_hash TEXT");
    expect(sql).toContain("ADD COLUMN qa_direction TEXT");
    expect(sql).toContain("ADD COLUMN qa_reviewer_model TEXT");
    expect(sql).toContain("ADD COLUMN qa_criteria_version TEXT");
  });

  it("stores direction, hashes, model identity, criteria, and auditable decisions", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS translation_reviews");
    expect(sql).toContain("direction IN ('en-vi', 'vi-en')");
    expect(sql).toContain("source_hash TEXT NOT NULL");
    expect(sql).toContain("candidate_hash TEXT NOT NULL");
    expect(sql).toContain("reviewer_chain TEXT NOT NULL");
    expect(sql).toContain("reviewer_model TEXT");
    expect(sql).toContain("repair_model TEXT");
    expect(sql).toContain("criteria_version TEXT NOT NULL");
    expect(sql).toContain("attempt_count INTEGER NOT NULL DEFAULT 1");
    expect(sql).toContain(
      "'accepted', 'repaired', 'human_review', 'review_failed'"
    );
  });

  it("contains the complete state, CAS, and human-resolution contract", () => {
    expect(sql).toContain("ALTER TABLE items ADD COLUMN source_lang");
    expect(sql).toContain("ALTER TABLE items ADD COLUMN source_revision");
    expect(sql).toContain("candidate_title TEXT NOT NULL");
    expect(sql).toContain("criteria_fingerprint TEXT NOT NULL");
    expect(sql).toContain("manual_retry_count INTEGER NOT NULL");
    expect(sql).toContain("trg_translations_candidate_invalidation");
    expect(sql).toContain("trg_translation_reviews_immutable_update");
    expect(sql).toContain("trg_translation_reviews_immutable_delete");
    expect(sql).toContain("translation_review_resolutions");
    expect(sql).toContain(
      "trg_translation_review_resolutions_immutable_update"
    );
  });

  it("makes each source/candidate/direction review idempotent and queryable", () => {
    expect(sql).toContain(
      "PRIMARY KEY (\n    item_id, lang, direction, source_revision, source_hash, candidate_hash\n  )"
    );
    expect(sql).toContain("idx_translation_reviews_item_updated");
    expect(sql).toContain(
      "source_hash, candidate_hash, source_revision, attempt_number, round, phase"
    );
    expect(sql).toContain(
      "source_hash, candidate_hash, source_revision,\n    criteria_fingerprint"
    );
  });

  it("clears every current marker from the direct candidate invalidation trigger", () => {
    expect(sql).toContain("trg_translations_candidate_invalidation");
    expect(sql).toContain("trg_translations_marker_invalidation");
    expect(sql).toContain("qa_reviewer_model = NULL");
    expect(sql).toContain("qa_criteria_version = NULL");
  });
});
