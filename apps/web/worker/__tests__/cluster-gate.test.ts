import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
  reportHealthAlert: vi.fn(async () => {}),
}));

import {
  backsExisting,
  CLUSTER_GATE_ALERT_RATE,
  CLUSTER_GATE_MIN_PROPOSED,
  type ClusterGateTally,
  clusterGateKey,
  evaluateClusterGate,
  type GateHeadline,
  gateLlmClusters,
  mergeClusterGate,
  parseClusterGate,
  tallyClusterGate,
} from "../cluster-gate.js";
import { runHealthCheck } from "../health.js";
import { resetOwnerDmRejections, routeRepo } from "../owner-alerts.js";
import type { Env } from "../types.js";

const h = (sourceId: string, url: string, title: string): GateHeadline => ({
  title,
  sourceId,
  url,
});

// Hand-labelled in #728/#733: a published story and an item the Laguna
// cluster call merged into it.
const WRONG: [string, GateHeadline, GateHeadline][] = [
  [
    "6cdf64e4",
    h(
      "hn",
      "https://www.bloomberg.com/news/newsletters/2026-10-07/study-claude-chatgpt-ai-bots-offer-different-shopping-prices-based-on-wealth",
      "Study: Claude, ChatGPT Offer Different Shopping Prices Based on Wealth"
    ),
    h(
      "huggingnews",
      "https://huggingnews.com/ai/anjney-midha-launches-4-b300-gpu-nodes-for-gov-and-edu-2f269c2e",
      "Anjney Midha Launches $4 B300 GPU Nodes for Gov and Edu"
    ),
  ],
  [
    "4474df4c",
    h(
      "hn",
      "https://www.neowin.net/news/system76-bans-ai-generated-code-across-many-of-its-cosmic-codebases/",
      "Pop!_OS bans AI-generated code from much of its codebase"
    ),
    h(
      "techcrunch-ai",
      "https://techcrunch.com/2026/10/03/amazon-responds-to-data-center-backlash-says-it-no-longer-uses-ndas/",
      "Amazon responds to data center backlash, says it no longer uses NDAs"
    ),
  ],
  [
    "c912268d",
    h(
      "lobsters",
      "https://sm2n.ca/articles/typeclasses-vs-modules/",
      "Typeclasses vs Modules"
    ),
    h(
      "marktechpost",
      "https://www.marktechpost.com/2026/10/02/datalab-introduces-omniextractbench-to-fix-bias-and-opacity-in-extraction-benchmarks/",
      "Datalab Introduces OmniExtractBench to Fix Bias and Opacity in Extraction Benchmarks"
    ),
  ],
  [
    // Shares only "ai", which every headline here carries.
    "26ce368a",
    h(
      "techcrunch-ai",
      "https://techcrunch.com/airbnb-adds-ai-search",
      "Airbnb adds AI search, more social features"
    ),
    h(
      "huggingnews",
      "https://huggingnews.com/ai/synthesia-launches-interactive-ai-avatars",
      "Synthesia Launches Interactive AI Avatars for Live Company Training"
    ),
  ],
  [
    // Two Vietnamese headlines that share only the "ng" left of a word.
    "84b236f2",
    h(
      "vnexpress-tech",
      "https://vnexpress.net/dong-ho-nguyen-tu",
      "Nhà khoa học gốc Việt tìm cách đưa đồng hồ nguyên tử ra không gian"
    ),
    h(
      "vnexpress-tech",
      "https://vnexpress.net/dai-quan-sat-nasa",
      "Đài quan sát 250 triệu USD của NASA sắp rơi xuống Trái Đất"
    ),
  ],
];

// Hand-labelled correct merges whose titles share at most one word.
const RIGHT: [string, GateHeadline, GateHeadline][] = [
  [
    "dec620cb",
    h(
      "openai",
      "https://openai.com/index/introducing-dots",
      "Introducing dots"
    ),
    h(
      "huggingnews",
      "https://huggingnews.com/ai/openai-launches-dots-ai-agents-and-negotiates-30b-raise-75bfd5a1",
      "OpenAI Launches Dots AI Agents and Negotiates $30B Raise"
    ),
  ],
  [
    "c696e8b1",
    h(
      "deepmind",
      "https://deepmind.google/blog/introducing-synthid-bio/",
      "Introducing SynthID Bio"
    ),
    h(
      "marketbrief",
      "https://marketbrief.now/ai/google-deepmind-debuts-first-watermarked-proteins-for-biosecurity-b66fd268",
      "Google DeepMind Debuts First Watermarked Proteins for Biosecurity"
    ),
  ],
  [
    "49c489e0",
    h(
      "hn",
      "https://www.theverge.com/ai-artificial-intelligence/1008100/anthropic-new-usage-policy-abuse-claude",
      "Anthropic bans 'abusive or cruel behavior' towards Claude"
    ),
    h(
      "anthropic",
      "https://www.anthropic.com/news/2026-usage-policy-update",
      "2026 Usage Policy update"
    ),
  ],
  [
    // An HN link to a Cloudflare post: the org comes from the URL.
    "c0a0a5f5",
    h(
      "hn",
      "https://blog.cloudflare.com/clef-decision-models/",
      "Clef: Open-weight decision models, and new RL fine-tuning platform"
    ),
    h(
      "huggingnews",
      "https://huggingnews.com/ai/cloudflare-first-in-house-ai-runs-13x-faster",
      "Cloudflare First In House AI Runs 13x Faster Than Jev"
    ),
  ],
  [
    "45765a5a",
    h(
      "vnexpress-tech",
      "https://vnexpress.net/tong-thong-my-doi-ten-ai-thanh-sieu-tri-tue-5126433.html",
      "Tổng thống Mỹ đổi tên AI thành 'siêu trí tuệ'"
    ),
    h(
      "huggingnews",
      "https://huggingnews.com/us-politics/update-trumps-super-intelligence-order-triggers-slovenia-domain-wave-52f5154d",
      "Trump's Super Intelligence Order Triggers Slovenia Domain Wave"
    ),
  ],
  [
    "6c37fbb2",
    h("hn", "https://mistral.ai/news/mistral-large-4", "Mistral Large 4"),
    h(
      "huggingnews",
      "https://huggingnews.com/ai/mistral-ships-1t-parameter-model",
      "Mistral Ships 1T Parameter Model to Outperform Chinese Rivals"
    ),
  ],
];

describe("backsExisting", () => {
  it.each(WRONG)("rejects the wrong merge into %s", (_id, existing, item) => {
    expect(backsExisting([item], existing)).toBe(false);
    expect(backsExisting([existing], item)).toBe(false);
  });

  it.each(RIGHT)("keeps the correct merge into %s", (_id, existing, item) => {
    expect(backsExisting([item], existing)).toBe(true);
    expect(backsExisting([existing], item)).toBe(true);
  });

  // The cluster prompt asks the model to fold a Vietnamese copy into the
  // English coverage, so a wrong cluster can carry one too. It must not
  // vouch for an English story the English members share nothing with.
  it("judges the members in the story's language, not a Vietnamese copy", () => {
    const [, shopping, gpu] = WRONG[0];
    const gpuVi = h(
      "vnexpress-tech",
      "https://vnexpress.net/anjney-midha-ra-mat-nut-gpu",
      "Anjney Midha ra mắt nút GPU B300 giá 4 USD cho chính phủ"
    );
    expect(backsExisting([gpu, gpuVi], shopping)).toBe(false);
    expect(backsExisting([gpuVi], shopping)).toBe(true);
  });
});

describe("gateLlmClusters", () => {
  const [, shopping, gpu] = WRONG[0];
  const [, dots, dotsRewrite] = RIGHT[0];
  const newItems = new Map([
    [0, gpu],
    [1, { ...gpu, sourceId: "marketbrief" }],
    [2, dotsRewrite],
  ]);
  const existing = new Map([
    ["shop", shopping],
    ["dots", dots],
  ]);

  it("drops the unrelated existing id and keeps the twins together", () => {
    const out = gateLlmClusters(
      [{ new: [0, 1], existing: ["shop"] }],
      newItems,
      existing
    );
    expect(out.clusters).toEqual([{ new: [0, 1], existing: [] }]);
    expect(out.proposed).toBe(1);
    expect(out.rejected).toEqual([{ existingId: "shop", newIndices: [0, 1] }]);
  });

  it("keeps an existing id that one new item of the cluster backs", () => {
    const out = gateLlmClusters(
      [{ new: [0, 2], existing: ["dots", "shop"] }],
      newItems,
      existing
    );
    expect(out.clusters).toEqual([{ new: [0, 2], existing: ["dots"] }]);
    expect(out.proposed).toBe(2);
    expect(out.rejected.map((r) => r.existingId)).toEqual(["shop"]);
  });

  it("drops a cluster left with one item, and one with no new item", () => {
    const out = gateLlmClusters(
      [
        { new: [0], existing: ["shop"] },
        { new: [], existing: ["shop", "dots"] },
      ],
      newItems,
      existing
    );
    expect(out.clusters).toEqual([]);
    expect(out.proposed).toBe(1);
  });

  it("rejects an id it has no headline for", () => {
    const out = gateLlmClusters(
      [{ new: [2], existing: ["gone"] }],
      newItems,
      existing
    );
    expect(out.clusters).toEqual([]);
    expect(out.rejected).toEqual([{ existingId: "gone", newIndices: [2] }]);
  });
});

describe("cluster gate tally", () => {
  it("counts this run's links against the served model", () => {
    expect(
      tallyClusterGate("m/a", {
        proposed: 3,
        rejected: [{ existingId: "x", newIndices: [0] }],
      })
    ).toEqual({ "m/a": { proposed: 3, rejected: 1 } });
    expect(tallyClusterGate(null, { proposed: 3, rejected: [] })).toEqual({});
    expect(tallyClusterGate("m/a", { proposed: 0, rejected: [] })).toEqual({});
  });

  it("sums runs and reads stored JSON defensively", () => {
    expect(
      mergeClusterGate(
        parseClusterGate('{"m/a":{"proposed":4,"rejected":1}}'),
        parseClusterGate({ "m/a": { proposed: 6, rejected: 9 } }),
        parseClusterGate("not json"),
        parseClusterGate('{"m/b":{"proposed":0,"rejected":2}}')
      )
    ).toEqual({ "m/a": { proposed: 10, rejected: 7 } });
  });
});

describe("evaluateClusterGate", () => {
  const min = CLUSTER_GATE_MIN_PROPOSED;
  const over = Math.floor(min * CLUSTER_GATE_ALERT_RATE) + 1;

  it("fires one warning per model over the rate", () => {
    const issues = evaluateClusterGate(
      {
        "m/bad": { proposed: min, rejected: over },
        "m/ok": { proposed: min, rejected: 0 },
      },
      new Set()
    );
    expect(issues.map((i) => i.key)).toEqual([clusterGateKey("m/bad")]);
    expect(issues[0].detail).toContain(`${over} of ${min}`);
    // A model choice in aidr's chain, so the issue is filed on duyet/aidr.
    expect(routeRepo(issues[0])).toBe("duyet/aidr");
  });

  it("stays quiet at the rate, below the volume floor, or after it fired", () => {
    const atRate = Math.floor(min * CLUSTER_GATE_ALERT_RATE);
    expect(
      evaluateClusterGate(
        { "m/a": { proposed: min, rejected: atRate } },
        new Set()
      )
    ).toEqual([]);
    expect(
      evaluateClusterGate(
        { "m/a": { proposed: min - 1, rejected: min - 1 } },
        new Set()
      )
    ).toEqual([]);
    expect(
      evaluateClusterGate(
        { "m/a": { proposed: min, rejected: over } },
        new Set([clusterGateKey("m/a")])
      )
    ).toEqual([]);
  });
});

describe("cluster gate alert through the health check", () => {
  /** 14:00 local, outside the daily-summary and day-video windows. */
  const NOW = Date.UTC(2026, 9, 14, 7, 0);
  const HOUR = 3600 * 1000;

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetOwnerDmRejections();
  });

  function setup(
    window: { clusterGate?: ClusterGateTally; alerts?: string[] }[]
  ) {
    const dms: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("api.telegram.org")) {
          dms.push(JSON.parse(String(init?.body)).text);
        }
        return new Response("{}", { status: 200 });
      })
    );
    const query = (q: string) => ({
      all: async () => ({
        results: q.includes("cluster_gate")
          ? window.map((run) => ({
              vi_english: null,
              cluster_gate: run.clusterGate
                ? JSON.stringify(run.clusterGate)
                : null,
              alerts: run.alerts ? JSON.stringify(run.alerts) : null,
            }))
          : q.includes("FROM workflow_runs")
            ? window.map((run) => ({
                started_at: Math.floor((NOW - 12 * HOUR) / 1000),
                stats: JSON.stringify({ alerts: run.alerts ?? [] }),
              }))
            : [],
      }),
    });
    const env = {
      DB: {
        prepare: (q: string) => ({ ...query(q), bind: () => query(q) }),
      },
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_OWNER_CHAT_ID: "12345",
    } as unknown as Env;
    return { env, dms };
  }

  const key = clusterGateKey("m/laguna");

  it("alerts on the 24h sum of earlier runs and this one", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms } = setup([
      { clusterGate: { "m/laguna": { proposed: 12, rejected: 2 } } },
    ]);
    const fired = await runHealthCheck(env, {
      runId: "r1",
      steps: [],
      clusterGate: { "m/laguna": { proposed: 8, rejected: 1 } },
    });
    expect(fired).toContain(key);
    expect(dms.filter((d) => d.includes("unrelated stories"))).toHaveLength(1);
  });

  it("does not alert below the rate", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms } = setup([
      { clusterGate: { "m/laguna": { proposed: 30, rejected: 2 } } },
    ]);
    const fired = await runHealthCheck(env, {
      runId: "r1",
      steps: [],
      clusterGate: { "m/laguna": { proposed: 10, rejected: 1 } },
    });
    expect(fired).not.toContain(key);
    expect(dms).toEqual([]);
  });

  it("does not alert twice for one model in 24h, past the 6h cooldown", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms } = setup([
      {
        clusterGate: { "m/laguna": { proposed: 20, rejected: 5 } },
        alerts: [key],
      },
    ]);
    const fired = await runHealthCheck(env, {
      runId: "r2",
      steps: [],
      clusterGate: { "m/laguna": { proposed: 5, rejected: 2 } },
    });
    expect(fired).not.toContain(key);
    expect(dms).toEqual([]);
  });
});
