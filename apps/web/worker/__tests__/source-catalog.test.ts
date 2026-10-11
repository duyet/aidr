import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SOURCE_SKIP_REASONS as READ_MODEL_SKIP_REASONS } from "../../src/lib/system-queries.js";
import { sourceFamily } from "../source-diversity.js";
import { SOURCE_SKIP_REASONS } from "../source-health.js";
import {
  ARXIV_NOT_ADDED_REASON,
  buildSourceMigrationSql,
  buildSourceSeedSql,
  DEFAULT_STALE_AFTER_RUNS,
  effectiveSourceSpec,
  mergeRegistryRows,
  officialSourceFor,
  PROBATION_MAX_ITEMS,
  parseSourceInsertRows,
  registrySourceIds,
  SOURCE_REGISTRY,
  sourceSpecForUrl,
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

  it("carries arXiv only via the robots-clean rss.arxiv.org feed, flood-gated", () => {
    const arxiv = SOURCE_REGISTRY.filter((s) => s.id.startsWith("arxiv-"));
    expect(arxiv.map((s) => s.id)).toEqual(["arxiv-research"]);
    const [row] = arxiv;
    // The sortable Atom API is disallowed on both arXiv hosts; only the
    // rss.arxiv.org syndication feed (no robots.txt) may be used.
    expect(row?.type).toBe("rss");
    expect(row?.config.feed).toBe(
      "https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL"
    );
    expect(ARXIV_NOT_ADDED_REASON).toContain("Disallow: /api");
    // A firehose needs both gates: the AI keyword pre-filter and a hard cap.
    expect(row?.config.keywordFilter).toBe("ai");
    expect(row?.config.maxItems).toBe(6);
    // No weekend announcements: ~108 silent runs must not flag it as stale.
    expect(row?.staleAfterRuns).toBe(144);
  });

  it("points no registry row at a robots-disallowed host", () => {
    // Every feed host must be fetchable under its published rules.
    // export.arxiv.org (the API) is Disallow-all; rss.arxiv.org is allowed.
    // `vnexpress.net`'s blanket disallows are all against named AI/training
    // crawlers; its `*` group is `Allow: /`, so a feed fetch is permitted.
    for (const spec of SOURCE_REGISTRY) {
      if (spec.type !== "rss") continue;
      const host = new URL(spec.config.feed as string).host;
      expect(
        /(^|\.)export\.arxiv\.org$/.test(host),
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
    expect(DEFAULT_STALE_AFTER_RUNS).toBe(336);
    for (const spec of SOURCE_REGISTRY) {
      const threshold = staleAfterRunsFor(spec.id);
      expect(
        Number.isInteger(threshold) && threshold > 0,
        `${spec.id} has no usable stale threshold`
      ).toBe(true);
    }
  });
});

describe("source refresh 0057", () => {
  const byId = (id: string) => SOURCE_REGISTRY.find((s) => s.id === id);

  it("holds every probation row to the probation rule", () => {
    const probation = SOURCE_REGISTRY.filter((s) => s.probation);
    expect(probation.length).toBeGreaterThan(0);
    for (const spec of probation) {
      const maxItems = spec.config.maxItems as number;
      expect(maxItems, `${spec.id} maxItems`).toBeGreaterThan(0);
      expect(maxItems, `${spec.id} maxItems`).toBeLessThanOrEqual(
        spec.family === "oss-release" ? 1 : PROBATION_MAX_ITEMS
      );
      expect(spec.engagement ?? "none", `${spec.id} engagement`).toBe("none");
      // Official means the organization's own newsroom on its own host.
      if (spec.official?.length) {
        expect(spec.config.feed, `${spec.id} official needs a feed`).toBeTypeOf(
          "string"
        );
        expect(
          spec.config.homepage,
          `${spec.id} official needs a homepage`
        ).toBeTypeOf("string");
      }
    }
  });

  it("puts related feeds in one family so they count once", () => {
    const familyOf = (id: string) => byId(id)?.family;
    expect(
      ["ollama", "vllm", "transformers", "codex"].map((n) =>
        familyOf(`release-${n}`)
      )
    ).toEqual(["oss-release", "oss-release", "oss-release", "oss-release"]);
    expect(familyOf("hf-papers")).toBe("hf");
    expect(familyOf("openrouter-models")).toBe("openrouter");
    expect(
      SOURCE_REGISTRY.filter((s) => s.id.startsWith("hf-models-")).map(
        (s) => s.family
      )
    ).toEqual(Array(5).fill("hf-models"));
    expect(familyOf("genk-ai")).toBe("vi-press");
    expect(sourceFamily("release-ollama")).toBe("oss-release");
    expect(sourceFamily("release-vllm")).toBe(sourceFamily("release-codex"));
  });

  it("gives shared-host rows no feed or homepage, so they claim no foreign link", () => {
    const shared = SOURCE_REGISTRY.filter((s) =>
      ["githubreleases", "hfpapers", "hfmodels", "openrouter"].includes(s.type)
    );
    expect(shared.length).toBe(11);
    for (const spec of shared) {
      expect(spec.config.feed, spec.id).toBeUndefined();
      expect(spec.config.homepage, spec.id).toBeUndefined();
      expect(spec.official, spec.id).toBeUndefined();
    }
    // An HN or user link to any github.com / huggingface.co page keeps the
    // source it came in with instead of landing in oss-release or hf-models.
    expect(
      effectiveSourceSpec("hn", "https://github.com/random/repo")?.id
    ).toBe("hn");
    expect(sourceSpecForUrl("https://github.com/random/repo")).toBeUndefined();
    expect(
      sourceSpecForUrl("https://huggingface.co/Qwen/Qwen3.8-27B")?.id
    ).toBe("hf-blog");
    expect(
      officialSourceFor("hn", "https://github.com/ollama/ollama/releases")
    ).toBeUndefined();
    expect(sourceSpecForUrl("https://allenai.org/blog/x")?.id).toBe("ai2");
    expect(officialSourceFor("hn", "https://allenai.org/blog/x")?.id).toBe(
      "ai2"
    );
  });

  it("disables the sources that refuse Workers egress and says why", () => {
    for (const id of [
      "reddit-ml",
      "reddit-localllama",
      "reddit-singularity",
      "xai",
      "ahead-of-ai",
    ]) {
      const spec = byId(id);
      expect(spec?.enabled, id).toBe(false);
      expect(spec?.note, id).toMatch(/Disabled in 0057/);
    }
  });

  it("points Ars Technica at the technology-lab feed behind the AI title filter", () => {
    const ars = byId("arstechnica-ai");
    expect(ars?.enabled).toBe(true);
    expect(ars?.config.feed).toBe(
      "https://feeds.arstechnica.com/arstechnica/technology-lab"
    );
    expect(ars?.config.keywordFilter).toBe("ai");
  });

  it("declares GenK AI as a Vietnamese row with an explicit UTC+7", () => {
    const genk = byId("genk-ai");
    expect(genk?.config.sourceLang).toBe("vi");
    expect(genk?.config.timezone).toBe("+07:00");
    expect(genk?.enabled).toBe(true);
  });
});

describe("registry / seed SQL / migration agreement", () => {
  it("the checked-in migration is exactly what the registry generates", () => {
    expect(migrationSql).toBe(
      buildSourceMigrationSql({ fileName: "0027_source_registry.sql" })
    );
  });

  it("0027, 0030, 0032, 0036, 0043, 0044, 0051 and 0057 applied in order list exactly the registry rows", () => {
    const read = (name: string) =>
      readFileSync(resolve(dirname(MIGRATION_PATH), name), "utf8");
    const arxivSql = read("0030_arxiv_source.sql");
    const rangesSql = read("0032_community_source_ranges.sql");
    const cloudflareSql = read("0036_cloudflare_blog_source.sql");
    const hnScopeSql = read("0043_hn_model_scope.sql");
    const aiSourcesSql = read("0044_ai_sources_and_aggregator_caps.sql");
    const socialSql = read("0051_social_trending_sources.sql");
    const refreshSql = read("0058_source_refresh.sql");
    // A later migration replaces the earlier row with the same id; a later
    // `UPDATE sources SET enabled = 0` is a disable, not a row, so it is
    // applied to the merged rows by hand.
    const disabledIds = new Set(
      [socialSql, refreshSql].flatMap((sql) =>
        [
          ...sql.matchAll(
            /UPDATE sources SET enabled = 0 WHERE id = '([a-z0-9-]+)'/gi
          ),
        ].map((m) => m[1])
      )
    );
    const applied = mergeRegistryRows(
      parseSourceInsertRows(migrationSql),
      parseSourceInsertRows(arxivSql),
      parseSourceInsertRows(rangesSql),
      parseSourceInsertRows(cloudflareSql),
      parseSourceInsertRows(hnScopeSql),
      parseSourceInsertRows(aiSourcesSql),
      parseSourceInsertRows(socialSql),
      parseSourceInsertRows(refreshSql)
    ).map((row) =>
      disabledIds.has(row.id) ? { ...row, enabled: false } : row
    );
    expect(normalize(applied)).toEqual(expected);
    // Never re-enables a source an operator switched off.
    for (const sql of [
      arxivSql,
      rangesSql,
      cloudflareSql,
      aiSourcesSql,
      socialSql,
      refreshSql,
    ]) {
      expect(sql).toContain("ON CONFLICT(id) DO UPDATE SET");
      expect(sql).not.toContain("enabled = excluded.enabled");
    }
  });

  it("widens Lobsters and HN through config only, on the same adapter types", () => {
    const lobsters = SOURCE_REGISTRY.find((s) => s.id === "lobsters");
    const hn = SOURCE_REGISTRY.find((s) => s.id === "hn");
    expect(lobsters?.type).toBe("lobsters");
    expect(lobsters?.config.tags).toEqual(["ai", "ml", "vibecoding"]);
    expect(lobsters?.config.filteredTags).toEqual([
      "programming",
      "compsci",
      "devops",
      "security",
    ]);
    expect(hn?.type).toBe("hn");
    expect(hn?.config.popularMinPoints).toBe(40);
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

describe("aggregator flood gate", () => {
  it("caps marketbrief and huggingnews, which are mirrors of each other", () => {
    for (const id of ["marketbrief", "huggingnews"]) {
      const spec = SOURCE_REGISTRY.find((s) => s.id === id);
      expect(spec?.config.maxItems, id).toBe(6);
      expect(spec?.family, id).toBe("aggregator");
    }
  });
});
