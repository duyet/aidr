let schemaReady = false;

/**
 * Adds `subscribers` columns: 0019 and 0059
 * are no-ops because SQLite has no ADD COLUMN IF NOT EXISTS and production
 * already held these columns from this function. Every other mail table and
 * column comes from migrations 0015 and 0029.
 */
export async function ensureMailSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  for (const sql of [
    "ALTER TABLE subscribers ADD COLUMN digest_size INTEGER NOT NULL DEFAULT 5",
    // Daily digest vs weekly edition (src/lib/mail-frequency.ts), and the
    // last weekly edition (`YYYY-Www`) mailed to this subscriber.
    "ALTER TABLE subscribers ADD COLUMN frequency TEXT NOT NULL DEFAULT 'daily'",
    "ALTER TABLE subscribers ADD COLUMN last_weekly_sent TEXT",
    // Weekday (0 = Sunday … 6) a weekly subscriber gets the digest, local.
    "ALTER TABLE subscribers ADD COLUMN weekly_day INTEGER NOT NULL DEFAULT 1",
    // Headline font (src/lib/mail-font.ts); migration 0071 adds it too.
    "ALTER TABLE subscribers ADD COLUMN mail_font TEXT NOT NULL DEFAULT 'sans'",
  ]) {
    try {
      await db.prepare(sql).run();
    } catch {
      // Column already present.
    }
  }
  schemaReady = true;
}

/** Test helper — the Worker isolate is long-lived; tests share the module. */
export function resetMailSchemaCache(): void {
  schemaReady = false;
}
