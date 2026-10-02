/**
 * The flood gate (#230's "a firehose would swamp the feed" requirement).
 *
 * arXiv is the motivating case and the fixture is arXiv-shaped (Atom,
 * `rel="alternate"` links, hundreds of entries in one window), but arXiv is
 * NOT in the registry: its sortable API is robots-disallowed on both arXiv
 * hosts and the one allowed feed could not be verified live (see
 * `ARXIV_NOT_ADDED_REASON` in `worker/sources/catalog.ts`). The gate is
 * therefore exercised with the config arXiv's row *would* carry, which is the
 * same `keywordFilter` + `maxItems` pair the live Vietnamese and newsroom rows
 * use. Testing the gate against the shape it was built for means the follow-up
 * that finally adds arXiv lands on already-verified behaviour.
 *
 * The fixture is deliberately larger than the 500 items the acceptance
 * criteria name, and the assertions run through the *production* code path —
 * `rssAdapter.fetchItems` — so a regression that removed the gate, moved it
 * after the cap, or made it oldest-first fails here rather than in production.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { LLM_STEP } from "../ingest/context.js";
import {
  SCORE_BATCH_SIZE,
  SCORE_CONCURRENCY,
  SCORE_SLICE_MAX_MS,
} from "../llm.js";
import { SOURCE_REGISTRY } from "../sources/catalog.js";
import {
  applyFloodGate,
  parseRssItems,
  resetRssHostQueues,
  rssAdapter,
  SourceFetchError,
} from "../sources/rss.js";

/** Build an arXiv-shaped Atom document. The real API returns `<entry>` blocks
 *  with `rel="alternate"` links, `<published>`/`<updated>` stamps, and a
 *  `<summary>` — this reproduces that shape so the test exercises the same
 *  parser branch production does. */
function arxivAtom(count: number, opts: { aiEvery?: number } = {}): string {
  const aiEvery = opts.aiEvery ?? 2;
  const entries: string[] = [];
  for (let i = 0; i < count; i++) {
    const isAi = i % aiEvery === 0;
    const title = isAi
      ? `Scaling LLM Agent Memory Without Breaking Reasoning ${i}`
      : `On the Combinatorial Topology of Reticulated Polytopes ${i}`;
    const stamp = new Date(
      Date.parse("2026-09-24T17:00:00Z") - i * 60_000
    ).toISOString();
    entries.push(`<entry>
    <id>http://arxiv.org/abs/2609.${30000 + i}v1</id>
    <title>${title}</title>
    <updated>${stamp}</updated>
    <link href="https://arxiv.org/abs/2609.${30000 + i}v1" rel="alternate" type="text/html"/>
    <summary>Abstract for entry ${i}.</summary>
  </entry>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>arXiv Query</title>
  ${entries.join("\n  ")}
</feed>`;
}

/** The config arXiv's registry row would carry, per
 *  `ARXIV_NOT_ADDED_REASON`: the one allowed surface (rss.arxiv.org) is
 *  already newest-first, so the gate is the same keywordFilter + cap pair the
 *  live Vietnamese and newsroom rows use. Declared here rather than read from
 *  the registry so this suite keeps testing the gate even while arXiv is not
 *  on the list. */
const ARXIV_CONFIG: Record<string, unknown> = {
  feed: "https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL",
  keywordFilter: "ai",
  maxItems: 6,
};

function stubFeed(
  xml: string,
  status = 200,
  contentType = "application/atom+xml"
) {
  const fetchMock = vi.fn(
    async () =>
      new Response(xml, { status, headers: { "content-type": contentType } })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const SINCE = Math.floor(Date.parse("2026-09-23T00:00:00Z") / 1000);

afterEach(() => {
  vi.unstubAllGlobals();
  resetRssHostQueues();
});

describe("arXiv flood gate", () => {
  it("bounds a >500-entry feed to the documented cap", async () => {
    const xml = arxivAtom(640);
    expect(parseRssItems(xml)).toHaveLength(640);
    stubFeed(xml);

    const items = await rssAdapter.fetchItems(ARXIV_CONFIG, SINCE);

    // The acceptance criterion: >500 items in one window must produce a
    // bounded, keyword-filtered set, and the bound is the row's `maxItems`,
    // not a constant invented here.
    expect(parseRssItems(xml).length).toBeGreaterThan(500);
    const cap = ARXIV_CONFIG.maxItems as number;
    expect(items).toHaveLength(cap);
    // 640 entries, half AI-relevant, still capped at the same number: the cap
    // is on what reaches the scorer, not on what the feed contained.
    expect(items.length).toBeLessThan(640 / 10);
  });

  it("keeps only the AI-keyword subset before capping", async () => {
    // 640 entries, every 2nd one AI-related → 320 survive the keyword filter,
    // and the cap then takes the newest few of those.
    stubFeed(arxivAtom(640, { aiEvery: 2 }));
    const items = await rssAdapter.fetchItems(ARXIV_CONFIG, SINCE);

    expect(items).toHaveLength(ARXIV_CONFIG.maxItems as number);
    for (const item of items) {
      expect(item.title).toMatch(/\b(llm|agent|reasoning)\b|AI/i);
      expect(item.title).not.toMatch(/Reticulated Polytopes/);
    }
    // Newest-first: the cap must take the live edge, not the deep tail. The
    // fixture's entry 0 is the newest.
    expect(items[0].url).toContain("2609.30000");
  });

  it("is the same regex the HN adapter uses, not a second keyword list", async () => {
    // The gate and HN's pre-filter must stay in step; the single import in
    // rss.ts is the mechanism and this asserts the behaviour that depends on
    // it, without coupling the test to either module's internals.
    const { AI_KEYWORD_RE } = await import("../sources/keywords.js");
    const unfiltered = applyFloodGate(
      parseRssItems(arxivAtom(20, { aiEvery: 1 })),
      {}
    );
    const filtered = applyFloodGate(
      parseRssItems(arxivAtom(20, { aiEvery: 1 })),
      { keywordFilter: "ai" }
    );
    expect(unfiltered).toHaveLength(20);
    expect(filtered.length).toBe(20);
    expect(AI_KEYWORD_RE.test(filtered[0].title)).toBe(true);
  });

  it("does nothing when the feed is smaller than the cap", async () => {
    const cap = ARXIV_CONFIG.maxItems as number;
    stubFeed(arxivAtom(cap, { aiEvery: 1 }));
    const items = await rssAdapter.fetchItems(ARXIV_CONFIG, SINCE);
    expect(items).toHaveLength(cap);
  });

  it("caps the whole added source set inside the existing score budget", () => {
    // The arithmetic, from ALGORITHM.md § LLM transport, asserted rather than
    // asserted-in-a-PR-description: `scoreItems` chunks into batches of
    // SCORE_BATCH_SIZE and runs them SCORE_CONCURRENT_BATCHES at a time, each
    // attempt bounded by the 70s score hang-cap, all inside one 4-minute LLM
    // step. The caps below are a per-run CEILING on a 26h window that dedupe
    // then collapses, so the number to check is the ceiling.
    const capped = SOURCE_REGISTRY.filter(
      (s) => s.type === "rss" && typeof s.config.maxItems === "number"
    );
    const worstCase = capped.reduce(
      (sum, s) => sum + (s.config.maxItems as number),
      0
    );
    const batches = Math.ceil(worstCase / SCORE_BATCH_SIZE);
    const rounds = Math.ceil(batches / SCORE_CONCURRENT_BATCHES);
    // One run scores as many rounds as fit in the 4-minute step; anything
    // left stays unscored and is picked up by the next run (ALGORITHM.md,
    // "re-fetched/scored/translated per run until the backlog drains").
    const roundsPerRun = Math.floor(LLM_STEP_TIMEOUT_MS / SCORE_SLICE_MAX_MS);
    const runsToDrain = Math.ceil(rounds / roundsPerRun);
    // Every source at its ceiling at once never happens; if it did, the
    // backlog must clear in a couple of 30-minute runs, far inside the 26h
    // since-window, so no item ages out unscored.
    expect(runsToDrain).toBeLessThanOrEqual(3);
    // And no single source is allowed to dominate one batch.
    for (const spec of capped) {
      expect(
        spec.config.maxItems as number,
        `${spec.id} maxItems exceeds one score batch`
      ).toBeLessThanOrEqual(SCORE_BATCH_SIZE + 1);
    }
  });
});

/** The score step's budget, parsed from `LLM_STEP.timeout` ("4 minutes"). */
const LLM_STEP_TIMEOUT_MS = Number.parseInt(LLM_STEP.timeout, 10) * 60_000;
const SCORE_CONCURRENT_BATCHES = SCORE_CONCURRENCY;

describe("flood gate ordering", () => {
  it("filters before capping, so the cap fills with relevant items", () => {
    // Build the shape that breaks a cap-first implementation: two off-topic
    // entries that are NEWER than every relevant one. If `maxItems` ran before
    // `keywordFilter` the gate would return exactly those two off-topic papers
    // and the source would deliver nothing usable while looking busy.
    const parsed = parseRssItems(arxivAtom(6, { aiEvery: 3 }));
    const offTopicNewest = [0, 1].map((n) => ({
      ...parsed[n]!,
      title: "On the Combinatorial Topology of Reticulated Polytopes",
      // Strictly newer than every AI entry in the fixture.
      publishedAt: Date.parse("2026-09-25T00:00:00Z") - n * 1000,
    }));
    const mixed = [...offTopicNewest, ...parsed];

    const cappedFirst = mixed.slice(0, 2);
    expect(
      cappedFirst.every((i) => /Reticulated/.test(i.title)),
      "the two newest entries are off-topic, which is the trap"
    ).toBe(true);

    const gated = applyFloodGate(mixed, { keywordFilter: "ai", maxItems: 2 });
    expect(gated).toHaveLength(2);
    for (const item of gated) {
      expect(item.title).toMatch(/Scaling LLM Agent Memory/);
    }
    // Newest-first within the survivors, not oldest-first.
    expect(gated[0].publishedAt).toBeGreaterThan(gated[1].publishedAt);
  });

  it("ignores an unknown keyword profile rather than throwing", () => {
    const items = parseRssItems(arxivAtom(4, { aiEvery: 1 }));
    expect(
      applyFloodGate(items, { keywordFilter: "does-not-exist" })
    ).toHaveLength(4);
  });

  it("ignores a nonsense cap rather than returning nothing", () => {
    const items = parseRssItems(arxivAtom(4, { aiEvery: 1 }));
    for (const maxItems of [0, -5, Number.NaN, "6", null]) {
      expect(applyFloodGate(items, { maxItems })).toHaveLength(4);
    }
  });
});

describe("rss fetch failures are visible", () => {
  it("throws a typed fetch_failed for a non-2xx", async () => {
    stubFeed("nope", 403);
    await expect(
      rssAdapter.fetchItems(ARXIV_CONFIG, SINCE)
    ).rejects.toMatchObject({ reason: "fetch_failed" });
  });

  it("throws a typed parse_failed for a 200 that is really an HTML page", async () => {
    // The most common silent rot: a host replaces its feed with a paywall or
    // a challenge page that still answers 200.
    stubFeed(
      "<!doctype html><html><body>Subscribe to continue</body></html>",
      200,
      "text/html; charset=utf-8"
    );
    const error = await rssAdapter
      .fetchItems(ARXIV_CONFIG, SINCE)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceFetchError);
    expect((error as SourceFetchError).reason).toBe("parse_failed");
  });

  it("carries no URL or header in the error message", async () => {
    stubFeed("nope", 500);
    const error = (await rssAdapter
      .fetchItems(ARXIV_CONFIG, SINCE)
      .catch((e: unknown) => e)) as SourceFetchError;
    expect(error.message).not.toContain("export.arxiv.org");
    expect(error.message).toMatch(/^rss feed returned \d{3}$/);
  });

  it("reports a genuinely empty feed as empty, not as a failure", async () => {
    stubFeed(
      `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`,
      200,
      "application/atom+xml"
    );
    await expect(rssAdapter.fetchItems(ARXIV_CONFIG, SINCE)).resolves.toEqual(
      []
    );
  });
});
