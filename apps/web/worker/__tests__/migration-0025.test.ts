import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(dirname, "../../migrations/0025_translation_review_hardening.sql"),
  "utf-8"
);

describe("migration 0025_translation_review_hardening", () => {
  it("adds explicit source/target metadata and source revision CAS columns", () => {
    expect(sql).toContain("ALTER TABLE items ADD COLUMN source_lang");
    expect(sql).toContain("ALTER TABLE items ADD COLUMN source_revision");
    expect(sql).toContain("ALTER TABLE translations ADD COLUMN source_lang");
    expect(sql).toContain("ALTER TABLE translations ADD COLUMN target_lang");
    expect(sql).toContain(
      "ALTER TABLE translations ADD COLUMN qa_source_revision"
    );
  });

  it("separates immutable attempts from leased current state and resolutions", () => {
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS translation_review_attempts"
    );
    expect(sql).toContain("criteria_fingerprint TEXT NOT NULL");
    expect(sql).toContain("prompt_fingerprint TEXT NOT NULL");
    expect(sql).toContain("policy_fingerprint TEXT NOT NULL");
    expect(sql).toContain("model_fingerprint TEXT NOT NULL");
    expect(sql).toContain("attempt_number INTEGER NOT NULL");
    expect(sql).toContain("trg_translation_review_attempts_immutable_update");
    expect(sql).toContain("trg_translation_review_attempts_immutable_delete");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS translation_review_state"
    );
    expect(sql).toContain("lease_token TEXT");
    expect(sql).toContain("next_retry_at INTEGER");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS translation_review_resolutions"
    );
    expect(sql).toContain(
      "trg_translation_review_resolutions_immutable_update"
    );
    expect(sql).toContain(
      "trg_translation_review_resolutions_immutable_delete"
    );
    expect(sql).toContain("actor TEXT NOT NULL");
    expect(sql).toContain("note TEXT NOT NULL");
  });

  it("invalidates every direction and increments revision on source writes", () => {
    expect(sql).toContain(
      "AFTER UPDATE OF title, summary, source_lang ON items"
    );
    expect(sql).toContain("source_revision = source_revision + 1");
    expect(sql).toContain("UPDATE translations");
    expect(sql).toContain("WHERE item_id = NEW.id");
    expect(sql).toContain("UPDATE translation_review_state");
  });
});
