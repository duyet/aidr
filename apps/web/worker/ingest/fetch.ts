import { chunk } from "../chunk.js";
import { recordSourceHealth, recordStep } from "../run-stats.js";
import { emptySourceHealth, type SourceRunHealth } from "../source-health.js";
import { adapters } from "../sources/registry.js";
import { sourceFetchFailureReason } from "../sources/rss.js";
import { ensureVendorBlogSources } from "../sources/seed.js";
import type { FetchedItem } from "../sources/types.js";
import { safeStep } from "../workflow-step.js";
import {
  type IngestContext,
  SINCE_WINDOW_SEC,
  type SourceRow,
} from "./context.js";

/** Sources fetched in parallel per group; bounds concurrent subrequests. */
export const SOURCE_FETCH_GROUP = 4;

export type FetchFailureReason = "fetch_failed" | "parse_failed";

export interface FetchedSource {
  source: SourceRow;
  items: FetchedItem[];
}

export async function loadSources(ctx: IngestContext): Promise<SourceRow[]> {
  const { step, env } = ctx;
  return safeStep(step, "load-sources", [], async () => {
    await ensureVendorBlogSources(env.DB);
    // Deliberately NOT `WHERE enabled = 1`: the disabled rows are loaded
    // too so the fetch loop can skip them while the per-source health map
    // still records an explicit `disabled` reason for them. Same single
    // round trip as before.
    const { results } = await env.DB.prepare(
      "SELECT id, type, config, enabled FROM sources"
    ).all<SourceRow>();
    return results ?? [];
  });
}

/** Seeds a zeroed health row for every source, enabled or not, so the
 *  dashboard can always show a count or a reason instead of a blank cell,
 *  and a source switched off mid-window reads `disabled` instead of
 *  silently vanishing. */
export function seedSourceHealth(
  sourceHealth: Record<string, SourceRunHealth>,
  sources: readonly SourceRow[]
): void {
  for (const source of sources) {
    sourceHealth[source.id] = source.enabled
      ? emptySourceHealth()
      : { ...emptySourceHealth(), skipReason: "disabled" };
  }
}

export function enabledSourcesOf(sources: readonly SourceRow[]): SourceRow[] {
  return sources.filter((s) => s.enabled !== 0);
}

/**
 * One durable `fetch-<id>` step per enabled source, run in groups of
 * `SOURCE_FETCH_GROUP`. Updates `bySource` and `sourceHealth` in place so the
 * counts survive for `close-run` even if a later step throws.
 */
export async function fetchSources(
  ctx: IngestContext,
  sources: readonly SourceRow[],
  sourceHealth: Record<string, SourceRunHealth>,
  bySource: Record<string, number>
): Promise<{
  fetchedBySource: FetchedSource[];
  itemsFetched: number;
  /** Why a source's fetch step threw, when it threw a typed
   *  `SourceFetchError`. That typed error is what separates a broken feed
   *  from a quiet one: a returned `[]` means the feed parsed and was simply
   *  empty, a throw means the transport or the parse failed. */
  fetchFailures: Map<string, FetchFailureReason>;
}> {
  const { step, steps } = ctx;
  const enabledSources = enabledSourcesOf(sources);
  const sinceEpochSec = Math.floor(Date.now() / 1000) - SINCE_WINDOW_SEC;
  const fetchedBySource: FetchedSource[] = [];
  const fetchFailures = new Map<string, FetchFailureReason>();
  let itemsFetched = 0;

  for (const group of chunk(enabledSources, SOURCE_FETCH_GROUP)) {
    const groupResults = await Promise.all(
      group.map((source) =>
        step
          .do<FetchedItem[]>(
            `fetch-${source.id}`,
            {
              retries: { limit: 3, delay: 10_000, backoff: "exponential" },
            },
            async () => {
              const adapter = adapters[source.type];
              if (!adapter) return [];
              const config = JSON.parse(source.config || "{}");
              return adapter.fetchItems(config, sinceEpochSec);
            }
          )
          .catch((error: unknown) => {
            // A `SourceFetchError` is the adapter telling us *why* it
            // produced nothing (403/5xx, or a 200 that is really an HTML
            // error page). The workflow step structured-clones that error,
            // so the class is gone here and the reason is read back from
            // the message. Anything else that reached this catch is still
            // a failed fetch — recording nothing would report a crashed
            // step as `empty`, i.e. a quiet feed. `sanitizeError` is
            // applied at write time, so the raw error never reaches D1 or
            // an API response.
            console.error(`fetch-${source.id} step failed:`, error);
            const reason = sourceFetchFailureReason(error) ?? "fetch_failed";
            fetchFailures.set(source.id, reason);
            return [] as FetchedItem[];
          })
      )
    );
    for (let j = 0; j < group.length; j++) {
      const source = group[j];
      const items = groupResults[j];
      fetchedBySource.push({ source, items });
      itemsFetched += items.length;
      bySource[source.id] = (bySource[source.id] ?? 0) + items.length;
      recordSourceHealth(sourceHealth, source.id, {
        fetched: items.length,
      });
    }
  }
  recordStep(
    steps,
    "fetch",
    `${itemsFetched} items from ${enabledSources.length} sources`,
    sources.length > enabledSources.length
      ? `${sources.length - enabledSources.length} disabled`
      : undefined
  );
  return { fetchedBySource, itemsFetched, fetchFailures };
}
