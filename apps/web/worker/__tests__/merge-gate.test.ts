import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestContext, NewRow } from "../ingest/context.js";
import { planMerges, type RecentClusterRow } from "../ingest/merge.js";
import { LIVE_FULL_RUN } from "../ingest/mode.js";
import type { Env } from "../types.js";

const NOW = Date.UTC(2026, 9, 7, 19, 0, 0);
const NOW_SEC = NOW / 1000;

const step = {
  do: async (_name: string, ...rest: unknown[]) =>
    (rest.at(-1) as () => Promise<unknown>)(),
} as unknown as WorkflowStep;

function ctx(recent: RecentClusterRow[]): IngestContext {
  const stmt = {
    bind: () => stmt,
    all: async () => ({ results: recent }),
    run: async () => ({ meta: { changes: 1 } }),
    first: async () => null,
  };
  const env = {
    DB: { prepare: () => stmt, batch: async () => [] },
    ANYROUTER_BASE_URL: "https://anyrouter.dev/api/v1",
    ANYROUTER_MODEL: "test/cluster",
    ANYROUTER_API_KEY: "test-key",
  } as unknown as Env;
  return { step, env, runId: "r1", steps: [], mode: LIVE_FULL_RUN };
}

function existing(id: string, sourceId: string, url: string, title: string) {
  return {
    id,
    source_id: sourceId,
    url,
    title,
    published_at: NOW_SEC - 6 * 3600,
    tags: null,
    points: 0,
    comments: 0,
    image_url: null,
    media_manifest: null,
  } satisfies RecentClusterRow;
}

function fresh(id: string, sourceId: string, url: string, title: string) {
  return {
    id,
    source: { id: sourceId, type: "rss", config: "{}", enabled: 1 },
    item: { url, title, publishedAt: NOW_SEC - 1800 },
  } satisfies NewRow;
}

function modelAnswers(clusters: unknown) {
  const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const body = frame({
    choices: [{ delta: { content: JSON.stringify({ clusters }) } }],
  });
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

// #733: the huggingnews + marketbrief copies of one story, paired right,
// attached by the cluster model to an unrelated published story.
const shopping = existing(
  "6cdf64e4",
  "hn",
  "https://www.bloomberg.com/news/newsletters/2026-10-07/study-claude-chatgpt-ai-bots-offer-different-shopping-prices-based-on-wealth",
  "Study: Claude, ChatGPT Offer Different Shopping Prices Based on Wealth"
);
const gpuTwins = [
  fresh(
    "gpu-hn",
    "huggingnews",
    "https://huggingnews.com/ai/anjney-midha-launches-4-b300-gpu-nodes-for-gov-and-edu-2f269c2e",
    "Anjney Midha Launches $4 B300 GPU Nodes for Gov and Edu"
  ),
  fresh(
    "gpu-mb",
    "marketbrief",
    "https://marketbrief.now/ai/anjney-midha-launches-4-b300-gpu-nodes-for-gov-and-edu-2f269c2e",
    "Anjney Midha Launches $4 B300 GPU Nodes for Gov and Edu"
  ),
];
// A correct merge with no shared title word: the official post names only
// the product, the rewrites name the lab.
const synthId = existing(
  "c696e8b1",
  "deepmind",
  "https://deepmind.google/blog/introducing-synthid-bio/",
  "Introducing SynthID Bio"
);
const proteinTwins = [
  fresh(
    "bio-hn",
    "huggingnews",
    "https://huggingnews.com/ai/google-deepmind-debuts-first-watermarked-proteins-for-biosecurity-b66fd268",
    "Google DeepMind Debuts First Watermarked Proteins for Biosecurity"
  ),
  fresh(
    "bio-mb",
    "marketbrief",
    "https://marketbrief.now/ai/google-deepmind-debuts-first-watermarked-proteins-for-biosecurity-b66fd268",
    "Google DeepMind Debuts First Watermarked Proteins for Biosecurity"
  ),
];

describe("planMerges cluster gate (#733)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the model's unrelated link out of the plan and the related one in", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    modelAnswers([
      { new: [0, 1], existing: ["6cdf64e4"] },
      { new: [2, 3], existing: ["c696e8b1"] },
    ]);

    const { plan, clusterGate } = await planMerges(
      ctx([shopping, synthId]),
      [...gpuTwins, ...proteinTwins],
      new Map(),
      new Map(),
      NOW
    );

    const duplicateOf = (id: string) => plan.merged.get(id)?.duplicateOf;
    expect(plan.canonicalUpdates.has("6cdf64e4")).toBe(false);
    expect([duplicateOf("gpu-hn"), duplicateOf("gpu-mb")]).not.toContain(
      "6cdf64e4"
    );
    // The twins still fold into one story: only the link to 6cdf64e4 goes.
    expect(
      [duplicateOf("gpu-hn"), duplicateOf("gpu-mb")].filter(Boolean)
    ).toHaveLength(1);
    expect(duplicateOf("bio-hn")).toBe("c696e8b1");
    expect(duplicateOf("bio-mb")).toBe("c696e8b1");
    expect(clusterGate).toEqual({
      "test/cluster": { proposed: 2, rejected: 1 },
    });
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining('test/cluster linked 6cdf64e4 "Study: Claude'),
    ]);
  });

  it("returns an empty tally when the model linked nothing to an existing story", async () => {
    modelAnswers([{ new: [0, 1] }]);

    const { plan, clusterGate } = await planMerges(
      ctx([shopping]),
      gpuTwins,
      new Map(),
      new Map(),
      NOW
    );

    expect(plan.merged.size).toBe(1);
    expect(clusterGate).toEqual({});
  });

  it("keeps the tally when every link is rejected and nothing merges", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const anthropicIpo = fresh(
      "ipo",
      "huggingnews",
      "https://huggingnews.com/ai/anthropic-plans-mega-ipo-before-thanksgiving-holiday-0a1b2c3d",
      "Anthropic Plans Mega IPO Before Thanksgiving Holiday"
    );
    modelAnswers([{ new: [0], existing: ["6cdf64e4"] }]);

    const { plan, clusterGate } = await planMerges(
      ctx([shopping]),
      [anthropicIpo],
      new Map(),
      new Map(),
      NOW
    );

    expect(plan.merged.size).toBe(0);
    expect(clusterGate).toEqual({
      "test/cluster": { proposed: 1, rejected: 1 },
    });
  });
});
