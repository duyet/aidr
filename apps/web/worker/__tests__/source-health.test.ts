import { describe, expect, it } from "vitest";
import {
  type IngestSourceRow,
  mergeSourceHealth,
  parseRunSourceHealth,
  SOURCE_SKIP_REASONS as READ_MODEL_SKIP_REASONS,
  sourceStaleThreshold,
} from "../../src/lib/system-queries.js";
import {
  carrySourceEmptyRuns,
  DEFAULT_STALE_AFTER_RUNS,
  describeSkipReason,
  emptySourceHealth,
  isSourceStale,
  nextEmptyRuns,
  parsePreviousEmptyRuns,
  parseSourceHealth,
  resolveSkipReason,
  type SourceRunHealth,
  sourceStaleVerdict,
  staleAfterRunsFor,
} from "../source-health.js";
import { SOURCE_REGISTRY } from "../sources/catalog.js";

/** The lowest value any future per-source `staleAfterRuns` override may take
 *  without re-deriving the measurement. arXiv freezes across a weekend for
 *  ~108 consecutive runs at a 30-minute cadence, so anything at or below that would flag a
 *  healthy arXiv row every weekend. */
const ARXIV_MIN_OVERRIDE = 144;

function health(patch: Partial<SourceRunHealth> = {}): SourceRunHealth {
  return { ...emptySourceHealth(), ...patch };
}

function ingestRow(patch: Partial<IngestSourceRow> = {}): IngestSourceRow {
  return {
    id: "hn",
    name: "Hacker News",
    type: "hn",
    enabled: true,
    itemCount: 10,
    lastItemAt: 1790500000,
    config: {},
    ...patch,
  };
}

describe("skip reasons", () => {
  it("reports a transport failure, a bad body, and a quiet feed differently", () => {
    expect(
      resolveSkipReason({
        failure: "fetch_failed",
        fetched: 0,
        newItems: 0,
        rejected: 0,
      })
    ).toBe("fetch_failed");
    expect(
      resolveSkipReason({
        failure: "parse_failed",
        fetched: 0,
        newItems: 0,
        rejected: 0,
      })
    ).toBe("parse_failed");
    // Adapter returned [] without throwing: the feed parsed, it was just quiet.
    expect(resolveSkipReason({ fetched: 0, newItems: 0, rejected: 0 })).toBe(
      "empty"
    );
  });

  it("calls out a source whose every item fell below the relevance floor", () => {
    expect(resolveSkipReason({ fetched: 9, newItems: 9, rejected: 9 })).toBe(
      "all_rejected_below_relevance"
    );
    // One item got through → the source is working, however noisy.
    expect(resolveSkipReason({ fetched: 9, newItems: 9, rejected: 8 })).toBe(
      ""
    );
    // Delivered items but all already in the DB: not a rejection, not silence.
    expect(resolveSkipReason({ fetched: 20, newItems: 0, rejected: 0 })).toBe(
      ""
    );
  });

  it("never invents a reason for a source that delivered items", () => {
    expect(resolveSkipReason({ fetched: 3, newItems: 3, rejected: 0 })).toBe(
      ""
    );
  });

  it("has a human label for every enum value", () => {
    for (const reason of [
      "fetch_failed",
      "parse_failed",
      "empty",
      "all_rejected_below_relevance",
      "disabled",
    ] as const) {
      expect(describeSkipReason(reason).length).toBeGreaterThan(0);
    }
    expect(describeSkipReason("")).toBe("");
  });
});

describe("per-source stats parsing", () => {
  it("reads a well-formed record", () => {
    expect(
      parseSourceHealth({
        fetched: 4,
        scored: 2,
        accepted: 1,
        rejected: 1,
        merged: 0,
        skipReason: "",
        emptyRuns: 0,
      })
    ).toEqual({
      fetched: 4,
      scored: 2,
      accepted: 1,
      rejected: 1,
      merged: 0,
      skipReason: "",
      emptyRuns: 0,
    });
  });

  it("rejects a non-record and repairs a partially-written one", () => {
    expect(parseSourceHealth(null)).toBeNull();
    expect(parseSourceHealth([])).toBeNull();
    expect(parseSourceHealth("nope")).toBeNull();
    const repaired = parseSourceHealth({ fetched: 3, skipReason: "bogus" });
    expect(repaired).toMatchObject({ fetched: 3, skipReason: "", scored: 0 });
  });

  it("does the same on the web read model side", () => {
    expect(parseRunSourceHealth({ fetched: 2 })).toMatchObject({
      fetched: 2,
      skipReason: "",
    });
    expect(parseRunSourceHealth({ skipReason: "fetch_failed" })).toMatchObject({
      skipReason: "fetch_failed",
    });
    expect(parseRunSourceHealth(undefined)).toBeNull();
    expect(parseRunSourceHealth({ fetched: "many" })).toMatchObject({
      fetched: 0,
    });
  });
});

describe("empty-run streak", () => {
  it("resets on any delivered item and increments on silence", () => {
    expect(nextEmptyRuns(9, 1)).toBe(0);
    expect(nextEmptyRuns(0, 0)).toBe(1);
    expect(nextEmptyRuns(41, 0)).toBe(42);
    // A garbage carry can never produce a negative or fractional streak, and
    // this run still counts as one empty run.
    expect(nextEmptyRuns(-3, 0)).toBe(1);
    expect(nextEmptyRuns(1.7, 0)).toBe(2);
  });

  it("carries streaks forward per source and starts newcomers at zero", () => {
    const current = {
      hn: health({ fetched: 5 }),
      arxiv: health({ fetched: 0, skipReason: "empty" }),
      "vnexpress-tech": health({ fetched: 0, skipReason: "empty" }),
    };
    const previous = {
      hn: health({ fetched: 0, emptyRuns: 3 }),
      arxiv: health({ fetched: 0, emptyRuns: 70 }),
    };
    const carried = carrySourceEmptyRuns(current, previous);
    expect(carried.hn.emptyRuns).toBe(0);
    expect(carried.arxiv.emptyRuns).toBe(71);
    // No history for a brand-new source row → start at 1, not at another
    // source's streak.
    expect(carried["vnexpress-tech"].emptyRuns).toBe(1);
    expect(carried.arxiv.skipReason).toBe("empty");
  });

  it("reads the previous run's streaks out of a stats blob", () => {
    expect(
      parsePreviousEmptyRuns(
        JSON.stringify({
          bySource: { hn: 1 },
          sourceHealth: { hn: { emptyRuns: 12 }, arxiv: { emptyRuns: 5 } },
        })
      )
    ).toEqual({ hn: 12, arxiv: 5 });
    // Pre-#230 run: no sourceHealth key at all.
    expect(
      parsePreviousEmptyRuns(JSON.stringify({ bySource: { hn: 1 } }))
    ).toEqual({});
    expect(parsePreviousEmptyRuns("not json")).toEqual({});
    expect(parsePreviousEmptyRuns(null)).toEqual({});
  });
});

describe("stale detector", () => {
  it("flags a source only once it passes its own threshold", () => {
    expect(isSourceStale(health({ emptyRuns: 47 }), "hn")).toBe(false);
    expect(isSourceStale(health({ emptyRuns: 48 }), "hn")).toBe(false);
    expect(
      isSourceStale(health({ emptyRuns: 335 }), "hn"),
      "the documented default is 336 consecutive runs (7 days at the 30-minute cadence)"
    ).toBe(false);
    expect(isSourceStale(health({ emptyRuns: 336 }), "hn")).toBe(true);
  });

  it("never calls a disabled source stale", () => {
    // `off` is a decision, not a fault. Flagging it would train an operator to
    // ignore the alarm.
    expect(
      isSourceStale(health({ emptyRuns: 9999, skipReason: "disabled" }), "hn")
    ).toBe(false);
  });

  it("keeps the default above the quietest real feed in the registry", () => {
    // 14 of the 21 registry feeds returned nothing inside the 26h window when
    // the live verifier ran (11 of them pre-existing, e.g. lastweekin-ai is a
    // weekly newsletter and google-research publishes a few times a week).
    // A 48-run default — the "e.g." in the issue — would have flagged most of
    // them as broken on a quiet weekend. This test pins that reasoning to the
    // number so a future "let's make the alarm more sensitive" change has to
    // confront it.
    expect(DEFAULT_STALE_AFTER_RUNS).toBe(336);
    expect(DEFAULT_STALE_AFTER_RUNS).toBeGreaterThan(ARXIV_MIN_OVERRIDE);
  });

  it("gives arXiv the lower weekend-safe threshold and every other row the default", () => {
    // arXiv accepts no weekend submissions, leaving ~108 consecutive silent
    // runs every weekend at a 30-minute cadence, so the documented 144 clears
    // that and the 336 default would be needlessly slow while 48 would false-positive.
    // Every registry row gets its own documented threshold, else the default.
    for (const spec of SOURCE_REGISTRY) {
      expect(staleAfterRunsFor(spec.id)).toBe(
        spec.staleAfterRuns ?? DEFAULT_STALE_AFTER_RUNS
      );
    }
    expect(staleAfterRunsFor("techcrunch-ai")).toBe(DEFAULT_STALE_AFTER_RUNS);
    // An operator-added source that is not in the registry still gets the
    // documented default rather than an undefined threshold.
    expect(staleAfterRunsFor("some-operator-source")).toBe(
      DEFAULT_STALE_AFTER_RUNS
    );
    // The floor any future arXiv override has to clear.
    expect(ARXIV_MIN_OVERRIDE).toBeGreaterThan(108);
  });

  it("keeps the read model's thresholds in step with the worker", () => {
    for (const spec of SOURCE_REGISTRY) {
      expect(sourceStaleThreshold(spec.id)).toBe(staleAfterRunsFor(spec.id));
    }
  });

  it("reports the streak and threshold together for the dashboard", () => {
    expect(sourceStaleVerdict(health({ emptyRuns: 400 }), "hn")).toEqual({
      stale: true,
      emptyRuns: 400,
      threshold: 336,
    });
  });

  it("does not call the push source stale, and still flags a silent feed", () => {
    // `user` is type `push`: no adapter on purpose, items arrive through
    // submissions. A fetch of 0 is honest and must not become a stale alarm.
    // `arstechnica-ai` is a real feed; the same streak is still rot.
    const past = DEFAULT_STALE_AFTER_RUNS + 100;
    expect(sourceStaleVerdict(health({ emptyRuns: past }), "user")).toEqual({
      stale: false,
      emptyRuns: past,
      threshold: DEFAULT_STALE_AFTER_RUNS,
    });
    expect(
      sourceStaleVerdict(health({ emptyRuns: past }), "arstechnica-ai")
    ).toEqual({
      stale: true,
      emptyRuns: past,
      threshold: DEFAULT_STALE_AFTER_RUNS,
    });
  });
});

describe("read-model merge", () => {
  it("keeps disabled, observed, and unknown as three distinct states", () => {
    const sources = [
      ingestRow({ id: "hn" }),
      ingestRow({ id: "off-source", enabled: false }),
      ingestRow({ id: "no-stats-source" }),
    ];
    const { health: merged, stale } = mergeSourceHealth(sources, {
      sourceHealth: { hn: { ...emptySourceHealth(), emptyRuns: 3 } },
    });
    expect(merged.hn).toMatchObject({
      observed: true,
      emptyRuns: 3,
      stale: false,
      staleAfterRuns: 336,
    });
    expect(merged["off-source"]).toMatchObject({
      observed: true,
      skipReason: "disabled",
      stale: false,
    });
    // A source the last run said nothing about is UNKNOWN, not "0 items".
    // Rendering it as 0 is the lie that made rot invisible.
    expect(merged["no-stats-source"]).toMatchObject({
      observed: false,
      fetched: 0,
      skipReason: "",
    });
    expect(stale).toEqual([]);
  });

  it("flags the stale ids and leaves the rest out", () => {
    const sources = [
      ingestRow({ id: "hn" }),
      ingestRow({ id: "dead-feed" }),
      ingestRow({ id: "off-source", enabled: false }),
    ];
    const { stale } = mergeSourceHealth(sources, {
      sourceHealth: {
        hn: { ...emptySourceHealth(), fetched: 4 },
        "dead-feed": {
          ...emptySourceHealth(),
          emptyRuns: 336,
          skipReason: "fetch_failed",
        },
        "off-source": {
          ...emptySourceHealth(),
          emptyRuns: 5000,
          skipReason: "disabled",
        },
      },
    });
    expect(stale).toEqual(["dead-feed"]);
  });

  it("treats a run with no sourceHealth at all as unknown, not as a mass failure", () => {
    const { health: merged, stale } = mergeSourceHealth(
      [ingestRow({ id: "hn" })],
      null
    );
    expect(merged.hn.observed).toBe(false);
    expect(stale).toEqual([]);
  });

  it("treats an unparseable health value as unknown", () => {
    const { health: merged } = mergeSourceHealth([ingestRow({ id: "hn" })], {
      sourceHealth: { hn: "corrupted" as never },
    });
    expect(merged.hn.observed).toBe(false);
  });

  it("never emits a skip reason outside the shared enum", () => {
    const { health: merged } = mergeSourceHealth([ingestRow({ id: "hn" })], {
      sourceHealth: {
        hn: { ...emptySourceHealth(), skipReason: "boom" as never },
      },
    });
    expect(merged.hn).toMatchObject({ observed: true, skipReason: "" });
    expect(READ_MODEL_SKIP_REASONS).toContain("fetch_failed");
  });
});
