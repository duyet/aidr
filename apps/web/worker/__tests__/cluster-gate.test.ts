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
  [
    // #745: "định giá" (valuation) and "đấu giá" (auction) shared "gia"
    // once each diacritic split a syllable.
    "genk-auction",
    h(
      "genk-ai",
      "https://genk.vn/duoc-dinh-gia-ty-usd-co-12-trieu-nguoi-dung-tai-sao-startup-chatbot-ai-nay-van-phai-de-don-xin-pha-san-165261014145541313.chn",
      "Được định giá tỷ USD, có 12 triệu người dùng, tại sao startup chatbot AI này vẫn phải đệ đơn xin phá sản?"
    ),
    h(
      "vnexpress-tech",
      "https://vnexpress.net/dau-so-di-dong-moi-075-sap-dau-gia-khoi-diem-2-5-ty-dong-5129358.html",
      "Đầu số di động mới 075 sắp đấu giá, khởi điểm 2,5 tỷ đồng"
    ),
  ],
  [
    // #745: shares only "that".
    "b19a7eb5",
    h(
      "theverge-ai",
      "https://www.theverge.com/ai-artificial-intelligence/1004096/openai-chatgpt-dots-hands-on-agent",
      "OpenAI’s Dot agent is enterprise software that can also order your dinner"
    ),
    h(
      "the-decoder",
      "https://the-decoder.com/anthropic-co-founder-reportedly-told-religious-leaders-he-fears-having-created-something-that-suffers-perpetually/",
      'Anthropic co-founder reportedly told religious leaders he fears having created something that "suffers perpetually"'
    ),
  ],
  [
    // #745: shares only "model".
    "b5bca482",
    h(
      "marketbrief",
      "https://marketbrief.now/ai/perplexity-new-v11-decision-model-tops-hugging-face-index-at-002-per-mil-eae6b882",
      "Perplexity New v1.1 Decision Model Tops Hugging Face Index at $0.02 per Million Tokens"
    ),
    h(
      "huggingnews",
      "https://huggingnews.com/ai/openrouter-adds-elevenlabs-models-with-50percent-launch-discount-a9b393d5",
      "OpenRouter Adds ElevenLabs Models with 50% Launch Discount"
    ),
  ],
  [
    // #745: shares only "run".
    "eacb7fc5",
    h(
      "hn",
      "https://github.com/Vibra-Ingenn/Janus",
      "Show HN: Janus – Go binary that runs GGUF models via Vulkan on AMD/Intel/Nvidia"
    ),
    h(
      "hn",
      "https://dwarfstar.sh/",
      "From the creator of Redis; run LLM locally with ds4"
    ),
  ],
  [
    // #745: shares only the year.
    "gateways-summit",
    h(
      "marktechpost",
      "https://www.marktechpost.com/2026/10/14/best-ai-gateways-2026/",
      "9 Best AI Gateways in 2026: Bifrost, Portkey, LiteLLM, Kong and 5 More Ranked"
    ),
    h(
      "lobsters",
      "https://lwn.net/SubscriberLink/1099594/fba1c2268c3e2fb5/",
      "The 2026 Maintainers Summit"
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
    // #745: "not" and "tool" are common words, but the title pass merges a
    // near-duplicate anyway, so the gate must not count it as rejected.
    "de2c7446",
    h(
      "lobsters",
      "https://www.linkedin.com/pulse/ai-tool-rich-hickey-kjl8e",
      "'AI' is Not a Tool"
    ),
    h(
      "hn",
      "https://gist.github.com/svieira/619d60dea942a8d4498cba3bb6b11c02",
      "'AI' Is Not a Tool by Rich Hickey"
    ),
  ],
  [
    // #745: one story in two Vietnamese headlines shares whole words.
    "eb0e0003",
    h(
      "vnexpress-tech",
      "https://vnexpress.net/tac-nhan-ai-trung-quoc-cung-gian-lan-trong-thu-nghiem-5126382.html",
      "Tác nhân AI Trung Quốc cũng gian lận trong thử nghiệm"
    ),
    h(
      "vnexpress-tech",
      "https://vnexpress.net/tac-nhan-ai-trung-quoc-gian-lan-trong-thu-nghiem-5126382.html",
      "Tác nhân AI Trung Quốc gian lận trong thử nghiệm"
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
    const copy = h(
      "vnexpress-tech",
      "https://vnexpress.net/claude-chatgpt-bao-gia-theo-muc-giau-co",
      "Claude và ChatGPT đưa ra giá mua sắm khác nhau theo mức giàu có"
    );
    expect(backsExisting([gpu, copy], shopping)).toBe(false);
    expect(backsExisting([copy], shopping)).toBe(true);
  });
});

// #745: a link across languages is judged against the story's stored
// translation (`translations.title`) and the names a Vietnamese headline
// keeps in English. Production merges from 2026-09-30 to 10-14.
describe("backsExisting across languages", () => {
  const tr = (headline: GateHeadline, translation: string): GateHeadline => ({
    ...headline,
    translation,
  });
  const geminiVi = h(
    "vnexpress-tech",
    "https://vnexpress.net/google-ra-gemini-4-argon-manh-nhat-cua-cong-ty-5126995.html",
    "Google ra Gemini 4 Argon mạnh nhất của công ty"
  );

  it.each([
    [
      "an English item that shares nothing with a Vietnamese story's translation",
      tr(
        geminiVi,
        "Google Unveils Gemini 4 Argon, the Company's Most Powerful Model"
      ),
      h(
        "huggingnews",
        "https://huggingnews.com/ai/grok-47-launches-in-general-apps-after-limited-release-eb1f6886",
        "Grok 4.7 Launches in General Apps After Limited Release"
      ),
    ],
    [
      "a Vietnamese item that shares nothing with an English story's translation",
      tr(
        h(
          "hn",
          "https://www.reddit.com/r/GeminiAI/comments/1wwalmc/wtf_google_getting_rid_of_free_gemini_flash_and/",
          "Gemini ending free use of Flash and Pro models"
        ),
        "Gemini chấm dứt sử dụng miễn phí các mô hình Flash và Pro"
      ),
      h(
        "vnexpress-tech",
        "https://vnexpress.net/google-dung-chuong-trinh-trao-thuong-tim-loi-ma-nguon-mo-vi-rac-ai-5128078.html",
        "Google dừng chương trình trao thưởng tìm lỗi mã nguồn mở vì 'rác' AI"
      ),
    ],
    [
      // "trong" carries no diacritic but is a Vietnamese word ("in"), and
      // the year is no evidence.
      "a Vietnamese syllable or a year read as a shared name",
      h(
        "lobsters",
        "https://lwn.net/SubscriberLink/1099594/fba1c2268c3e2fb5/",
        "The 2026 Maintainers Summit: trong, a new allocator"
      ),
      h(
        "vnexpress-tech",
        "https://vnexpress.net/bat-dau-ngay-hoi-doi-moi-sang-tao-quoc-gia-2026-5127769.html",
        "Bắt đầu Ngày hội Đổi mới sáng tạo quốc gia 2026 trong ba ngày"
      ),
    ],
  ])("rejects %s", (_case, story, item) => {
    expect(backsExisting([item], story)).toBe(false);
  });

  it.each([
    [
      "an English item by a Vietnamese story's translation",
      tr(
        h(
          "vnexpress-tech",
          "https://vnexpress.net/startup-my-bi-yeu-cau-dung-to-chuc-dau-nguoi-robot-5129690.html",
          "Startup Mỹ bị yêu cầu dừng tổ chức đấu người - robot"
        ),
        "US startup asked to stop organizing human-robot fights"
      ),
      h(
        "theverge-ai",
        "https://www.theverge.com/tech/1008401/california-shut-down-rek-fighting-robot-company-human",
        "California is trying to shut down robot vs. human cage matches"
      ),
    ],
    [
      "an English item that shares a word only with the translation",
      tr(
        h(
          "vnexpress-tech",
          "https://vnexpress.net/tong-thong-my-doi-ten-ai-thanh-sieu-tri-tue-5126433.html",
          "Tổng thống Mỹ đổi tên AI thành 'siêu trí tuệ'"
        ),
        "US President renames AI to 'super intelligence'"
      ),
      h(
        "huggingnews",
        "https://huggingnews.com/us-politics/update-trumps-super-intelligence-order-triggers-slovenia-domain-wave-52f5154d",
        "Trump's Super Intelligence Order Triggers Slovenia Domain Wave"
      ),
    ],
    [
      "a Vietnamese item by an English story's translation",
      tr(
        h(
          "marketbrief",
          "https://marketbrief.now/cybersecurity/openai-rogue-agents-maliciously-edit-millions-of-wikipedia-pages-12624476",
          "OpenAI Rogue Agents Maliciously Edit Millions of Wikipedia Pages"
        ),
        "AI agent của OpenAI phá hoại hàng triệu trang Wikipedia"
      ),
      h(
        "vnexpress-tech",
        "https://vnexpress.net/tac-nhan-bat-hao-cua-openai-tan-cong-wikipedia-5129191.html",
        "Tác nhân 'bất hảo' của OpenAI tấn công Wikipedia"
      ),
    ],
    [
      // No translation stored: the names stay in English.
      "a Vietnamese item by the names it keeps in English",
      h(
        "techcrunch-ai",
        "https://techcrunch.com/2026/09/30/google-releases-gemini-4-argon-called-its-most-powerful-model-yet/",
        "Google releases Gemini 4 Argon, called its most powerful model yet"
      ),
      geminiVi,
    ],
  ])("keeps %s", (_case, story, item) => {
    expect(backsExisting([item], story)).toBe(true);
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
