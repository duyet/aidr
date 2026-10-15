import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addClusterRefs,
  type ClusterRefCounts,
  EMPTY_CLUSTER_REFS,
  parseClusterRefs,
} from "../cluster-refs.js";
import { type Cluster, clusterPrompt, requestClusters } from "../dedupe.js";
import { resetUnavailableModels } from "../llm.js";
import { buildRunStats, serializeRunStats } from "../run-stats.js";
import { sanitizeRunStatsJson } from "../telemetry-safe.js";
import type { Env } from "../types.js";

/** The parser's contract: an `existing` entry links a row only when it is
 *  exactly the alias the prompt gave that row (`E1` for the first sent). */
function referenceNormalize(
  raw: unknown,
  validNew: ReadonlySet<number>,
  sentIds: readonly string[]
): Cluster[] {
  const byAlias = new Map(sentIds.map((id, k) => [`E${k + 1}`, id]));
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
      ? e.existing.flatMap((v) => {
          const id = typeof v === "string" ? byAlias.get(v) : undefined;
          return id === undefined ? [] : [id];
        })
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

/** Answers every call with `content`; returns the prompts it was sent. */
function modelAnswers(content: string): string[] {
  const prompts: string[] = [];
  const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const body = frame({ choices: [{ delta: { content } }] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: { content: string }[];
      };
      prompts.push(request.messages[0].content);
      return new Response(`${body}data: [DONE]\n\n`, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    })
  );
  return prompts;
}

/** A 64-hex id, the shape of a real item id (sha256 of the URL). */
const hexId = (seed: number) =>
  Array.from({ length: 64 }, (_, k) =>
    ((seed * 7919 + k * 104_729) % 16).toString(16)
  ).join("");

const A = hexId(1);
const B = hexId(2);
const C = hexId(3);
const HEX_ID = /[0-9a-f]{64}/;

const newItems = [0, 1, 2, 3].map((i) => ({ i, title: `new ${i}` }));
const existing = [A, B, C].map((id) => ({
  id,
  title: `live ${id.slice(0, 4)}`,
}));

async function served(answer: unknown) {
  const prompts = modelAnswers(JSON.stringify(answer));
  const result = await requestClusters(env, newItems, existing, {
    task: "cluster",
    existingWindow: "last 72h",
  });
  return { ...result, prompts };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUnavailableModels();
});

describe("cluster prompt aliases", () => {
  it("names existing rows E1..En in the order sent, with no 64-hex id anywhere", async () => {
    const { prompts } = await served({ clusters: [] });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toMatch(HEX_ID);
    expect(prompts[0]).toContain(
      JSON.stringify(
        existing.map((row, k) => ({ id: `E${k + 1}`, title: row.title }))
      )
    );
    // The answer example uses the alias form the parser accepts.
    expect(prompts[0]).toContain(
      '{"clusters":[{"new":[0,3],"existing":["E1"]}]}'
    );
    expect(prompts[0]).toBe(clusterPrompt(newItems, existing, "last 72h"));
  });

  it("maps each alias answered back to the id sent in that position", async () => {
    const result = await served({
      clusters: [
        { new: [0], existing: ["E2"] },
        { new: [1, 2], existing: ["E3", "E1"] },
      ],
    });

    expect(result.clusters).toEqual([
      { new: [0], existing: [B] },
      { new: [1, 2], existing: [C, A] },
    ]);
    expect(result.refs).toMatchObject({
      existingAnswered: 3,
      existingKept: 3,
      existingNearMiss: 0,
      emptied: 0,
    });
  });
});

describe("requestClusters reference counts", () => {
  it("drops and counts an alias never sent, a case or space slip, and a full id", async () => {
    const answer = {
      clusters: [
        { new: [0], existing: ["E4"] },
        { new: [1], existing: ["e2"] },
        { new: [2], existing: [" E3 "] },
        { new: [3], existing: [A, "abc123", "E0", 2] },
        { new: [0, 1], existing: ["E1"] },
      ],
    };

    const result = await served(answer);

    expect(result.clusters).toEqual([{ new: [0, 1], existing: [A] }]);
    expect(result.clusters).toEqual(
      referenceNormalize(answer, new Set([0, 1, 2, 3]), [A, B, C])
    );
    expect(result.refs).toEqual({
      calls: 1,
      newAnswered: 6,
      newKept: 6,
      existingAnswered: 8,
      existingKept: 1,
      existingNotString: 1,
      existingNearMiss: 4,
      emptied: 4,
    } satisfies ClusterRefCounts);
    // A slip of a sent alias names the row it meant; an alias that was
    // never sent (E4, E0) names none.
    expect(result.nearMisses).toEqual([
      { new: [1], existing: B },
      { new: [2], existing: C },
    ]);
  });

  it("counts nothing dropped when every reference is one the prompt sent", async () => {
    const result = await served({
      clusters: [{ new: [0, 1], existing: ["E1", "E2"] }],
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

  it("counts positions written as existing entries apart from unknown aliases", async () => {
    const result = await served({
      clusters: [{ new: [0], existing: [2, "E9", null] }],
    });

    expect(result.clusters).toEqual([]);
    expect(result.refs).toMatchObject({
      existingAnswered: 3,
      existingKept: 0,
      existingNotString: 2,
      existingNearMiss: 1,
      emptied: 1,
    });
  });

  it("does not count a cluster the model answered with one member as emptied", async () => {
    const result = await served({
      clusters: [{ new: [0] }, { existing: ["E1"] }],
    });

    expect(result.clusters).toEqual([]);
    expect(result.refs.emptied).toBe(0);
  });

  it("keeps exactly the reference clusters over a generated mix of well and badly formed answers", async () => {
    // mulberry32: every output bit is mixed, so `* n` reaches each shape.
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4_294_967_296) * n);
    };
    const live = new Set<unknown>(["E1", "E2", "E3"]);
    const near = new Set<unknown>(["E4", "E0", "e1", " E2 ", "E300"]);
    const seen = { loneLiveId: 0, emptied: 0, nearMiss: 0, notString: 0 };
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
      "E1",
      "E2",
      "E3",
      "E4",
      "E0",
      "e1",
      " E2 ",
      "E300",
      A,
      B,
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
        referenceNormalize(answer, new Set([0, 1, 2, 3]), [A, B, C])
      );
      const entries = answer.clusters.filter(
        (c): c is Exclude<typeof c, string> => typeof c === "object"
      );
      const existingEntries = entries.flatMap((c) => c.existing);
      expect(result.refs).toMatchObject({
        existingAnswered: existingEntries.length,
        existingKept: existingEntries.filter((v) => live.has(v)).length,
        existingNotString: existingEntries.filter((v) => typeof v !== "string")
          .length,
        existingNearMiss: existingEntries.filter((v) => near.has(v)).length,
      });
      if (
        entries.some(
          (c) =>
            c.existing.filter((v) => live.has(v)).length === 1 &&
            (!Array.isArray(c.new) ||
              c.new.every((v) => !(typeof v === "number" && v >= 0 && v <= 3)))
        )
      ) {
        seen.loneLiveId++;
      }
      if (result.refs.emptied > 0) seen.emptied++;
      if (result.refs.existingNearMiss > 0) seen.nearMiss++;
      if (result.refs.existingNotString > 0) seen.notString++;
    }
    // The mix reaches every shape the counts exist for.
    for (const rounds of Object.values(seen)) {
      expect(rounds).toBeGreaterThan(5);
    }
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
