import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestContext, SourceRow } from "../ingest/context.js";
import { fetchSources } from "../ingest/fetch.js";
import { emptySourceHealth } from "../source-health.js";

/** Mirrors the engine: retry up to `retries.limit` unless the step threw a
 * NonRetryableError, then hand back a cloned `Name: message` error. */
function retryingStep(): WorkflowStep {
  return {
    do: async (
      _name: string,
      config: { retries: { limit: number } },
      fn: () => Promise<unknown>
    ) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn();
        } catch (error) {
          const { name, message } = error as Error;
          const exhausted = attempt >= config.retries.limit;
          if (name === "NonRetryableError" || exhausted) {
            throw new Error(`${name}: ${message}`);
          }
        }
      }
    },
  } as unknown as WorkflowStep;
}

function feedRespondingWith(status: number, body = "", contentType = "") {
  const fetchMock = vi.fn(
    async () =>
      new Response(body, {
        status,
        headers: contentType ? { "content-type": contentType } : {},
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function fetchOne() {
  const source: SourceRow = {
    id: "feed",
    type: "rss",
    config: JSON.stringify({ feed: "https://example.com/feed.xml" }),
    enabled: 1,
  };
  const ctx = {
    step: retryingStep(),
    env: {},
    runId: "run",
    steps: [],
    mode: { dryRun: true, steps: null },
  } as unknown as IngestContext;
  return fetchSources(ctx, [source], { feed: emptySourceHealth() }, {});
}

describe("fetch-<id> retry policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not retry a feed that answers 404", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = feedRespondingWith(404);
    const { fetchFailures } = await fetchOne();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchFailures.get("feed")).toBe("fetch_failed");
  });

  it("does not retry a feed that serves an HTML page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = feedRespondingWith(
      200,
      "<html><body>gone</body></html>",
      "text/html"
    );
    const { fetchFailures } = await fetchOne();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchFailures.get("feed")).toBe("parse_failed");
  });

  it("still retries a 503, a 429 and a 408", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [status, reason] of [
      [503, "fetch_failed"],
      [429, "blocked"],
      [408, "fetch_failed"],
    ] as const) {
      const fetchMock = feedRespondingWith(status);
      const { fetchFailures } = await fetchOne();
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(fetchFailures.get("feed")).toBe(reason);
    }
  });

  it("still retries a transport failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network connection lost");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchFailures } = await fetchOne();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchFailures.get("feed")).toBe("fetch_failed");
  });
});
