import type { WorkflowStep } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestContext, SourceRow } from "../ingest/context.js";
import { fetchSources } from "../ingest/fetch.js";
import { resolveSkipReasons } from "../ingest/source-health.js";
import { emptySourceHealth } from "../source-health.js";
import { anthropicAdapter } from "../sources/anthropic.js";
import { hnAdapter } from "../sources/hn.js";
import { huggingNewsAdapter } from "../sources/huggingnews.js";
import { lobstersAdapter } from "../sources/lobsters.js";
import { marketBriefAdapter } from "../sources/marketbrief.js";
import type { SourceAdapter } from "../sources/types.js";
import { xaiAdapter } from "../sources/xai.js";

/**
 * A non-2xx used to come back as `[]`. `fetchSources` only records
 * `fetchFailures` for a `SourceFetchError`, and `resolveSkipReason` then
 * says "empty". The workflow step structured-clones the throw, so the
 * catch sees `SourceFetchError: <message>` and not the class.
 */
function cloningStep(): WorkflowStep {
  return {
    do: async (
      _name: string,
      _options: unknown,
      callback: () => Promise<unknown>
    ) => {
      try {
        return await callback();
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`${error.name}: ${error.message}`);
        }
        throw error;
      }
    },
  } as unknown as WorkflowStep;
}

function source(id: string, type: string): SourceRow {
  return { id, type, config: "{}", enabled: 1 };
}

const ADAPTERS: readonly (readonly [string, SourceAdapter])[] = [
  ["hn", hnAdapter],
  ["lobsters", lobstersAdapter],
  ["anthropic", anthropicAdapter],
  ["huggingnews", huggingNewsAdapter],
  ["xai", xaiAdapter],
  ["marketbrief", marketBriefAdapter],
];

describe("non-RSS non-2xx is fetch_failed, not an empty feed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each(ADAPTERS)(
    "%s throws fetch_failed on a non-2xx response",
    async (_type, adapter) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("nope", { status: 503 }))
      );
      await expect(adapter.fetchItems({}, 0)).rejects.toMatchObject({
        name: "SourceFetchError",
        reason: "fetch_failed",
      });
    }
  );

  it("records an HN 503 as fetch_failed, not empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 }))
    );
    const sourceHealth = { hn: emptySourceHealth() };
    const ctx = {
      step: cloningStep(),
      env: {},
      runId: "fetch-fail",
      steps: [],
      mode: { dryRun: true, steps: null },
    } as unknown as IngestContext;

    const { fetchFailures } = await fetchSources(
      ctx,
      [source("hn", "hn")],
      sourceHealth,
      {}
    );
    resolveSkipReasons(sourceHealth, fetchFailures);

    expect(fetchFailures.get("hn")).toBe("fetch_failed");
    expect(sourceHealth.hn.skipReason).toBe("fetch_failed");
    expect(sourceHealth.hn.fetched).toBe(0);
  });

  it("keeps a real empty 200 as empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ hits: [] }), { status: 200 })
      )
    );
    const sourceHealth = { hn: emptySourceHealth() };
    const ctx = {
      step: cloningStep(),
      env: {},
      runId: "fetch-empty",
      steps: [],
      mode: { dryRun: true, steps: null },
    } as unknown as IngestContext;

    const { fetchFailures } = await fetchSources(
      ctx,
      [source("hn", "hn")],
      sourceHealth,
      {}
    );
    resolveSkipReasons(sourceHealth, fetchFailures);

    expect(fetchFailures.has("hn")).toBe(false);
    expect(sourceHealth.hn.skipReason).toBe("empty");
  });

  it("throws when the HuggingNews sitemap fallback is non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("sitemaps/stories-")) {
          return new Response("nope", { status: 404 });
        }
        return new Response(JSON.stringify({ nodes: [] }), { status: 200 });
      })
    );
    await expect(huggingNewsAdapter.fetchItems({}, 0)).rejects.toMatchObject({
      reason: "fetch_failed",
    });
  });

  it("keeps xAI items when the sitemap is 200 and the news page is not", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("sitemap")) {
          return new Response(
            `<?xml version="1.0"?><urlset>
              <url><loc>https://x.ai/news/grok-4-6</loc>
              <lastmod>2026-08-12T00:00:00.000Z</lastmod></url>
            </urlset>`,
            { status: 200 }
          );
        }
        return new Response("nope", { status: 503 });
      })
    );
    const items = await xaiAdapter.fetchItems(
      {},
      Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000)
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Grok 4 6");
  });
});
