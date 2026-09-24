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

  it("makes each source/candidate/direction review idempotent and queryable", () => {
    expect(sql).toContain(
      "PRIMARY KEY (item_id, lang, direction, source_hash, candidate_hash)"
    );
    expect(sql).toContain("idx_translation_reviews_item_updated");
  });
});
