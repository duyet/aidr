import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertMigrationFileOrder,
  assertRemoteSchemaOutput,
  assertRequiredMigrationsApplied,
  requiredMigrationsForFiles,
} from "../../scripts/verify-translation-schema.js";

const packageJson = JSON.parse(
  readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../package.json"
    ),
    "utf8"
  )
) as { scripts: Record<string, string> };

describe("translation migration deploy gate", () => {
  it("fails when 0023 is still pending", () => {
    expect(() =>
      assertRequiredMigrationsApplied("0023_translation_reviews.sql")
    ).toThrow("pending");
    expect(() =>
      assertRequiredMigrationsApplied("No migrations are pending.")
    ).not.toThrow();
  });

  it("fails when a coordinated optional migration is pending", () => {
    const files = [
      "0023_translation_reviews.sql",
      "0024_item_media_manifest.sql",
      "0025_llm_call_run_identity.sql",
    ];
    expect(() =>
      assertRequiredMigrationsApplied("0025_llm_call_run_identity.sql", files)
    ).toThrow(/pending/);
  });

  it("keeps optional media and run-identity migrations in coordinated order", () => {
    const files = [
      "0023_translation_reviews.sql",
      "0024_item_media_manifest.sql",
      "0025_llm_call_run_identity.sql",
    ];
    expect(requiredMigrationsForFiles(files)).toEqual(files);
    expect(() => assertMigrationFileOrder(files)).not.toThrow();
    expect(() =>
      assertMigrationFileOrder([
        "0024_item_media_manifest.sql",
        "0023_translation_reviews.sql",
      ])
    ).toThrow(/order|missing/);
  });

  it("runs both local order and remote schema gates before build and deploy", () => {
    expect(packageJson.scripts["check:migration-order"]).toContain(
      "--local-order"
    );
    expect(packageJson.scripts["check:migration-ledger"]).toContain(
      "--ledger-order"
    );
    expect(packageJson.scripts["check:migrations"]).toContain(
      "check:migration-order"
    );
    expect(packageJson.scripts.deploy).toMatch(
      /check:migrations.*verify:translation-schema.*build.*wrangler deploy/
    );
  });

  it("checks the coordinated 0025 run-identity schema when present", () => {
    const files = [
      "0023_translation_reviews.sql",
      "0024_item_media_manifest.sql",
      "0025_llm_call_run_identity.sql",
    ];
    expect(() =>
      assertRemoteSchemaOutput(
        "translation_reviews translation_review_attempts translation_review_state translation_review_resolutions qa_source_hash qa_candidate_hash qa_source_revision source_lang target_lang source_revision attempt_number criteria_fingerprint prompt_fingerprint policy_fingerprint model_fingerprint candidate_title candidate_summary manual_retry_count trg_items_source_revision trg_translations_candidate_invalidation trg_translations_marker_invalidation media_manifest",
        files
      )
    ).toThrow(/run_id|error_code|error_status|idx_llm_calls_run_id_ts/);
    expect(() =>
      assertRemoteSchemaOutput(
        "translation_reviews translation_review_attempts translation_review_state translation_review_resolutions qa_source_hash qa_candidate_hash qa_source_revision source_lang target_lang source_revision attempt_number criteria_fingerprint prompt_fingerprint policy_fingerprint model_fingerprint candidate_title candidate_summary manual_retry_count trg_items_source_revision trg_translations_candidate_invalidation trg_translations_marker_invalidation media_manifest run_id error_code error_status idx_llm_calls_run_id_ts",
        files
      )
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
        "translation_reviews translation_review_attempts translation_review_state translation_review_resolutions qa_source_hash qa_candidate_hash qa_source_revision source_lang target_lang source_revision attempt_number criteria_fingerprint prompt_fingerprint policy_fingerprint model_fingerprint candidate_title candidate_summary manual_retry_count trg_items_source_revision trg_translations_candidate_invalidation trg_translations_marker_invalidation media_manifest"
      )
    ).not.toThrow();
  });
});
