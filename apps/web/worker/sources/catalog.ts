/**
 * THE declarative source registry.
 *
 * One row = one source. Adding, renaming, re-pointing, or disabling a source
 * is a one-line change *here*; `seed.ts` (the pre-migration runtime seed), the
 * generated migration, and the `/api/system/sources` + `/data` admin surfaces
 * all read this list, so the three can no longer drift apart.
 *
 * ## Why this exists
 *
 * Before this file the set of sources was duplicated by hand across
 * `worker/sources/seed.ts` and `migrations/0018` / `0020` / `0021` / `0022`.
 * `seed.ts`'s own header called that out as a maintenance hazard ("Mirrors
 * migrations/… so ingest can seed before `wrangler d1 migrations apply`"), and
 * the hazard was real: a source added to the migration but not the seed (or
 * the other way round) shows up only as a mysteriously missing feed.
 *
 * ## Ownership rules (deliberate, and load-bearing)
 *
 * - **This registry owns `name`, `type`, and `config` for the ids it declares.**
 *   The seed upserts those three on conflict, so a fixed feed URL actually
 *   reaches production instead of being pinned to whatever the row already
 *   held. That is the whole point of the file.
 * - **`enabled` is operator-owned and is NEVER written by the seed.** Turning a
 *   noisy source off must survive every subsequent run; re-enabling it is one
 *   `upsert_source` call (or a one-word edit here).
 * - **Rows this registry does not declare are entirely operator-owned.** An
 *   operator can add a new `rss` source through the existing
 *   `upsert_source` admin tool with no deploy and this file will never touch
 *   it. See `worker/README.md` → "Add a source without a deploy".
 *
 * ## Config keys the `rss` adapter understands
 *
 * | key | meaning |
 * | --- | --- |
 * | `feed` | the RSS/Atom URL (required) |
 * | `homepage` | publisher home, used for the favicon/logo in `/data` |
 * | `sourceLang` | `"en"` (default) or `"vi"`. `"vi"` is explicit metadata that puts the item on the real VI→EN translation-QA path; it is never inferred from diacritics. |
 * | `maxItems` | flood gate: hard cap on items returned per fetch, applied newest-first **after** the since-window filter. Bounds per-run LLM volume for firehose feeds. |
 * | `keywordFilter` | named title pre-filter (`"ai"`). Reuses the same regex the HN adapter uses. Applied *before* `maxItems` so the cap is filled with relevant items. |
 * | `minRequestIntervalMs` | per-host minimum spacing between fetches. Needed for hosts that reject concurrent requests (arXiv asks for ≥3s between API calls). Serialises same-host fetches across the workflow's parallel source groups; the fetch itself still goes through the single `enrich.ts` boundary. |
 *
 * ## Staleness
 *
 * `staleAfterRuns` is how many *consecutive* runs may return zero items before
 * the source is flagged. The default is a week; see `staleAfterRunsFor`.
 */

/** Adapter key. Kept as a plain string union-ish alias so a typo in `type`
 *  is a `Record` lookup miss at runtime (`adapters[type]`) rather than a
 *  silently-forgotten source. `push` is the no-adapter pseudo-type used by
 *  operator-pushed items. */
export type SourceType =
  | "hn"
  | "huggingnews"
  | "lobsters"
  | "rss"
  | "anthropic"
  | "marketbrief"
  | "xai"
  | "push";

export interface SourceSpec {
  id: string;
  name: string;
  type: SourceType;
  config: Record<string, unknown>;
  enabled: boolean;
  /**
   * Consecutive zero-item runs before this source is surfaced as stale.
   * Omit to take `DEFAULT_STALE_AFTER_RUNS`.
   */
  staleAfterRuns?: number;
  /** Why this row exists / why these settings. Rendered into the PR evidence. */
  note?: string;
}

/**
 * Default "this feed has rotted" threshold, in consecutive runs.
 *
 * Measured against the live feed cadence rather than picked for a round
 * number: runs are hourly (ALGORITHM.md § Scheduling), so 168 runs is seven
 * days. Every source in this registry has historically published at least
 * weekly — `lastweekin-ai` is a weekly newsletter, `mit-tr-ai` /
 * `google-research` publish a few times a week — so a two-day threshold
 * (the "e.g. 48 runs" in #230) would flag healthy low-frequency sources as
 * stale most of the time, which is exactly the false positive that makes an
 * alarm worthless. A week of complete silence from a feed that used to
 * deliver is the real rot signal: a moved URL, a redesigned feed, a paywall,
 * or a dead host.
 */
export const DEFAULT_STALE_AFTER_RUNS = 168;

/**
 * arXiv was evaluated for this change and deliberately NOT added. Both halves
 * of that decision are recorded here so the next person does not have to
 * rediscover them from a git log.
 *
 * **1. The API endpoint is robots-disallowed, so it is out.**
 * `export.arxiv.org/robots.txt` is `User-agent: * / Disallow: /`, and
 * `arxiv.org/robots.txt` explicitly lists `Disallow: /api`. The Atom API at
 * `export.arxiv.org/api/query?search_query=cat%3Acs.AI&…` — which is what
 * makes a sortable, newest-first flood gate possible — therefore cannot be
 * used under this repo's rule that no source may circumvent a robots.txt
 * disallow. (arXiv publishes separate API terms of use at 1 request / 3s; the
 * robots disallow is the stricter of the two and it is the one this repo has
 * committed to honouring.)
 *
 * **2. The one allowed surface could not be verified live.**
 * `rss.arxiv.org` has no robots.txt (HTTP 404), so nothing is disallowed
 * there, and it is arXiv's officially announced syndication feed. It is RSS
 * rather than Atom — which the `rss` adapter already parses — and it is
 * already ordered newest-first, so the `keywordFilter` + newest-first
 * `maxItems` gate applies to it unchanged. But it declares
 * `<skipDays>Saturday, Sunday</skipDays>`, so at the time of this change it
 * served an empty channel and the next announcement was not due until Monday
 * 04:00 UTC. The acceptance bar for a new source is >=1 usable item with a
 * title, an absolute URL, and a date, verified live; a source added without
 * that evidence is worse than no source, so it waits.
 *
 * **To finish it**, after 04:00 UTC on a weekday:
 *
 * ```ts
 * {
 *   id: "arxiv-research",
 *   name: "arXiv cs.AI / cs.LG / cs.CL",
 *   type: "rss",
 *   config: {
 *     // One row, not three: rss.arxiv.org accepts a combined category list
 *     // (the channel title comes back as "cs.AI, cs.LG, cs.CL updates on
 *     // arXiv.org"), so this is one request per run and needs no pacing.
 *     feed: "https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL",
 *     homepage: "https://arxiv.org/list/cs.AI/recent",
 *     keywordFilter: "ai",
 *     maxItems: 6,
 *   },
 *   enabled: true,
 *   // arXiv accepts no weekend submissions, so its newest submittedDate is
 *   // frozen from ~Fri 18:00 UTC to ~Mon 00:00 UTC. The 26h since-window
 *   // keeps the last Friday paper visible until ~Sat 20:00 UTC, leaving a
 *   // measured ~54 consecutive silent runs. 72 clears that with margin while
 *   // still flagging a genuinely dead row inside three days, not a week.
 *   staleAfterRuns: 72,
 * }
 * ```
 *
 * then `pnpm --filter @aidr/web run gen:source-migration` and
 * `pnpm --filter @aidr/web run verify:source-feeds arxiv-research`.
 */
export const ARXIV_NOT_ADDED_REASON = `arXiv is not in this registry: export.arxiv.org/robots.txt is Disallow-all and
arxiv.org/robots.txt lists Disallow: /api, so the sortable Atom API cannot be
used; and the one allowed surface (rss.arxiv.org, which has no robots.txt)
was serving an empty channel because it declares skipDays for Saturday and
Sunday, so it could not be verified live. The exact row to add, and the
measured weekend freeze its staleAfterRuns override has to account for, are
written out in the ARXIV_NOT_ADDED_REASON notes in worker/sources/catalog.ts.`;

/** Exactly the rows generated into the already-applied 0027 migration. */
export const REGISTRY_0027: readonly SourceSpec[] = [
  // ---------------------------------------------------------------- community
  {
    id: "hn",
    name: "Hacker News",
    type: "hn",
    config: {
      query:
        "AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek",
    },
    enabled: true,
  },
  {
    id: "huggingnews",
    name: "HuggingNews",
    type: "huggingnews",
    config: {},
    enabled: true,
  },
  {
    id: "lobsters",
    name: "Lobsters",
    type: "lobsters",
    config: { tags: ["ai", "ml", "vibecoding"] },
    enabled: true,
  },

  // ------------------------------------------------------------------- vendor
  {
    id: "openai",
    name: "OpenAI News",
    type: "rss",
    config: {
      feed: "https://openai.com/news/rss.xml",
      homepage: "https://openai.com",
    },
    enabled: true,
  },
  {
    id: "anthropic",
    name: "Anthropic News",
    type: "anthropic",
    config: { homepage: "https://www.anthropic.com" },
    enabled: true,
    note: "No official RSS; the adapter scrapes the /news listing.",
  },
  {
    id: "google-ai",
    name: "Google AI Blog",
    type: "rss",
    config: {
      feed: "https://blog.google/technology/ai/rss/",
      homepage: "https://blog.google",
    },
    enabled: true,
  },
  {
    id: "hf-blog",
    name: "Hugging Face Blog",
    type: "rss",
    config: {
      feed: "https://huggingface.co/blog/feed.xml",
      homepage: "https://huggingface.co",
    },
    enabled: true,
  },
  {
    id: "marketbrief",
    name: "MarketBrief",
    type: "marketbrief",
    config: { homepage: "https://marketbrief.now", topics: ["ai"] },
    enabled: true,
    note: "AI hub only — war/politics stay out by product decision.",
  },
  {
    id: "xai",
    name: "xAI News",
    type: "xai",
    config: { homepage: "https://x.ai", sitemap: "https://x.ai/sitemap.xml" },
    enabled: true,
  },
  {
    id: "deepmind",
    name: "DeepMind Blog",
    type: "rss",
    config: {
      feed: "https://deepmind.google/blog/rss.xml",
      homepage: "https://deepmind.google",
    },
    enabled: true,
  },
  {
    id: "aws-ml",
    name: "AWS ML Blog",
    type: "rss",
    config: {
      feed: "https://aws.amazon.com/blogs/machine-learning/feed/",
      homepage: "https://aws.amazon.com/blogs/machine-learning/",
    },
    enabled: true,
  },
  {
    id: "google-dev",
    name: "Google Developers Blog",
    type: "rss",
    config: {
      feed: "https://developers.googleblog.com/rss/",
      homepage: "https://developers.googleblog.com",
    },
    enabled: true,
  },

  // ---------------------------------------------------------------- editorial
  {
    id: "mit-tr-ai",
    name: "MIT Tech Review AI",
    type: "rss",
    config: {
      feed: "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
      homepage:
        "https://www.technologyreview.com/topic/artificial-intelligence/",
    },
    enabled: true,
  },
  {
    id: "marktechpost",
    name: "MarkTechPost",
    type: "rss",
    config: {
      feed: "https://www.marktechpost.com/feed/",
      homepage: "https://www.marktechpost.com/",
    },
    enabled: true,
  },
  {
    id: "google-research",
    name: "Google Research Blog",
    type: "rss",
    config: {
      feed: "https://research.google/blog/rss/",
      homepage: "https://research.google/blog/",
    },
    enabled: true,
  },
  {
    id: "simonwillison",
    name: "Simon Willison",
    type: "rss",
    config: {
      feed: "https://simonwillison.net/atom/everything/",
      homepage: "https://simonwillison.net/",
    },
    enabled: true,
  },
  {
    id: "the-decoder",
    name: "The Decoder",
    type: "rss",
    config: {
      feed: "https://the-decoder.com/feed/",
      homepage: "https://the-decoder.com/",
    },
    enabled: true,
  },
  {
    id: "mit-news-ai",
    name: "MIT News AI",
    type: "rss",
    config: {
      feed: "https://news.mit.edu/rss/topic/artificial-intelligence2",
      homepage: "https://news.mit.edu/",
    },
    enabled: true,
  },
  {
    id: "lastweekin-ai",
    name: "Last Week in AI",
    type: "rss",
    config: {
      feed: "https://lastweekin.ai/feed",
      homepage: "https://lastweekin.ai/",
    },
    enabled: true,
  },

  // ------------------------------------------------------ Vietnamese (VI→EN)
  {
    id: "vnexpress-tech",
    name: "VnExpress Khoa học & Công nghệ",
    type: "rss",
    config: {
      feed: "https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss",
      homepage: "https://vnexpress.net/khoa-hoc-cong-nghe",
      // Explicit, declared metadata. This is what puts the item on the real
      // VI→EN translation-QA path (ALGORITHM.md § Translate): an English
      // candidate is generated by ANYROUTER_ENGLISH_TRANSLATE_MODEL and then
      // independently reviewed by ANYROUTER_REVIEW_MODEL. Without this key
      // the whole VI→EN branch is dead code — as it was for every source
      // before this change.
      sourceLang: "vi",
      // 24h newsroom, ~20-30 items/day. Uncapped it would push ~30 new
      // rows through the scorer every run; the cap keeps the per-run new-item
      // count inside the score step's existing 3×5 concurrent wave.
      maxItems: 6,
    },
    enabled: true,
    note: "First VI-native source. Chosen over Tuổi Trẻ because its pubDate is RFC-822 with +0700; see PR.",
  },

  // ------------------------------------------------- primary research: arXiv
  // Intentionally absent. See ARXIV_NOT_ADDED_REASON above: the sortable Atom
  // API is robots-disallowed, and the one allowed surface could not be verified
  // live. The flood gate, its tests, and the exact row to add are all already
  // in place; only this list entry and a regenerated migration are missing.

  // ------------------------------------------------------ AI newsrooms (EN)
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    type: "rss",
    config: {
      feed: "https://techcrunch.com/category/artificial-intelligence/feed/",
      homepage: "https://techcrunch.com/category/artificial-intelligence/",
      maxItems: 6,
    },
    enabled: true,
  },
  {
    id: "theverge-ai",
    name: "The Verge AI",
    type: "rss",
    config: {
      feed: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
      homepage: "https://www.theverge.com/ai-artificial-intelligence",
      maxItems: 6,
    },
    enabled: true,
  },
  {
    id: "arstechnica-ai",
    name: "Ars Technica AI",
    type: "rss",
    config: {
      feed: "https://arstechnica.com/ai/feed/",
      homepage: "https://arstechnica.com/ai/",
      maxItems: 6,
    },
    enabled: true,
  },
  {
    id: "wired-ai",
    name: "WIRED AI",
    type: "rss",
    config: {
      feed: "https://www.wired.com/feed/tag/ai/latest/rss",
      homepage: "https://www.wired.com/tag/artificial-intelligence/",
      maxItems: 6,
    },
    enabled: true,
  },
];

/** Added after 0027 shipped; created in D1 by 0030_arxiv_source.sql. Applied
 *  migrations are immutable, so later rows live outside the 0027 list. */
export const ARXIV_SOURCE: SourceSpec = {
  id: "arxiv-research",
  name: "arXiv cs.AI / cs.LG / cs.CL",
  type: "rss",
  config: {
    // rss.arxiv.org has no robots.txt and accepts a combined category list,
    // so this is one request per run. Flood-gated: AI keyword pre-filter
    // plus a newest-first cap (see ARXIV_NOT_ADDED_REASON history above).
    feed: "https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL",
    homepage: "https://arxiv.org/list/cs.AI/recent",
    keywordFilter: "ai",
    maxItems: 6,
  },
  enabled: true,
  // No weekend announcements: ~54 measured silent runs Fri-Mon.
  staleAfterRuns: 72,
};

/**
 * Wider community coverage (#230), created in D1 by
 * `0032_community_source_ranges.sql`. These re-declare rows that 0027 already
 * inserted, so they replace the 0027 entry with the same id (see
 * `SOURCE_REGISTRY`). 0027 itself is applied and stays byte-for-byte as is.
 *
 * - `lobsters.filteredTags`: broad tags verified live on lobste.rs (each
 *   `/t/{tag}.json` returns 25 stories). Lobsters has no other AI tag than
 *   `ai`, `ml` and `vibecoding`, so these are only kept when the title passes
 *   the shared AI keyword list; nothing else reaches the scorer.
 * - `hn.popularMinPoints`: a third Algolia search for stories scoring at least
 *   this much in the window, so a high-score AI story that is neither in the
 *   newest 100 nor on the front page is still seen. Same AI keyword filter.
 *
 * Volume: both additions only add items already passing the AI keyword filter,
 * and duplicates of existing items are dropped by the normal dedupe, so the
 * score batch budget in ALGORITHM.md is unchanged.
 */
export const REGISTRY_0032: readonly SourceSpec[] = [
  {
    id: "hn",
    name: "Hacker News",
    type: "hn",
    config: {
      query:
        "AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek",
      popularMinPoints: 40,
    },
    enabled: true,
  },
  {
    id: "lobsters",
    name: "Lobsters",
    type: "lobsters",
    config: {
      tags: ["ai", "ml", "vibecoding"],
      filteredTags: ["programming", "compsci", "devops", "security"],
    },
    enabled: true,
  },
];

/** Added on 2026-10-01; created in D1 by 0036_cloudflare_blog_source.sql.
 *  The blog covers far more than AI (networking, security, DNS), so the
 *  shared AI keyword filter and a small cap keep only the AI posts (Workers
 *  AI, AI Gateway, agents, Vectorize) and never flood the scorer. */
export const CLOUDFLARE_BLOG_SOURCE: SourceSpec = {
  id: "cloudflare-blog",
  name: "Cloudflare Blog",
  type: "rss",
  config: {
    feed: "https://blog.cloudflare.com/rss/",
    homepage: "https://blog.cloudflare.com",
    keywordFilter: "ai",
    maxItems: 5,
  },
  enabled: true,
  // After the AI filter it can go a week without a match.
  staleAfterRuns: 336,
};

/** Later migrations replace earlier rows with the same id, in order. */
export function mergeRegistryRows(
  ...layers: readonly (readonly SourceSpec[])[]
): SourceSpec[] {
  const byId = new Map<string, SourceSpec>();
  for (const spec of layers.flat()) byId.set(spec.id, spec);
  return [...byId.values()];
}

export const SOURCE_REGISTRY: readonly SourceSpec[] = mergeRegistryRows(
  REGISTRY_0027,
  [ARXIV_SOURCE],
  REGISTRY_0032,
  [CLOUDFLARE_BLOG_SOURCE]
);

export function registrySourceIds(): string[] {
  return SOURCE_REGISTRY.map((s) => s.id);
}

export function findSourceSpec(id: string): SourceSpec | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

/** Threshold for the stale detector, per source. */
export function staleAfterRunsFor(id: string): number {
  return findSourceSpec(id)?.staleAfterRuns ?? DEFAULT_STALE_AFTER_RUNS;
}

/** SQL string literal. Registry config never contains a quote today; this
 *  doubles them so a future feed URL with an apostrophe cannot break the
 *  generated SQL. */
function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sourceValues(spec: SourceSpec): string {
  return [
    `(${sqlText(spec.id)}, ${sqlText(spec.name)}, ${sqlText(spec.type)}, ${sqlText(
      JSON.stringify(spec.config)
    )}, ${spec.enabled ? 1 : 0})`,
  ].join("");
}

export function sourceSeedRowsSql(
  specs: readonly SourceSpec[] = SOURCE_REGISTRY
): string {
  return specs.map(sourceValues).join(",\n  ");
}

/**
 * The runtime seed.
 *
 * `ON CONFLICT DO UPDATE` on name/type/config (never `enabled`) is the whole
 * reason the registry can be authoritative — see the ownership rules at the
 * top of this file. `INSERT OR IGNORE`, which this replaced, would have left
 * a corrected feed URL stranded on whatever the row already held, i.e. the
 * drift this file exists to remove.
 */
export function buildSourceSeedSql(): string {
  return `INSERT INTO sources (id, name, type, config, enabled) VALUES
  ${sourceSeedRowsSql()}
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config`;
}

export interface SourceMigrationOptions {
  /** e.g. "0027_source_registry.sql" — written into the generated header. */
  fileName: string;
}

/**
 * Narrative header for the generated migration. It lives HERE, not in
 * `scripts/gen-source-migration.ts`, because the test that proves the
 * checked-in file matches the registry must compare against a single owner —
 * if the prose lived in the script, editing the script could silently change
 * the migration body and the byte-equality test would still pass.
 */
export const SOURCE_MIGRATION_COMMENTS: string[] = [
  "Declarative source registry (#230). This file is GENERATED from",
  "apps/web/worker/sources/catalog.ts — the same list that produces the",
  "pre-migration runtime seed in worker/sources/seed.ts, so ingest can still",
  "seed before wrangler d1 migrations apply and the two can no longer",
  "disagree (a test asserts it).",
  "",
  "Adds the Vietnamese-native source (the source_lang metadata lives in the",
  "row config, not in this column) and four AI newsrooms.",
  "",
  "Evaluated and NOT added, with the reasons recorded in the catalog:",
  "  arXiv          export.arxiv.org/robots.txt is Disallow-all and",
  "                 arxiv.org/robots.txt lists Disallow: /api, so the sortable",
  "                 Atom API is out; the one allowed surface (rss.arxiv.org,",
  "                 no robots.txt) was serving an empty channel because it",
  "                 declares skipDays for Sat/Sun, so it could not be",
  "                 verified live.",
  "  VentureBeat    429 on bot fetches (already noted in 0022).",
  "  Engadget       HTTP 202 challenge instead of the feed.",
  "  ZDNet          its 'AI topic' RSS redirects to general tech news.",
  "  Tuoi Tre cong-nghe  pubDate carries no timezone, so every item would",
  "                 land ~7h in the future and sort above fresh stories.",
  "  cafebiz.vn / techrum.vn / zingnews.vn   404 / 404 / 403.",
  "",
  "This is INSERT OR IGNORE with no conflict clause: it only ever creates a",
  "row that does not exist yet. The runtime seed's upsert is the thing that",
  "keeps an existing row's name/type/config current, and it deliberately does",
  "not touch the enabled flag, so an operator who switched a source off keeps",
  "it off across every deploy.",
];

/** Header + body of the generated migration. The header is fixed so the
 *  checked-in file can be diffed byte-for-byte against this output by
 *  `worker/__tests__/source-catalog.test.ts`. */
export function buildSourceMigrationSql(
  options: SourceMigrationOptions
): string {
  const comments = SOURCE_MIGRATION_COMMENTS.map((line) => `-- ${line}\n`).join(
    ""
  );
  // NOTE: no backticks anywhere inside this template literal — they would
  // terminate it. Identifiers are written bare in the generated SQL comments.
  return `-- GENERATED FILE (${options.fileName}) — DO NOT EDIT BY HAND.
-- Regenerate with: pnpm --filter @aidr/web run gen:source-migration
--
-- Source of truth: apps/web/worker/sources/catalog.ts (SOURCE_REGISTRY).
-- The same list produces the runtime seed in worker/sources/seed.ts, so the
-- migration and the pre-migration seed can no longer disagree.
${comments}--
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ${sourceSeedRowsSql(REGISTRY_0027)};
`;
}

/** Parse the `(id, name, type, config, enabled)` tuples out of a generated
 *  or hand-written source INSERT so a test can compare it against the
 *  registry without a SQL engine. */
export function parseSourceInsertRows(sql: string): SourceSpec[] {
  const rows: SourceSpec[] = [];
  const pattern =
    /\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*(\d+)\s*\)/g;
  let match: RegExpExecArray | null = pattern.exec(sql);
  while (match !== null) {
    const unquote = (raw: string) => raw.replace(/''/g, "'");
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(unquote(match[4])) as Record<string, unknown>;
    } catch {
      config = {};
    }
    rows.push({
      id: unquote(match[1]),
      name: unquote(match[2]),
      type: unquote(match[3]) as SourceType,
      config,
      enabled: match[5] === "1",
    });
    match = pattern.exec(sql);
  }
  return rows;
}
