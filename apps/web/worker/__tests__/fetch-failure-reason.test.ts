import type { WorkflowStep } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { IngestContext, SourceRow } from "../ingest/context.js";
import { fetchSources } from "../ingest/fetch.js";
import { resolveSkipReasons } from "../ingest/source-health.js";
import { emptySourceHealth } from "../source-health.js";

/**
 * The Workflow engine structured-clones a thrown `SourceFetchError` across
 * `step.do`. The `.catch` in `fetchSources` receives a plain `Error` whose
 * message is `SourceFetchError: <original message>` (`instanceof` is false).
 * Run 5872dfd2 logged exactly that and then stored `skipReason: "empty"`.
 *
 * A throw that is *not* a `SourceFetchError` is still a failed fetch, not a
 * quiet feed — `other` below throws a plain `Error` and must come back
 * `fetch_failed`, otherwise a crashed step reads `empty` on the dashboard
 * (#357).
 */
function cloningStep(): WorkflowStep {
  return {
    do: async (name: string) => {
      if (name === "fetch-arstechnica-ai") {
        throw new Error("SourceFetchError: rss feed returned 403");
      }
      if (name === "fetch-marktechpost") {
        throw new Error("SourceFetchError: rss feed returned an HTML document");
      }
      if (name === "fetch-quiet") return [];
      throw new Error("something else broke");
    },
  } as unknown as WorkflowStep;
}

function source(id: string): SourceRow {
  return { id, type: "rss", config: "{}", enabled: 1 };
}

describe("fetchSources records a cloned SourceFetchError", () => {
  it("maps the 403 message to fetch_failed and the HTML message to parse_failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sourceHealth = {
      "arstechnica-ai": emptySourceHealth(),
      marktechpost: emptySourceHealth(),
      quiet: emptySourceHealth(),
      other: emptySourceHealth(),
    };
    const ctx = {
      step: cloningStep(),
      env: {},
      runId: "5872dfd2",
      steps: [],
      mode: { dryRun: true, steps: null },
    } as unknown as IngestContext;

    const { fetchFailures } = await fetchSources(
      ctx,
      [
        source("arstechnica-ai"),
        source("marktechpost"),
        source("quiet"),
        source("other"),
      ],
      sourceHealth,
      {}
    );

    expect(fetchFailures.get("arstechnica-ai")).toBe("fetch_failed");
    expect(fetchFailures.get("marktechpost")).toBe("parse_failed");
    expect(fetchFailures.has("quiet")).toBe(false);
    expect(fetchFailures.get("other")).toBe("fetch_failed");

    resolveSkipReasons(sourceHealth, fetchFailures);
    expect(sourceHealth["arstechnica-ai"].skipReason).toBe("fetch_failed");
    expect(sourceHealth.marktechpost.skipReason).toBe("parse_failed");
    expect(sourceHealth.quiet.skipReason).toBe("empty");
    expect(sourceHealth.other.skipReason).toBe("fetch_failed");
  });
});
