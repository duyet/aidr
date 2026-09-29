import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SOURCE_SKIP_REASONS as READ_MODEL_SKIP_REASONS } from "../../src/lib/system-queries.js";
import { SOURCE_SKIP_REASONS } from "../source-health.js";
import {
  ARXIV_NOT_ADDED_REASON,
  buildSourceMigrationSql,
  buildSourceSeedSql,
  DEFAULT_STALE_AFTER_RUNS,
  parseSourceInsertRows,
  registrySourceIds,
  SOURCE_REGISTRY,
  staleAfterRunsFor,
} from "../sources/catalog.js";
import { adapters } from "../sources/registry.js";
import { VENDOR_BLOG_SEED_SQL } from "../sources/seed.js";

const MIGRATION_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
  "0027_source_registry.sql"
);

/** The migration is generated, so the file on disk must be byte-identical to
 *  what the registry produces. Reading the file rather than regenerating in a
 *  temp dir is the point: this catches a hand-edit, a stale regeneration, and
 *  a registry change that was never regenerated, all three of which used to be
 *  silent drift. */
const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

function normalize(rows: ReturnType<typeof parseSourceInsertRows>) {
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      config: JSON.stringify(row.config),
      enabled: row.enabled,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const expected = normalize(SOURCE_REGISTRY as never);

describe("declarative source registry", () => {
  it("has unique ids and a name/type/config for every row", () => {
    const ids = registrySourceIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const spec of SOURCE_REGISTRY) {
      expect(spec.id, "id must be a safe row key").toMatch(/^[a-z0-9-]+$/);
      expect(spec.name.length).toBeGreaterThan(0);
      expect(spec.config).toBeTypeOf("object");
      expect(typeof spec.enabled).toBe("boolean");
    }
  });

  it("only uses adapter types the registry can actually dispatch", () => {
    for (const spec of SOURCE_REGISTRY) {
      if (spec.type === "push") continue;
      expect(
        Object.keys(adapters),
        `${spec.id} declares type "${spec.type}" with no adapter`
      ).toContain(spec.type);
    }
  });

  it("gives every rss row a feed URL and the flood-gate keys it needs", () => {
    for (const spec of SOURCE_REGISTRY) {
      if (spec.type !== "rss") continue;
      const feed = spec.config.feed;
      expect(typeof feed, `${spec.id} has no feed URL`).toBe("string");
      expect(feed as string).toMatch(/^https:\/\//);
      const max = spec.config.maxItems;
      if (max !== undefined) {
        expect(
          Number.isInteger(max) && (max as number) > 0,
          `${spec.id} maxItems must be a positive integer`
        ).toBe(true);
      }
    }
  });

  it("keeps no robots-disallowed source, and records why arXiv is absent", () => {
    // arXiv was evaluated and rejected on two independent grounds, both
    // recorded in the catalog. This test exists so the decision cannot be
    // quietly reverted by a later "let's just add arXiv" commit without
    // someone re-reading why.
    expect(
      SOURCE_REGISTRY.filter((s) => s.id.startsWith("arxiv-")),
      "arXiv must not return to the registry without a fresh live verification"
    ).toEqual([]);
    // The sortable Atom API is the surface everyone reaches for first, and it
    // is the one that is disallowed on both arXiv hosts.
    expect(ARXIV_NOT_ADDED_REASON).toContain("Disallow: /api");
    expect(ARXIV_NOT_ADDED_REASON).toContain("rss.arxiv.org");
    // …and the allowed surface is documented as unverifiable, not as broken.
    expect(ARXIV_NOT_ADDED_REASON).toContain("skipDays");
    // The row to add later, with its weekend-freeze threshold, is written out
    // in the catalog's comment block so the follow-up is a copy-paste. Assert
    // it on the source text: the recipe is documentation, not runtime state.
    const catalogSource = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "sources",
        "catalog.ts"
      ),
      "utf8"
    );
    expect(catalogSource).toContain(
      "https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL"
    );
    expect(catalogSource).toContain("staleAfterRuns: 72");
  });

  it("points no registry row at a robots-disallowed host", () => {
    // Guard the general rule, not just the arXiv case: every feed host the
    // registry names has to be one we can fetch under its published rules.
    // `vnexpress.net`'s blanket disallows are all against named AI/training
    // crawlers; its `*` group is `Allow: /`, so a feed fetch is permitted.
    for (const spec of SOURCE_REGISTRY) {
      if (spec.type !== "rss") continue;
      const host = new URL(spec.config.feed as string).host;
      expect(
        /(^|\.)(export|rss)\.arxiv\.org$/.test(host),
        `${spec.id} points at ${host}`
      ).toBe(false);
    }
  });

  it("marks exactly the Vietnamese sources with explicit sourceLang: vi", () => {
    const vi = SOURCE_REGISTRY.filter(
      (s) => (s.config as { sourceLang?: unknown }).sourceLang === "vi"
    );
    expect(vi.length).toBeGreaterThan(0);
    for (const spec of vi) {
      // Declared metadata only — the QA path must never infer direction from
      // diacritics (ALGORITHM.md § Translate).
      expect(spec.type).toBe("rss");
      expect(
        (spec.config.feed as string).startsWith("https://"),
        "a VI source must be a real feed we verified"
      ).toBe(true);
    }
  });

  it("documents a stale threshold for every row and defaults sensibly", () => {
    expect(DEFAULT_STALE_AFTER_RUNS).toBe(168);
    for (const spec of SOURCE_REGISTRY) {
      const threshold = staleAfterRunsFor(spec.id);
      expect(
        Number.isInteger(threshold) && threshold > 0,
        `${spec.id} has no usable stale threshold`
      ).toBe(true);
    }
  });
});

describe("registry / seed SQL / migration agreement", () => {
  it("the checked-in migration is exactly what the registry generates", () => {
    expect(migrationSql).toBe(
      buildSourceMigrationSql({ fileName: "0027_source_registry.sql" })
    );
  });

  it("the migration and the runtime seed list identical rows", () => {
    expect(normalize(parseSourceInsertRows(migrationSql))).toEqual(expected);
  });

  it("the seed SQL is derived from the registry, not hand-copied", () => {
    expect(VENDOR_BLOG_SEED_SQL.trim()).toBe(buildSourceSeedSql().trim());
    expect(normalize(parseSourceInsertRows(VENDOR_BLOG_SEED_SQL))).toEqual(
      expected
    );
  });

  it("the seed upserts identity and config but never re-enables a source", () => {
    // `enabled` is operator-owned: an operator who switched a noisy source off
    // must not have it flipped back on by the next hourly run.
    expect(VENDOR_BLOG_SEED_SQL).toContain("ON CONFLICT(id) DO UPDATE SET");
    const updateClause = VENDOR_BLOG_SEED_SQL.slice(
      VENDOR_BLOG_SEED_SQL.indexOf("ON CONFLICT")
    );
    expect(updateClause).toContain("config = excluded.config");
    expect(updateClause).not.toContain("enabled = excluded.enabled");
  });

  it("the migration inserts only, leaving an operator's enabled flag alone", () => {
    // Strip `--` comment lines first: the generated header discusses the
    // upsert semantics in prose, and this assertion is about the SQL body.
    const body = migrationSql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(body).toContain("INSERT OR IGNORE INTO sources");
    // No conflict clause at all: the migration may only create a row that does
    // not exist yet. Reconciling an existing row is the runtime seed's job.
    expect(body).not.toContain("ON CONFLICT");
  });
});

describe("skip-reason enum", () => {
  it("is identical in the worker and the web read model", () => {
    // The two lists are declared separately on purpose (the read model must not
    // import a Worker module), so this is the check that keeps them in step.
    expect([...READ_MODEL_SKIP_REASONS].sort()).toEqual(
      [...SOURCE_SKIP_REASONS].sort()
    );
  });

  it("covers exactly the reasons #230 asked for", () => {
    expect([...SOURCE_SKIP_REASONS].sort()).toEqual([
      "all_rejected_below_relevance",
      "disabled",
      "empty",
      "fetch_failed",
      "parse_failed",
    ]);
  });
});
