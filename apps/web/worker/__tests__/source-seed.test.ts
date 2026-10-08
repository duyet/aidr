import { describe, expect, it } from "vitest";
import { parseSourceInsertRows, SOURCE_REGISTRY } from "../sources/catalog.js";
import {
  ensureVendorBlogSources,
  resetVendorBlogSeedCache,
  VENDOR_BLOG_SEED_SQL,
} from "../sources/seed.js";

/**
 * The seed's *content* is asserted in `source-catalog.test.ts` (registry vs
 * seed SQL vs migration must agree byte for byte). This file covers the
 * runtime behaviour of the seed: it runs once per isolate, and the SQL it
 * executes is the shape D1 will actually see.
 */
describe("ensureVendorBlogSources", () => {
  it("carries every registry row, including the ones this issue added", () => {
    for (const spec of SOURCE_REGISTRY) {
      expect(VENDOR_BLOG_SEED_SQL).toContain(`'${spec.id}'`);
    }
    // The rows that made this issue worth filing, spelled out so a rename
    // cannot quietly drop the coverage win the change exists for.
    expect(VENDOR_BLOG_SEED_SQL).toContain("'vnexpress-tech'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'techcrunch-ai'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'arstechnica-ai'");
  });

  it("runs the seed SQL once", async () => {
    resetVendorBlogSeedCache();
    let runs = 0;
    const db = {
      prepare(sql: string) {
        expect(sql).toContain("INSERT INTO sources");
        return {
          run: async () => {
            runs += 1;
          },
        };
      },
    } as unknown as D1Database;
    await ensureVendorBlogSources(db);
    await ensureVendorBlogSources(db);
    expect(runs).toBe(1);
  });

  it("is safe to run against a database that already has the rows", () => {
    // The upsert, not INSERT OR IGNORE: a corrected feed URL has to reach an
    // existing row or the registry is not actually authoritative. `enabled`
    // must stay out of the conflict clause or a disabled source would be
    // switched back on by the next hourly run.
    expect(VENDOR_BLOG_SEED_SQL).toContain("ON CONFLICT(id) DO UPDATE SET");
    const conflict = VENDOR_BLOG_SEED_SQL.slice(
      VENDOR_BLOG_SEED_SQL.indexOf("ON CONFLICT")
    );
    expect(conflict).toContain("name = excluded.name");
    expect(conflict).toContain("type = excluded.type");
    expect(conflict).toContain("config = excluded.config");
    expect(conflict).not.toMatch(/enabled\s*=/);
  });

  it("seeds each registry row with its own enabled flag", () => {
    // The INSERT writes the registry's flag so a row the catalog disables
    // (e.g. vnexpress-tech, off since 0051) also seeds disabled — the seed
    // runs before migrations apply, so an `enabled = 1` here would fetch a
    // dead source in that gap. The flag is still operator-owned afterwards:
    // the upsert never touches it.
    const seeded = parseSourceInsertRows(VENDOR_BLOG_SEED_SQL);
    expect(seeded).toHaveLength(SOURCE_REGISTRY.length);
    for (const row of seeded) {
      const spec = SOURCE_REGISTRY.find((s) => s.id === row.id);
      expect(row.enabled, row.id).toBe(spec?.enabled);
    }
  });
});
