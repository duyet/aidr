import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addClusterRefs,
  type ClusterRefCounts,
  EMPTY_CLUSTER_REFS,
  nearMissOf,
  parseClusterRefs,
} from "../cluster-refs.js";
import { type Cluster, requestClusters } from "../dedupe.js";
import { resetUnavailableModels } from "../llm.js";
import { buildRunStats, serializeRunStats } from "../run-stats.js";
import { sanitizeRunStatsJson } from "../telemetry-safe.js";
import type { Env } from "../types.js";

/** `normalizeClusters` as of 7a47ffc4: the instrumented parser must keep
 *  exactly these clusters. */
function masterNormalize(
  raw: unknown,
  validNew: ReadonlySet<number>,
  validExisting: ReadonlySet<string>
): Cluster[] {
  if (!raw || typeof raw !== "object" || !("clusters" in raw)) return [];
  const clusters = (raw as { clusters?: unknown }).clusters;
  if (!Array.isArray(clusters)) return [];

  const out: Cluster[] = [];
  for (const entry of clusters) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { new?: unknown; existing?: unknown };
    const newIdx = Array.isArray(e.new)
      ? e.new.filter(
          (v): v is number => typeof v === "number" && validNew.has(v)
        )
      : [];
    const existingIds = Array.isArray(e.existing)
      ? e.existing.filter(
          (v): v is string => typeof v === "string" && validExisting.has(v)
        )
      : [];
    if (newIdx.length + existingIds.length < 2) continue;
    out.push({ new: newIdx, existing: existingIds });
  }
  return out;
}

const env = {
  DB: {} as D1Database,
  ANYROUTER_BASE_URL: "https://anyrouter.test/api/v1",
  ANYROUTER_MODEL: "test/cluster",
  ANYROUTER_API_KEY: "test-key",
} as unknown as Env;

function modelAnswers(content: string) {
  const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const body = frame({ choices: [{ delta: { content } }] });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(`${body}data: [DONE]\n\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
    )
  );
}

/** A 64-hex id, the shape of a real item id (sha256 of the URL). */
const hexId = (seed: number) =>
  Array.from({ length: 64 }, (_, k) =>
    ((seed * 7919 + k * 104_729) % 16).toString(16)
  ).join("");

const A = hexId(1);
const B = hexId(2);
const C = hexId(3);
/** One hex digit of `B` changed. */
const B_TYPO = `${B.slice(0, 20)}${B[20] === "0" ? "1" : "0"}${B.slice(21)}`;
/** The first 12 characters of `C`. */
const C_CUT = C.slice(0, 12);

const newItems = [0, 1, 2, 3].map((i) => ({ i, title: `new ${i}` }));
const existing = [A, B, C].map((id) => ({
  id,
  title: `live ${id.slice(0, 4)}`,
}));

async function served(answer: unknown) {
  modelAnswers(JSON.stringify(answer));
  return requestClusters(env, newItems, existing, {
    task: "cluster",
    existingWindow: "last 72h",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUnavailableModels();
});

describe("requestClusters reference counts", () => {
  it("counts a mistyped id, a truncated id and an out-of-range index, and keeps master's links", async () => {
    const answer = {
      clusters: [
        { new: [0], existing: [A] },
        { new: [1], existing: [B_TYPO] },
        { new: [2], existing: [C_CUT] },
        { new: [3, 9] },
      ],
    };

    const result = await served(answer);

    expect(result.clusters).toEqual([{ new: [0], existing: [A] }]);
    expect(result.clusters).toEqual(
      masterNormalize(answer, new Set([0, 1, 2, 3]), new Set([A, B, C]))
    );
    expect(result.refs).toEqual({
      calls: 1,
      newAnswered: 5,
      newKept: 4,
      existingAnswered: 3,
      existingKept: 1,
      existingNotString: 0,
      existingNearMiss: 2,
      emptied: 3,
    } satisfies ClusterRefCounts);
    // A near miss names the id that was sent, never the model's token.
    expect(result.nearMisses).toEqual([
      { new: [1], existing: B },
      { new: [2], existing: C },
    ]);
  });

  it("counts nothing dropped when every reference is one the prompt sent", async () => {
    const result = await served({
      clusters: [{ new: [0, 1], existing: [A, B] }],
    });

    expect(result.clusters).toEqual([{ new: [0, 1], existing: [A, B] }]);
    expect(result.refs).toEqual({
      ...EMPTY_CLUSTER_REFS,
      calls: 1,
      newAnswered: 2,
      newKept: 2,
      existingAnswered: 2,
      existingKept: 2,
    });
    expect(result.nearMisses).toEqual([]);
  });

  it("counts positions written as existing entries apart from mistyped ids", async () => {
    const result = await served({
      clusters: [{ new: [0], existing: [2, "E2", null] }],
    });

    expect(result.clusters).toEqual([]);
    expect(result.refs).toMatchObject({
      existingAnswered: 3,
      existingKept: 0,
      existingNotString: 2,
      existingNearMiss: 0,
      emptied: 1,
    });
  });

  it("does not count a cluster the model answered with one member as emptied", async () => {
    const result = await served({
      clusters: [{ new: [0] }, { existing: [A] }],
    });

    expect(result.clusters).toEqual([]);
    expect(result.refs.emptied).toBe(0);
  });

  it("keeps master's clusters over a generated mix of well and badly formed answers", async () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    const pool: unknown[] = [
      0,
      1,
      2,
      3,
      7,
      -1,
      "1",
      null,
      2.5,
      A,
      B,
      C,
      B_TYPO,
      C_CUT,
      A.toUpperCase(),
      ` ${A} `,
      "abc123",
      {},
    ];
    const pick = () =>
      Array.from({ length: rand(4) }, () => pool[rand(pool.length)]);
    for (let round = 0; round < 200; round++) {
      const answer = {
        clusters: Array.from({ length: rand(5) }, () =>
          rand(10) === 0
            ? "not a cluster"
            : { new: rand(6) === 0 ? 3 : pick(), existing: pick() }
        ),
      };
      const result = await served(answer);
      expect(result.clusters).toEqual(
        masterNormalize(answer, new Set([0, 1, 2, 3]), new Set([A, B, C]))
      );
      expect(result.refs.existingKept).toBe(
        result.clusters.reduce((n, c) => n + c.existing.length, 0)
      );
    }
  });
});

describe("nearMissOf", () => {
  it("resolves a case or whitespace slip, a short prefix, and two edits", () => {
    expect(nearMissOf(A.toUpperCase(), [B, A])).toBe(A);
    expect(nearMissOf(` ${A}\n`, [A])).toBe(A);
    expect(nearMissOf(A.slice(0, 8), [B, A])).toBe(A);
    expect(nearMissOf(`${A.slice(0, 30)}${A.slice(32)}`, [A])).toBe(A);
  });

  it("resolves nothing for a 7-character prefix, three edits, or another id", () => {
    expect(nearMissOf(A.slice(0, 7), [A])).toBeNull();
    expect(nearMissOf(`${A.slice(0, 30)}${A.slice(33)}`, [A])).toBeNull();
    expect(nearMissOf(C, [A, B])).toBeNull();
  });
});

describe("cluster reference tallies in run stats", () => {
  it("survives the stats sanitizer as numbers", () => {
    const refs = {
      "google/gemma-latest": {
        ...EMPTY_CLUSTER_REFS,
        calls: 1,
        existingAnswered: 4,
        existingKept: 1,
        existingNearMiss: 3,
        emptied: 2,
      },
    };
    const stored = JSON.parse(
      sanitizeRunStatsJson(
        serializeRunStats(buildRunStats({ clusterRefs: refs }))
      )
    );

    expect(stored.clusterRefs).toEqual(refs);
    expect(parseClusterRefs(JSON.stringify(stored.clusterRefs))).toEqual(refs);
  });

  it("adds per model and reads malformed values as nothing", () => {
    const one = { ...EMPTY_CLUSTER_REFS, calls: 1, existingKept: 2 };
    expect(addClusterRefs(one, one)).toEqual({
      ...one,
      calls: 2,
      existingKept: 4,
    });
    expect(parseClusterRefs("not json")).toEqual({});
    expect(parseClusterRefs({ m: { calls: "x" } })).toEqual({});
    expect(buildRunStats({ clusterRefs: {} })).not.toHaveProperty(
      "clusterRefs"
    );
  });
});
