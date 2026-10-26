import {
  checkFreshness,
  type FreshnessProviders,
  type FreshnessResult,
  type FreshnessStory,
} from "../freshness/check.js";
import {
  fetchArticleDate,
  searchFirecrawl,
  searchHackerNews,
} from "../freshness/providers.js";
import { recordStep } from "../run-stats.js";
import type { Env } from "../types.js";
import { safeStep } from "../workflow-step.js";
import type { IngestContext } from "./context.js";

/** Top stories checked per run. */
export const FRESHNESS_TOP_N = 10;
/** A story checked this recently keeps its verdict. */
export const FRESHNESS_RECHECK_S = 6 * 3600;
/** No new check starts after this much of the step has passed. */
export const FRESHNESS_BUDGET_MS = 60_000;
const CONCURRENCY = 3;
const WINDOW_S = 48 * 3600;

export const FRESHNESS_CANDIDATES_SQL = `SELECT i.id, i.title, i.url, i.published_at, f.checked_at
  FROM items i
  LEFT JOIN story_freshness f ON f.item_id = i.id
  WHERE i.status = 'published' AND i.published_at >= ?
  ORDER BY i.rank_score DESC
  LIMIT ?`;

export const UPSERT_FRESHNESS_SQL = `INSERT INTO story_freshness
  (item_id, checked_at, run_id, verdict, trending_sources, domains_json,
   article_published_at, newer_urls_json, evidence_urls_json, providers,
   latency_ms, errors_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(item_id) DO UPDATE SET
    checked_at = excluded.checked_at, run_id = excluded.run_id,
    verdict = excluded.verdict, trending_sources = excluded.trending_sources,
    domains_json = excluded.domains_json,
    article_published_at = excluded.article_published_at,
    newer_urls_json = excluded.newer_urls_json,
    evidence_urls_json = excluded.evidence_urls_json,
    providers = excluded.providers, latency_ms = excluded.latency_ms,
    errors_json = excluded.errors_json`;

export interface FreshnessStats {
  checked: number;
  cached: number;
  verdicts: Record<string, number>;
  reason?: string;
}

/** Keyless providers always; Firecrawl only with its key. Google News RSS
 * stays out of the Worker: its feed terms allow personal use only. */
export function freshnessProviders(env: Env): FreshnessProviders {
  const search: FreshnessProviders["search"] = [
    { name: "hn", run: (q) => searchHackerNews(q) },
  ];
  const key = env.FIRECRAWL_API_KEY;
  if (key)
    search.push({ name: "firecrawl", run: (q) => searchFirecrawl(q, key) });
  return { articleDate: fetchArticleDate, search };
}

export function freshnessSummary(stats: FreshnessStats): string {
  if (stats.reason) return stats.reason;
  const verdicts = Object.entries(stats.verdicts)
    .map(([v, n]) => `${n} ${v}`)
    .join(", ");
  return `checked ${stats.checked} (${verdicts || "none"}), ${stats.cached} cached`;
}

export async function runFreshnessCheck(
  env: Env,
  runId: string,
  nowMs: number,
  providers: FreshnessProviders = freshnessProviders(env)
): Promise<FreshnessStats> {
  const nowS = Math.floor(nowMs / 1000);
  const { results: rows } = await env.DB.prepare(FRESHNESS_CANDIDATES_SQL)
    .bind(nowS - WINDOW_S, FRESHNESS_TOP_N)
    .all<{
      id: string;
      title: string;
      url: string;
      published_at: number;
      checked_at: number | null;
    }>();
  const due = rows.filter(
    (r) => r.checked_at === null || nowS - r.checked_at >= FRESHNESS_RECHECK_S
  );
  const stats: FreshnessStats = {
    checked: 0,
    cached: rows.length - due.length,
    verdicts: {},
  };
  if (due.length === 0) return stats;

  const { results: sourceRows } = await env.DB.prepare(
    `SELECT item_id, url, posted_at FROM item_sources
      WHERE url IS NOT NULL AND item_id IN (${due.map(() => "?").join(",")})
      ORDER BY item_id, position`
  )
    .bind(...due.map((r) => r.id))
    .all<{ item_id: string; url: string; posted_at: number | null }>();
  const stories: FreshnessStory[] = due.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    publishedAt: r.published_at,
    sourceUrls: sourceRows
      .filter((s) => s.item_id === r.id)
      .map((s) => ({ url: s.url, postedAt: s.posted_at })),
  }));

  const providerNames = providers.search.map((p) => p.name).join(",");
  const deadline = Date.now() + FRESHNESS_BUDGET_MS;
  const results: FreshnessResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < stories.length && Date.now() < deadline) {
      const story = stories[next++];
      results.push(await checkFreshness(story, providers, nowS));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (results.length > 0)
    await env.DB.batch(
      results.map((r) =>
        env.DB.prepare(UPSERT_FRESHNESS_SQL).bind(
          r.id,
          nowS,
          runId,
          r.verdict,
          r.trendingSources,
          JSON.stringify(r.domains),
          r.articlePublishedAt,
          JSON.stringify(r.newerUrls),
          JSON.stringify(r.evidenceUrls),
          providerNames,
          r.latencyMs,
          JSON.stringify(r.errors)
        )
      )
    );
  stats.checked = results.length;
  for (const r of results)
    stats.verdicts[r.verdict] = (stats.verdicts[r.verdict] ?? 0) + 1;
  return stats;
}

/** Shadow step: stores verdicts, changes nothing downstream, never fails
 * the run. */
export async function freshnessCheck(ctx: IngestContext): Promise<void> {
  const { step, env, runId, steps } = ctx;
  if (env.FRESHNESS_CHECK !== "shadow") {
    recordStep(steps, "freshness", "skipped", "flag off");
    return;
  }
  const from = steps.length;
  const stats = await safeStep(
    step,
    "freshness",
    { checked: 0, cached: 0, verdicts: {}, reason: "step failed" },
    async (): Promise<FreshnessStats> => {
      try {
        return await runFreshnessCheck(env, runId, Date.now());
      } catch (error) {
        console.error("freshness step failed:", error);
        return {
          checked: 0,
          cached: 0,
          verdicts: {},
          reason: /no such table/.test(String(error))
            ? "schema missing; apply migration 0076"
            : "check failed",
        };
      }
    },
    { steps }
  );
  const interrupted = steps
    .slice(from)
    .some((s) => s.name === "freshness" && s.action === "interrupted");
  if (!interrupted) recordStep(steps, "freshness", freshnessSummary(stats));
}
