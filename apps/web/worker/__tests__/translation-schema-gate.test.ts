import { describe, expect, it } from "vitest";
import {
  assertRemoteSchemaOutput,
  assertRequiredMigrationsApplied,
} from "../../scripts/verify-translation-schema.js";

describe("translation migration deploy gate", () => {
  it("fails when 0023 or 0025 is still pending", () => {
    expect(() =>
      assertRequiredMigrationsApplied(
        "0023_translation_reviews.sql\n0025_translation_review_hardening.sql"
      )
    ).toThrow("pending");
    expect(() =>
      assertRequiredMigrationsApplied("No migrations are pending.")
    ).not.toThrow();
  });

  it("fails when the remote schema lacks review tables or marker columns", () => {
    expect(() =>
      assertRemoteSchemaOutput(
        "translation_review_attempts translation_review_state"
      )
    ).toThrow("incomplete");
    expect(() =>
      assertRemoteSchemaOutput(
        "translation_review_attempts translation_review_state translation_review_resolutions qa_candidate_hash qa_source_revision source_lang target_lang attempt_number trg_items_source_revision"
      )
    ).not.toThrow();
  });
});
