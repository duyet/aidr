export const MEDIA_MANIFEST_COLUMN = "media_manifest";
export const MEDIA_MANIFEST_MIGRATION = "0024_item_media_manifest.sql";
export const TRANSLATION_REVIEW_MIGRATION = "0023_translation_reviews.sql";

export class MediaManifestSchemaError extends Error {
  readonly code = "MEDIA_MANIFEST_SCHEMA_MISSING" as const;
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MediaManifestSchemaError";
    this.cause = cause;
  }
}

export function isMediaManifestSchemaError(error: unknown): boolean {
  if (
    error instanceof MediaManifestSchemaError ||
    (error instanceof Error && error.name === "MediaManifestSchemaError")
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /(?:no such|has no|unknown) column(?:\s+named)?:?\s*media_manifest/i.test(
    message
  );
}

function isMissingColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such column|has no column|unknown column|media_manifest/i.test(
    message
  );
}

/**
 * Fail closed before ingest or notification work touches the new column.
 * D1 migration application is intentionally a separate operator step; this
 * probe never applies a migration.
 */
export async function assertMediaManifestSchema(
  db: Pick<D1Database, "prepare">
): Promise<void> {
  try {
    await db
      .prepare(`SELECT ${MEDIA_MANIFEST_COLUMN} FROM items LIMIT 1`)
      .first();
  } catch (error) {
    if (isMissingColumnError(error)) {
      throw new MediaManifestSchemaError(
        `items.${MEDIA_MANIFEST_COLUMN} is unavailable; apply ${TRANSLATION_REVIEW_MIGRATION} before ${MEDIA_MANIFEST_MIGRATION}`,
        error
      );
    }
    throw error;
  }
}
