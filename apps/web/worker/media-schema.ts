export const MEDIA_MANIFEST_MIGRATION = "0024_item_media_manifest.sql";
export const TRANSLATION_REVIEW_MIGRATION = "0023_translation_reviews.sql";
/** #161 owns 0025 in this repository. Kept beside the other migration names so
 * every gate derives the same ordered set instead of hardcoding a guess. */
export const RUN_IDENTITY_MIGRATION = "0025_llm_call_run_identity.sql";
/** Belonged to an unmerged draft that briefly claimed 0025. 0025 is the run
 * identity migration, so this filename must never be applied — see
 * plans/005-translation-review-media-rollout.md. Referenced only to hard-fail
 * on its reintroduction. */
export const TRANSLATION_REVIEW_HARDENING_MIGRATION =
  "0025_translation_review_hardening.sql";

/** A raw D1 error from a read or write that names the missing column. The
 * deploy gate guarantees 0024, so this only fires on an unmigrated database;
 * callers rethrow it instead of swallowing it as a transient failure. */
export function isMediaManifestSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:no such|has no|unknown) column(?:\s+named)?:?\s*media_manifest/i.test(
    message
  );
}
