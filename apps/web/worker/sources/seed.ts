/**
 * Runtime seed for the `sources` table.
 *
 * Previously this file hand-copied every row out of migrations 0018, 0020,
 * 0021 and 0022, and its own header said so ("Mirrors migrations/… so ingest
 * can seed before `wrangler d1 migrations apply`"). That duplication was the
 * drift the issue was filed about.
 *
 * The SQL is now *derived* from the single declarative list in
 * `./catalog.ts` — the same list `migrations/0027_source_registry.sql` is
 * generated from — so ingest can still seed before migrations are applied,
 * and a source added to the registry cannot reach one and miss the other.
 * `worker/__tests__/source-catalog.test.ts` asserts the two agree byte for
 * byte.
 *
 * Upsert semantics (name/type/config authoritative, `enabled` operator-owned)
 * are documented on `buildSourceSeedSql` in the catalog.
 */
import { buildSourceSeedSql } from "./catalog.js";

/** Retained under its historical name: `worker/workflow.ts` and the seed
 *  tests import it, and renaming a widely-referenced export buys nothing. */
export const VENDOR_BLOG_SEED_SQL = `${buildSourceSeedSql().trim()}\n`;

/** Idempotence guard. The Worker isolate is long-lived, so without this the
 *  upsert would re-run on every hourly ingest; the statement is idempotent but
 *  it is a needless write, and the module-level flag is what the test helper
 *  below resets. */
let seeded = false;

export async function ensureVendorBlogSources(db: D1Database): Promise<void> {
  if (seeded) return;
  await db.prepare(VENDOR_BLOG_SEED_SQL.trim()).run();
  seeded = true;
}

/** Test helper — Worker isolate is long-lived; tests share the module. */
export function resetVendorBlogSeedCache(): void {
  seeded = false;
}
