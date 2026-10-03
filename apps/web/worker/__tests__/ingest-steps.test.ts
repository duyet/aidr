import { describe, expect, it } from "vitest";
import { chunk } from "../chunk.js";
import type { CanonicalUpdate, MergePlan } from "../dedupe.js";
import {
  backfillSourceLang,
  backfillTranslateSummary,
  sliceOffsets,
  uniqueById,
} from "../ingest/backfill.js";
import type { NewRow, SourceRow } from "../ingest/context.js";
import {
  BACKFILL_TRANSLATE_STEP,
  LLM_STEP,
  RELEVANCE_THRESHOLD,
} from "../ingest/context.js";
import { TRANSLATE_TIMEOUT_MS } from "../llm.js";
import { pendingRowToNewRow } from "../ingest/dedupe.js";
import { applyEnrichment } from "../ingest/enrich.js";
import { enabledSourcesOf, seedSourceHealth } from "../ingest/fetch.js";
import {
  buildMergeCandidates,
  EMPTY_MERGE_PLAN,
  restoreMergePlan,
  serializeMergePlan,
} from "../ingest/merge.js";
import { notifyStepSummary } from "../ingest/publish.js";
import { qaStepSummary } from "../ingest/reviews.js";
import {
  type ItemScore,
  keyResultsById,
  tallyScored,
} from "../ingest/score.js";
import {
  previousHealthFromStreaks,
  resolveSkipReasons,
  tallySourceOutcomes,
} from "../ingest/source-health.js";
import {
  selectPublishedRows,
  translateStepSummary,
} from "../ingest/translate.js";
import {
  itemStatus,
  parseTagsJson,
  persistedViTranslation,
  planExistingCanonicalMedia,
  planNewItemWrite,
} from "../ingest/write-plan.js";
import { rankScore } from "../ranking.js";
import { emptySourceHealth, type SourceRunHealth } from "../source-health.js";

const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const NOW_SEC = NOW / 1000;

function source(id: string, enabled = 1): SourceRow {
  return { id, type: "rss", config: "{}", enabled };
}

function row(id: string, sourceId = "hn", patch: Partial<NewRow["item"]> = {}) {
  return {
    id,
    source: source(sourceId),
    item: {
      url: `https://example.com/${id}`,
      title: `Title ${id}`,
      publishedAt: NOW_SEC - 3600,
      ...patch,
    },
  } satisfies NewRow;
}

function score(relevance: number, patch: Partial<ItemScore> = {}): ItemScore {
  return {
    i: 0,
    relevance,
    importance: 7,
    quality: 7,
    category: "research",
    tags: ["llm"],
    tokens: 10,
    ...patch,
  };
}

function plan(
  merged: Record<string, string> = {},
  canonicalUpdates: Record<string, CanonicalUpdate> = {}
): MergePlan {
  return {
    merged: new Map(
      Object.entries(merged).map(([id, duplicateOf]) => [id, { duplicateOf }])
    ),
    canonicalUpdates: new Map(Object.entries(canonicalUpdates)),
    demoted: new Map(),
  };
}

function update(patch: Partial<CanonicalUpdate> = {}): CanonicalUpdate {
  return {
    isExisting: false,
    extraSources: [],
    extraTopics: [],
    maxPoints: 0,
    maxComments: 0,
    ...patch,
  };
}

describe("fetch helpers", () => {
  it("seeds disabled sources with an explicit reason so the dashboard never shows a blank cell", () => {
    const health: Record<string, SourceRunHealth> = {};
    seedSourceHealth(health, [source("on"), source("off", 0)]);
    expect(health.on).toEqual(emptySourceHealth());
    expect(health.off.skipReason).toBe("disabled");
  });

  it("only fetches enabled sources", () => {
    expect(
      enabledSourcesOf([source("a"), source("b", 0)]).map((s) => s.id)
    ).toEqual(["a"]);
  });

  it("chunks in order without dropping a tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 4)).toEqual([]);
  });
});

describe("pendingRowToNewRow", () => {
  const pending = {
    id: "p1",
    source_id: "gone",
    external_id: null,
    url: "https://example.com/p1",
    title: "Submitted",
    summary: null,
    published_at: NOW_SEC,
    points: 0,
    comments: 0,
    image_url: null,
    source_lang: "vi" as const,
    media_manifest: null,
  };

  it("keeps a submission whose source row was deleted, via a stand-in source", () => {
    const out = pendingRowToNewRow(pending, [source("hn")]);
    expect(out.source).toEqual({
      id: "gone",
      type: "unknown",
      config: "{}",
      enabled: 1,
    });
    // VI language survives so the write step can store a native VI title.
    expect(out.item.sourceLang).toBe("vi");
    expect(out.item.summary).toBeUndefined();
  });

  it("uses the real source when it still exists", () => {
    const hn = source("hn");
    expect(
      pendingRowToNewRow({ ...pending, source_id: "hn" }, [hn]).source
    ).toBe(hn);
  });
});

describe("applyEnrichment", () => {
  it("never blanks a fetched field the enricher did not produce", () => {
    const rows = [row("a", "hn", { summary: "orig", imageUrl: "https://i/a" })];
    const out = applyEnrichment(rows, [{ id: "a" }]);
    expect(out[0].item.summary).toBe("orig");
    expect(out[0].item.imageUrl).toBe("https://i/a");
  });

  it("fills enriched fields and leaves rows without a diff untouched", () => {
    const rows = [row("a"), row("b")];
    const out = applyEnrichment(rows, [{ id: "a", summary: "from og" }]);
    expect(out[0].item.summary).toBe("from og");
    expect(out[1]).toBe(rows[1]);
    // The input rows are not mutated: the diff is folded outside the step.
    expect(rows[0].item.summary).toBeUndefined();
  });
});

describe("keyResultsById", () => {
  it("drops results whose index was never requested instead of misattributing them", () => {
    const map = keyResultsById(
      [{ id: "a" }, { id: "b" }],
      [
        { i: 1, v: "b" },
        { i: 7, v: "ghost" },
      ]
    );
    expect([...map.entries()]).toEqual([["b", { i: 1, v: "b" }]]);
  });
});

describe("merge plan serialization", () => {
  it("survives a JSON round trip, which is how Workflow replays step results", () => {
    const original = plan({ b: "a" }, { a: update({ maxPoints: 9 }) });
    const replayed = restoreMergePlan(
      JSON.parse(JSON.stringify(serializeMergePlan(original)))
    );
    expect(replayed.merged.get("b")).toEqual({ duplicateOf: "a" });
    expect(replayed.canonicalUpdates.get("a")?.maxPoints).toBe(9);
  });

  it("passes a live plan through and treats missing data as empty", () => {
    const live = plan({ x: "y" });
    expect(restoreMergePlan(live)).toBe(live);
    expect(restoreMergePlan(undefined).merged.size).toBe(0);
    expect(
      restoreMergePlan(JSON.parse(JSON.stringify(EMPTY_MERGE_PLAN))).merged.size
    ).toBe(0);
  });
});

describe("buildMergeCandidates", () => {
  it("ranks an unscored item on neutral 5/5 so it can still compete in a cluster", () => {
    const rows = [row("a", "hn", { points: 10 }), row("b")];
    const [a, b] = buildMergeCandidates(
      rows,
      new Map([["b", score(0.9, { importance: 9, quality: 9 })]]),
      new Map([["a", ["agents"]]]),
      NOW
    );
    expect(a).toMatchObject({ i: 0, id: "a", points: 10, topics: ["agents"] });
    expect(a.rank).toBe(
      rankScore({
        importance: 5,
        quality: 5,
        points: 10,
        comments: 0,
        publishedAt: rows[0].item.publishedAt * 1000,
        now: NOW,
        sourceCount: 0,
      })
    );
    expect(b.rank).toBe(
      rankScore({
        importance: 9,
        quality: 9,
        points: 0,
        comments: 0,
        publishedAt: rows[1].item.publishedAt * 1000,
        now: NOW,
        sourceCount: 0,
      })
    );
    expect(b.topics).toBeUndefined();
  });
});

describe("selectPublishedRows", () => {
  const rows = [row("keep"), row("low"), row("dup"), row("unscored")];
  const scored = new Map([
    ["keep", score(RELEVANCE_THRESHOLD)],
    ["low", score(RELEVANCE_THRESHOLD - 0.01)],
    ["dup", score(0.9)],
  ]);

  it("publishes at the threshold, rejects below it, and never re-publishes a merged dupe", () => {
    const ids = selectPublishedRows(rows, scored, plan({ dup: "keep" })).map(
      (r) => r.id
    );
    expect(ids).toEqual(["keep", "unscored"]);
  });

  it("publishes an unscored item rather than losing it when the score step failed", () => {
    expect(
      selectPublishedRows([row("u")], new Map(), plan()).map((r) => r.id)
    ).toEqual(["u"]);
  });
});

describe("translateStepSummary", () => {
  it("distinguishes nothing-to-do from a failed batch on the runs dashboard", () => {
    expect(translateStepSummary(0, 0, 0).detail).toBe("no new items");
    expect(translateStepSummary(3, 0, 0).detail).toBe(
      "no items cleared the relevance threshold"
    );
    expect(translateStepSummary(3, 2, 0).detail).toMatch(/batch_failed/);
    expect(translateStepSummary(3, 2, 1)).toEqual({
      summary: "translated 1/2 items",
      detail: "partial 1/2",
    });
    expect(translateStepSummary(3, 2, 2).detail).toBeUndefined();
  });
});

describe("per-source health", () => {
  it("counts scored only for items the scorer actually returned", () => {
    const health = { hn: emptySourceHealth() };
    tallyScored(
      health,
      [row("a"), row("b"), row("c", "gone")],
      new Map([["a", 1]])
    );
    expect(health.hn.scored).toBe(1);
  });

  it("partitions every new row into exactly one of merged / accepted / rejected", () => {
    const health = { hn: emptySourceHealth() };
    const rows = [row("m"), row("p"), row("r")];
    tallySourceOutcomes(health, rows, [rows[1]], plan({ m: "p" }));
    expect(health.hn).toMatchObject({ merged: 1, accepted: 1, rejected: 1 });
  });

  it("keeps `disabled` and explains fetch failures for empty sources", () => {
    const health = {
      off: { ...emptySourceHealth(), skipReason: "disabled" as const },
      broken: emptySourceHealth(),
      fine: { ...emptySourceHealth(), fetched: 3, accepted: 1 },
    };
    resolveSkipReasons(health, new Map([["broken", "fetch_failed" as const]]));
    expect(health.off.skipReason).toBe("disabled");
    expect(health.broken.skipReason).toBe("fetch_failed");
    expect(health.fine.skipReason).toBe("");
  });

  it("rehydrates only the emptyRuns streak from the previous run", () => {
    expect(previousHealthFromStreaks({ hn: 4 })).toEqual({
      hn: { ...emptySourceHealth(), emptyRuns: 4 },
    });
  });
});

describe("itemStatus", () => {
  it("lets a merge win over relevance, then applies the hide rule", () => {
    expect(itemStatus({ duplicateOf: "x" }, 0.99)).toBe("merged");
    expect(itemStatus(undefined, RELEVANCE_THRESHOLD)).toBe("published");
    expect(itemStatus(undefined, RELEVANCE_THRESHOLD - 0.01)).toBe("rejected");
  });
});

describe("persistedViTranslation", () => {
  const en = { title: "Hello", summary: "World", sourceLang: "en" as const };
  const vi = {
    title: " Xin chào ",
    summary: " Tóm tắt ",
    sourceLang: "vi" as const,
  };

  it("never writes a translation row for rejected or merged items", () => {
    const t = { title: "Chào", summary: "" };
    expect(persistedViTranslation("rejected", en, t)).toBeNull();
    expect(persistedViTranslation("merged", vi, undefined)).toBeNull();
  });

  it("prefers the LLM translation, else stores a VI source's own title so it has no EN badge", () => {
    expect(
      persistedViTranslation("published", vi, { title: "LLM", summary: "" })
    ).toEqual({ title: "LLM", summary: "" });
    expect(persistedViTranslation("published", vi, undefined)).toEqual({
      title: "Xin chào",
      summary: "Tóm tắt",
    });
  });

  it("leaves an untranslated EN item empty for backfill instead of guessing", () => {
    expect(persistedViTranslation("published", en, undefined)).toBeNull();
    expect(
      persistedViTranslation("published", en, { title: "", summary: "x" })
    ).toBeNull();
  });
});

describe("planNewItemWrite", () => {
  it("falls back to neutral scores when unscored and still publishes", () => {
    const out = planNewItemWrite({
      sourceId: "hn",
      item: row("a").item,
      score: undefined,
      translation: undefined,
      mergeEntry: undefined,
      canonicalUpdate: undefined,
      canonicalTags: undefined,
      now: NOW,
    });
    expect(out.status).toBe("published");
    expect(out.score).toBeUndefined();
    expect(out.llmTokens).toBe(0);
    expect(out.writeSources).toBe(false);
  });

  it("makes a new canonical absorb its cluster's engagement, sources and topics", () => {
    const base = {
      sourceId: "hn",
      item: row("a", "hn", {
        points: 1,
        sources: [{ kind: "source" as const, url: "https://a" }],
      }).item,
      score: score(0.9, { tags: ["raw"] }),
      translation: { i: 0, title: "T", summary: "S", tokens: 5 },
      mergeEntry: undefined,
      canonicalTags: ["llm"],
      now: NOW,
    };
    const alone = planNewItemWrite({ ...base, canonicalUpdate: undefined });
    const absorbed = planNewItemWrite({
      ...base,
      canonicalUpdate: update({
        maxPoints: 50,
        maxComments: 7,
        extraTopics: ["agents"],
        extraSources: [{ kind: "discussion", url: "https://b" }],
        members: [{ sourceId: "techcrunch-ai", points: 0, comments: 0 }],
      }),
    });
    expect(absorbed.item.points).toBe(50);
    expect(absorbed.item.comments).toBe(7);
    expect(absorbed.item.sources).toHaveLength(2);
    expect(absorbed.score?.tags).toEqual(["llm", "agents"]);
    // More engagement + corroboration must rank the canonical higher.
    expect(absorbed.rank).toBeGreaterThan(alone.rank);
    expect(absorbed.llmTokens).toBe(15);
    expect(absorbed.writeSources).toBe(true);
    // Stored tags are the canonical topics, not the scorer's raw tags.
    expect(alone.score?.tags).toEqual(["llm"]);
  });

  it("ignores an update targeting an existing item (handled separately)", () => {
    const out = planNewItemWrite({
      sourceId: "hn",
      item: row("a", "hn", { points: 1 }).item,
      score: score(0.9),
      translation: undefined,
      mergeEntry: undefined,
      canonicalUpdate: update({ isExisting: true, maxPoints: 99 }),
      canonicalTags: [],
      now: NOW,
    });
    expect(out.item.points).toBe(1);
  });

  it("does not rewrite item_sources for a merged row", () => {
    const out = planNewItemWrite({
      sourceId: "hn",
      item: row("a", "hn", {
        sources: [{ kind: "source", url: "https://a" }],
      }).item,
      score: score(0.9),
      translation: undefined,
      mergeEntry: { duplicateOf: "b" },
      canonicalUpdate: undefined,
      canonicalTags: [],
      now: NOW,
    });
    expect(out.status).toBe("merged");
    expect(out.writeSources).toBe(false);
  });
});

describe("existing canonical merge", () => {
  it("treats malformed stored tags as empty so the union still works", () => {
    expect(parseTagsJson("not json")).toEqual([]);
    expect(parseTagsJson('{"a":1}')).toEqual([]);
    expect(parseTagsJson(null)).toEqual([]);
    expect(parseTagsJson('["a"]')).toEqual(["a"]);
  });

  it("does not let a legacy fallback image displace an existing thumbnail", () => {
    const out = planExistingCanonicalMedia(
      {
        tags: '["llm"]',
        url: "https://example.com/story",
        image_url: "https://cdn.example.com/real.png",
        media_manifest: null,
      },
      update({
        extraTopics: ["agents"],
        extraImageUrls: ["https://cdn.example.com/fallback.png"],
      })
    );
    expect(out.topics).toEqual(["llm", "agents"]);
    expect(out.imageUrl).toBe("https://cdn.example.com/real.png");
    expect(out.manifest.assets.some((a) => a.url.includes("fallback"))).toBe(
      false
    );
  });

  it("uses a legacy fallback image when the canonical has none", () => {
    const out = planExistingCanonicalMedia(
      {
        tags: null,
        url: "https://example.com/story",
        image_url: null,
        media_manifest: null,
      },
      update({ extraImageUrls: ["https://cdn.example.com/fallback.png"] })
    );
    expect(out.imageUrl).toBe("https://cdn.example.com/fallback.png");
  });
});

describe("backfill helpers", () => {
  it("backfills an item missing both summary and media only once", () => {
    expect(
      uniqueById([
        { id: "a", n: 1 },
        { id: "b", n: 2 },
        { id: "a", n: 3 },
      ])
    ).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 2 },
    ]);
  });

  it("gives every slice a stable offset (each names its own durable step)", () => {
    expect(sliceOffsets(7, 3)).toEqual([0, 3, 6]);
    expect(sliceOffsets(0, 3)).toEqual([]);
  });

  it("only flips translation direction for an explicit vi source", () => {
    expect(backfillSourceLang("vi")).toBe("vi");
    expect(backfillSourceLang("")).toBe("en");
    expect(backfillSourceLang("fr")).toBe("en");
  });

  it("flags a batch failure only when there was something to translate", () => {
    expect(backfillTranslateSummary(0, 0)).toEqual({
      summary: "0 candidates",
      detail: undefined,
    });
    expect(backfillTranslateSummary(4, 0).detail).toMatch(/batch_failed/);
    expect(backfillTranslateSummary(4, 2)).toEqual({
      summary: "translated 2 summaries",
      detail: undefined,
    });
  });
});

describe("run-step summaries", () => {
  it("surfaces a QA error over the counts", () => {
    expect(
      qaStepSummary({
        rated: 3,
        adjusted: 1,
        tokens: 0,
        error: "review failed",
      })
    ).toBe("review failed");
    expect(qaStepSummary({ rated: 0, adjusted: 0, tokens: 0, error: "" })).toBe(
      "0 pending translations"
    );
    expect(qaStepSummary({ rated: 3, adjusted: 1, tokens: 0 })).toBe(
      "rated 3 translations, adjusted 1"
    );
  });

  it("reports notify as skipped only when no channel sent anything", () => {
    expect(notifyStepSummary({})).toBe("skipped");
    expect(notifyStepSummary({ telegram: 0 })).toBe("skipped");
    expect(notifyStepSummary({ telegram: 2, email: 1 })).toBe(
      "telegram: 2, email: 1"
    );
  });
});

/** Workflow `step.do` timeout strings: "<n> <unit>". */
function stepTimeoutMs(timeout: string): number {
  const match = /^(\d+) (seconds|minutes|hours)$/.exec(timeout);
  if (!match) throw new Error(`unparsed step timeout: ${timeout}`);
  const n = Number(match[1]);
  const unit = match[2];
  if (unit === "seconds") return n * 1000;
  if (unit === "minutes") return n * 60_000;
  return n * 3_600_000;
}

describe("translate step timeouts", () => {
  // A step killed at or before TRANSLATE_TIMEOUT_MS drops the whole
  // translateItems batch: the engine wins the race, D1 never sees the rows,
  // and the next run retries the same slice (issue #355).
  it("outlives translateItems so the D1 upsert after it can run", () => {
    for (const config of [BACKFILL_TRANSLATE_STEP, LLM_STEP]) {
      expect(stepTimeoutMs(config.timeout)).toBeGreaterThan(
        TRANSLATE_TIMEOUT_MS
      );
    }
  });
});
