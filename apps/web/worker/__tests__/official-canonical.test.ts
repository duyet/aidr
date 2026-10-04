/**
 * Official sources and aggregator rewrites. The driving case is Cloudflare's
 * Clef launch (2026-10-01): the story was first published from a
 * HuggingNews rewrite ("Cloudflare Launches First In-House AI Models With
 * clef Release"), whose headline shares two words with the original
 * ("Introducing Clef: …"). When the original arrives — from the Cloudflare
 * feed or a reader's submission — it must merge into that story and become
 * its canonical: readers should land on the vendor's post, not a rewrite.
 * Every negative pair below is a real pair of distinct stories from D1.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  buildMergePlan,
  type Cluster,
  clusterOfficialRewrites,
  type ExistingCandidate,
  foldDemotedCanonicals,
  isOfficialRewrite,
  type MergeCandidate,
  type OfficialRewriteInput,
  officialHeadlineName,
  selectCanonical,
  unionSources,
} from "../dedupe.js";
import {
  type MergedOfficialRow,
  officialReadmissions,
} from "../ingest/dedupe.js";
import { demotedCanonicalStatements } from "../ingest/write.js";
import {
  RANK_SIGNAL_COLUMNS,
  RANK_SIGNAL_JOIN,
  type RankSignalRow,
  rankSignals,
  rowRankSignals,
} from "../ranking.js";
import { sourceFamily } from "../source-diversity.js";
import { officialSourceFor } from "../sources/catalog.js";

const H = 60 * 60;
const CLEF_AT = Date.parse("2026-10-01T15:34:02Z") / 1000;
const CLEF_URL = "https://blog.cloudflare.com/clef-decision-models/";
const CLEF_TITLE =
  "Introducing Clef: our open-source decision models, and new RL fine-tuning platform";
const REWRITE_URL =
  "https://huggingnews.com/ai/cloudflare-launches-first-in-house-ai-models-with-clef-release-a24250a0";
const REWRITE_TITLE =
  "Cloudflare Launches First In-House AI Models With clef Release";

/** An item as the merge step sees it, from its source id and URL. */
function item(
  sourceId: string,
  url: string,
  title: string,
  publishedAt: number
): OfficialRewriteInput {
  return {
    title,
    publishedAt,
    officialOrgs: officialSourceFor(sourceId, url)?.official,
    aggregator: sourceFamily(sourceId, url) === "aggregator",
  };
}

const official = (source: string, title: string, at = CLEF_AT) =>
  item(source, "https://example.invalid/post", title, at);
const rewrite = (title: string, at = CLEF_AT) =>
  item("huggingnews", "https://huggingnews.com/ai/x", title, at);

describe("officialSourceFor", () => {
  it("knows the feed and a reader's submission of the same host", () => {
    expect(officialSourceFor("cloudflare-blog")?.official).toEqual([
      "Cloudflare",
    ]);
    expect(officialSourceFor("user", CLEF_URL)?.id).toBe("cloudflare-blog");
    // An HN link to the post is the post.
    expect(officialSourceFor("hn", CLEF_URL)?.id).toBe("cloudflare-blog");
  });

  it("never treats press, aggregators or unknown hosts as official", () => {
    expect(officialSourceFor("huggingnews", REWRITE_URL)).toBeUndefined();
    expect(officialSourceFor("techcrunch-ai")).toBeUndefined();
    expect(officialSourceFor("user", "https://example.com/a")).toBeUndefined();
  });
});

describe("officialHeadlineName", () => {
  it("takes the name a launch headline leads with", () => {
    expect(officialHeadlineName(CLEF_TITLE)).toBe("clef");
    expect(
      officialHeadlineName(
        "Gemini 4 Argon: our next era of frontier intelligence"
      )
    ).toBe("gemini 4 argon");
    expect(officialHeadlineName("Introducing GPT-6 Sol and Luna")).toBe(
      "gpt 6 sol"
    );
  });

  it("is null for a post that only mentions a model, or names more than the entity", () => {
    expect(officialHeadlineName("Better prompt caching for GPT-6")).toBeNull();
    expect(
      officialHeadlineName("Introducing Gemini 3.8 Live with Live Avatar")
    ).toBeNull();
  });
});

describe("isOfficialRewrite", () => {
  it("matches the Clef rewrite to Cloudflare's post", () => {
    const post = item("cloudflare-blog", CLEF_URL, CLEF_TITLE, CLEF_AT);
    const hn = item("huggingnews", REWRITE_URL, REWRITE_TITLE, CLEF_AT - H);
    expect(isOfficialRewrite(post, hn)).toBe(true);
    // A reader's submission of the post stands for the post.
    const submitted = item("user", CLEF_URL, CLEF_TITLE, CLEF_AT + 14 * H);
    expect(isOfficialRewrite(submitted, hn)).toBe(true);
  });

  it("matches other first-day launch rewrites from D1", () => {
    expect(
      isOfficialRewrite(
        official(
          "deepmind",
          "Gemini 4 Argon: our next era of frontier intelligence"
        ),
        rewrite("Google Launches Gemini 4 Argon with 1M Token Output Limit")
      )
    ).toBe(true);
    expect(
      isOfficialRewrite(
        official("openai", "Introducing GPT-6 Sol and Luna"),
        rewrite("OpenAI Launches GPT-6 Sol and Luna With 50% Lower API Costs")
      )
    ).toBe(true);
  });

  it("keeps distinct same-company stories apart", () => {
    const cases: [string, string, string][] = [
      // Another Cloudflare launch the same day.
      [
        "cloudflare-blog",
        "Introducing Workers KV Instant — powered by Quicksilver",
        REWRITE_TITLE,
      ],
      // A post that mentions a model is not that model's launch.
      [
        "openai",
        "Better prompt caching for GPT-6",
        "OpenAI Halves API Prices With Launch of GPT-6 Sol and Luna",
      ],
      // A sibling product of one family.
      [
        "deepmind",
        "Introducing Gemini 3.8 Live with Live Avatar",
        "Google Gemini 3.8 Flash TTS Hits #1 in Pronunciation Robustness at Launch",
      ],
      // Later developments, as the cluster prompt defines them.
      [
        "deepmind",
        "Gemini 4 Argon: our next era of frontier intelligence",
        "Cybersecurity Stocks Fall After Google Unveils Gemini 4 Argon",
      ],
      [
        "deepmind",
        "Gemini 4 Argon: our next era of frontier intelligence",
        "Google Begins Gemini 4 Argon Rollout for Paying Customers",
      ],
      [
        "openai",
        "Introducing GPT-6.1 Sol",
        "OpenAI Adds Capacity for GPT-6.1 Sol, Says Speed Should Nearly Double",
      ],
      // An event recap against one announcement made there.
      [
        "openai",
        "DevDay 2026 Recap",
        "OpenAI Unveils Always On Agent and $500 ChatGPT Plan at DevDay",
      ],
    ];
    for (const [source, post, other] of cases) {
      expect(
        isOfficialRewrite(official(source, post), rewrite(other)),
        other
      ).toBe(false);
    }
  });

  it("leaves press coverage to the LLM and needs the 36h window", () => {
    const post = official(
      "deepmind",
      "Gemini 4 Argon: our next era of frontier intelligence"
    );
    const press = item(
      "techcrunch-ai",
      "https://techcrunch.com/x",
      "Google releases Gemini 4 Argon, called its most powerful model yet",
      CLEF_AT
    );
    expect(isOfficialRewrite(post, press)).toBe(false);
    expect(
      isOfficialRewrite(
        post,
        rewrite(
          "Google Launches Gemini 4 Argon with 1M Token Output Limit",
          CLEF_AT + 37 * H
        )
      )
    ).toBe(false);
  });

  it("never pairs two official posts", () => {
    expect(
      isOfficialRewrite(official("openai", "Introducing GPT-6 Sol and Luna"), {
        ...official("openai", "OpenAI Launches GPT-6 Sol and Luna"),
        aggregator: true,
      })
    ).toBe(false);
  });
});

describe("clusterOfficialRewrites", () => {
  it("clusters the new official post with the published rewrite", () => {
    const clusters = clusterOfficialRewrites(
      [{ i: 0, ...item("cloudflare-blog", CLEF_URL, CLEF_TITLE, CLEF_AT) }],
      [
        {
          id: "932a29ca",
          ...item("huggingnews", REWRITE_URL, REWRITE_TITLE, CLEF_AT - H),
        },
        {
          id: "other",
          ...rewrite("Cloudflare First In-House AI Runs 13x Faster Than Jev"),
        },
      ]
    );
    expect(clusters).toEqual([{ new: [0], existing: ["932a29ca"] }]);
  });
});

describe("selectCanonical with official sources", () => {
  const ranks = new Map([
    [0, 3],
    [1, 9],
  ]);

  it("an official new item replaces a non-official existing canonical", () => {
    expect(
      selectCanonical({ new: [0, 1], existing: ["agg"] }, ranks, {
        officialNew: new Set([0]),
      })
    ).toEqual({ type: "new", index: 0, demotes: "agg" });
  });

  it("an official new item beats a higher-ranked new rewrite", () => {
    expect(
      selectCanonical({ new: [0, 1], existing: [] }, ranks, {
        officialNew: new Set([0]),
      })
    ).toEqual({ type: "new", index: 0 });
  });

  it("an official existing canonical is never replaced", () => {
    expect(
      selectCanonical({ new: [0], existing: ["agg", "post"] }, ranks, {
        officialNew: new Set([0]),
        officialExisting: new Set(["post"]),
      })
    ).toEqual({ type: "existing", id: "post" });
  });

  it("without official items, the existing item still wins", () => {
    expect(selectCanonical({ new: [1], existing: ["agg"] }, ranks)).toEqual({
      type: "existing",
      id: "agg",
    });
  });
});

describe("buildMergePlan demotion (Clef)", () => {
  const post: MergeCandidate = {
    i: 0,
    id: "clef-post",
    url: CLEF_URL,
    sourceId: "cloudflare-blog",
    points: 0,
    comments: 0,
    rank: 2,
    topics: ["clef"],
    official: true,
    headline: item("cloudflare-blog", CLEF_URL, CLEF_TITLE, CLEF_AT),
  };
  const existing = new Map<string, ExistingCandidate>([
    [
      "932a29ca",
      {
        points: 12,
        comments: 3,
        sourceId: "huggingnews",
        url: REWRITE_URL,
        topics: ["cloudflare", "workers-ai"],
        headline: item("huggingnews", REWRITE_URL, REWRITE_TITLE, CLEF_AT - H),
      },
    ],
  ]);
  const clusters: Cluster[] = [{ new: [0], existing: ["932a29ca"] }];

  it("makes the post canonical and folds the rewrite in as a member", () => {
    const plan = buildMergePlan(clusters, [post], existing, 8);
    expect(plan.demoted).toEqual(new Map([["932a29ca", "clef-post"]]));
    expect(plan.merged.size).toBe(0);
    const update = plan.canonicalUpdates.get("clef-post");
    expect(update?.isExisting).toBe(false);
    expect(update?.extraSources[0]).toEqual({
      kind: "source",
      url: REWRITE_URL,
      author: "huggingnews",
    });
    expect(update?.members).toEqual([
      { sourceId: "huggingnews", points: 12, comments: 3, url: REWRITE_URL },
    ]);
    // Aggregator author/tweet counts are not reader engagement.
    expect(update?.maxPoints).toBe(0);
    expect(update?.extraTopics).toEqual(
      expect.arrayContaining(["clef", "cloudflare", "workers-ai"])
    );
  });

  it("a post below the relevance bar does not take over", () => {
    const plan = buildMergePlan(
      clusters,
      [{ ...post, official: false }],
      existing,
      8
    );
    expect(plan.demoted.size).toBe(0);
    expect(plan.merged.get("clef-post")).toEqual({ duplicateOf: "932a29ca" });
  });

  it("an official post the LLM grouped with someone else's launch does not take it over", () => {
    // D1: AWS's Bedrock post sits in the cluster of xAI's Grok 4.7 launch.
    const bedrock: MergeCandidate = {
      ...post,
      id: "aws-grok",
      url: "https://aws.amazon.com/blogs/machine-learning/grok-4-7-bedrock/",
      sourceId: "aws-ml",
      headline: official(
        "aws-ml",
        "Grok 4.7 is now available on Amazon Bedrock"
      ),
    };
    const launch = new Map<string, ExistingCandidate>([
      [
        "grok-launch",
        {
          points: 0,
          comments: 0,
          sourceId: "huggingnews",
          url: "https://huggingnews.com/ai/grok-4-7",
          headline: rewrite(
            "xAI Launches 2.1 Trillion Parameter Grok 4.7 to Overtake GPT 5.6 Sol in Coding"
          ),
        },
      ],
    ]);
    const plan = buildMergePlan(
      [{ new: [0], existing: ["grok-launch"] }],
      [bedrock],
      launch,
      8
    );
    expect(plan.demoted.size).toBe(0);
    expect(plan.merged.get("aws-grok")).toEqual({ duplicateOf: "grok-launch" });
  });

  it("among new items, the post beats its rewrite but not an unrelated item", () => {
    const rewriteItem: MergeCandidate = {
      ...post,
      i: 1,
      id: "rewrite",
      url: REWRITE_URL,
      sourceId: "huggingnews",
      rank: 9,
      official: false,
      headline: item("huggingnews", REWRITE_URL, REWRITE_TITLE, CLEF_AT),
    };
    const won = buildMergePlan(
      [{ new: [0, 1], existing: [] }],
      [post, rewriteItem],
      new Map(),
      8
    );
    expect(won.merged.get("rewrite")).toEqual({ duplicateOf: "clef-post" });

    const unrelated = {
      ...rewriteItem,
      headline: rewrite(
        "Cloudflare First In-House AI Runs 13x Faster Than Jev"
      ),
    };
    const lost = buildMergePlan(
      [{ new: [0, 1], existing: [] }],
      [post, unrelated],
      new Map(),
      8
    );
    expect(lost.merged.get("clef-post")).toEqual({ duplicateOf: "rewrite" });
  });

  it("inherits the rewrite's sources and earlier merged items", () => {
    const plan = foldDemotedCanonicals(
      buildMergePlan(clusters, [post], existing, 8),
      new Map([
        [
          "932a29ca",
          {
            url: REWRITE_URL,
            sources: [
              {
                kind: "source",
                author: "@michellechen",
                url: "https://x.com/michellechen/status/2105684868550045751",
              },
            ],
            members: [
              {
                id: "0274f85d",
                sourceId: "marketbrief",
                points: 0,
                comments: 0,
                url: "https://marketbrief.now/ai/clef",
              },
              {
                id: "hn-1",
                sourceId: "hn",
                points: 140,
                comments: 60,
                url: CLEF_URL,
              },
            ],
          },
        ],
      ]),
      8
    );
    const update = plan.canonicalUpdates.get("clef-post");
    expect(update?.extraSources.map((s) => s.url)).toEqual([
      REWRITE_URL,
      "https://x.com/michellechen/status/2105684868550045751",
    ]);
    expect(update?.maxPoints).toBe(140);
    expect(update?.maxComments).toBe(60);
    // Cloudflare + aggregator family (HuggingNews and MarketBrief once) + HN.
    expect(
      rankSignals([
        { sourceId: "cloudflare-blog", points: 0, comments: 0, url: CLEF_URL },
        ...(update?.members ?? []),
      ]).sourceCount
    ).toBe(3);
  });
});

describe("source mix", () => {
  it("a reader's submission of the post counts as the Cloudflare outlet", () => {
    expect(sourceFamily("user", CLEF_URL)).toBe("cloudflare-blog");
    expect(sourceFamily("user", "https://example.com/a")).toBe("user");
    expect(
      rankSignals([
        { sourceId: "cloudflare-blog", points: 0, comments: 0, url: CLEF_URL },
        { sourceId: "user", points: 0, comments: 0, url: `${CLEF_URL}?a=1` },
        { sourceId: "huggingnews", points: 0, comments: 0, url: REWRITE_URL },
      ]).sourceCount
    ).toBe(2);
  });

  it("lists the official post first, before the cap", () => {
    const tweets = Array.from({ length: 8 }, (_, n) => ({
      kind: "source" as const,
      author: `@t${n}`,
      url: `https://x.com/t/status/${n}`,
    }));
    const merged = unionSources(
      tweets,
      [{ kind: "source", url: CLEF_URL, author: "user" }],
      8
    );
    expect(merged).toHaveLength(8);
    expect(merged[0].url).toBe(CLEF_URL);
  });
});

describe("demotedCanonicalStatements", () => {
  it("re-points the cluster, demotes the old canonical and moves sent notifications", () => {
    const sent: { sql: string; args: unknown[] }[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          sent.push({ sql, args });
          return {};
        },
      }),
    } as unknown as D1Database;
    demotedCanonicalStatements(db, "932a29ca", "clef-post");
    expect(sent.map((s) => s.args)).toEqual([
      ["clef-post", "932a29ca"],
      ["clef-post", "932a29ca"],
      ["clef-post", "932a29ca"],
    ]);
    expect(sent[0].sql).toMatch(
      /SET duplicate_of = \? WHERE status = 'merged'/
    );
    expect(sent[1].sql).toMatch(
      /SET status = 'merged', duplicate_of = \? WHERE id = \? AND status = 'published'/
    );
    // Moved, not copied: the Telegram post is not repeated and the day's
    // sent count stays one.
    expect(sent[2].sql).toMatch(/UPDATE OR IGNORE notifications SET item_id/);
  });
});

describe("demotion against real SQL (Clef rows from D1)", () => {
  it("leaves one published canonical with the whole cluster and one notification", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, source_id TEXT,
      url TEXT, points INTEGER, comments INTEGER, status TEXT,
      duplicate_of TEXT);
      CREATE TABLE item_votes (item_id TEXT NOT NULL, user_id TEXT NOT NULL,
        value INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (item_id, user_id));
      CREATE TABLE notifications (channel TEXT NOT NULL, item_id TEXT NOT NULL,
      target TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent',
      posted_at INTEGER NOT NULL, PRIMARY KEY (channel, item_id))`);
    const add = sqlite.prepare(
      "INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    add.run("932a29ca", "huggingnews", REWRITE_URL, 0, 0, "published", null);
    add.run(
      "0274f85d",
      "marketbrief",
      "https://marketbrief.now/ai/clef",
      0,
      0,
      "merged",
      "932a29ca"
    );
    add.run(
      "271b32be",
      "user",
      `${CLEF_URL}?utm_source=twitter`,
      0,
      0,
      "merged",
      "932a29ca"
    );
    // The official post, written earlier in the same batch.
    add.run("clef-post", "cloudflare-blog", CLEF_URL, 0, 0, "published", null);
    sqlite
      .prepare("INSERT INTO notifications VALUES (?, ?, ?, 'sent', ?)")
      .run("telegram", "932a29ca", "@aidr", 1);

    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: () => sqlite.prepare(sql).run(...(args as string[])),
        }),
      }),
    } as unknown as D1Database;
    for (const statement of demotedCanonicalStatements(
      db,
      "932a29ca",
      "clef-post"
    )) {
      (statement as unknown as { run: () => void }).run();
    }

    const rows = sqlite
      .prepare("SELECT id, status, duplicate_of FROM items ORDER BY id")
      .all();
    expect(rows).toEqual([
      { id: "0274f85d", status: "merged", duplicate_of: "clef-post" },
      { id: "271b32be", status: "merged", duplicate_of: "clef-post" },
      { id: "932a29ca", status: "merged", duplicate_of: "clef-post" },
      { id: "clef-post", status: "published", duplicate_of: null },
    ]);
    expect(
      sqlite.prepare("SELECT channel, item_id FROM notifications").all()
    ).toEqual([{ channel: "telegram", item_id: "clef-post" }]);
    // Cloudflare (feed + the reader's copy) and the aggregator pair.
    const signals = rowRankSignals(
      sqlite
        .prepare(
          `SELECT ${RANK_SIGNAL_COLUMNS} FROM items ${RANK_SIGNAL_JOIN} WHERE id = ?`
        )
        .get("clef-post") as unknown as RankSignalRow
    );
    expect(signals.sourceCount).toBe(2);
  });
});

describe("unionSources URL identity", () => {
  it("treats a shared ?utm_ link as the same source and drops the story's own URL", () => {
    // The reader's submission (utm link) merged under the rewrite; once the
    // post is canonical it must not list itself again as a "user" source.
    const merged = unionSources(
      [
        {
          kind: "source",
          author: "user",
          url: `${CLEF_URL}?utm_source=twitter`,
        },
      ],
      [
        { kind: "source", author: "cloudflare-blog", url: CLEF_URL },
        { kind: "source", author: "huggingnews", url: REWRITE_URL },
      ],
      8,
      CLEF_URL
    );
    expect(merged.map((s) => s.url)).toEqual([REWRITE_URL]);
  });
});

/** Live case after the first deploy: HN linked the post first, so the
 * post's id (sha256 of its URL) is an HN row merged under the rewrite, and
 * the Cloudflare feed's copy is deduped by that id. The stored post must go
 * back through the pipeline once so it can take the story over. */
describe("officialReadmissions", () => {
  const row: MergedOfficialRow = {
    id: "c0a0a5f5",
    source_id: "hn",
    external_id: "49923692",
    url: CLEF_URL,
    title: "Clef: Open-weight decision models, and new RL fine-tuning platform",
    summary: null,
    published_at: CLEF_AT + 2 * H,
    points: 140,
    comments: 60,
    image_url: null,
    source_lang: "en",
    media_manifest: null,
    llm_relevance: 0.98,
    canonical_source_id: "huggingnews",
    canonical_url: REWRITE_URL,
    canonical_title: REWRITE_TITLE,
    canonical_published_at: CLEF_AT - H,
  };

  it("re-admits the HN copy of the post merged under the rewrite", () => {
    expect(officialReadmissions([row]).map((r) => r.id)).toEqual(["c0a0a5f5"]);
  });

  it("leaves it merged below the relevance bar, under an official canonical, or under an unrelated story", () => {
    expect(officialReadmissions([{ ...row, llm_relevance: 0.2 }])).toEqual([]);
    // Already the canonical's own family: no loop after a takeover.
    expect(
      officialReadmissions([
        {
          ...row,
          canonical_source_id: "cloudflare-blog",
          canonical_url: "https://blog.cloudflare.com/other/",
        },
      ])
    ).toEqual([]);
    expect(
      officialReadmissions([
        {
          ...row,
          canonical_title:
            "Cloudflare First In-House AI Runs 13x Faster Than Jev",
        },
      ])
    ).toEqual([]);
  });
});

/** The exact prod rows after the first deploy: 932a (huggingnews) is the
 * canonical; 0274 (marketbrief), c0a0 (HN's link to the post) and 271b (the
 * reader's utm copy) are merged under it. The feed's copy of the post is
 * deduped by c0a0's id, so c0a0 itself is re-admitted and takes over. */
describe("Clef takeover from the stored HN copy (prod rows)", () => {
  it("re-admits c0a0, plans the takeover, and the batch leaves one published story", () => {
    const c0a0 = {
      id: "c0a0a5f5",
      source_id: "hn",
      external_id: "49923692",
      url: CLEF_URL,
      title:
        "Clef: Open-weight decision models, and new RL fine-tuning platform",
      summary: null,
      published_at: CLEF_AT + 2 * H,
      points: 140,
      comments: 60,
      image_url: null,
      source_lang: "en" as const,
      media_manifest: null,
      llm_relevance: 0.98,
      canonical_source_id: "huggingnews",
      canonical_url: REWRITE_URL,
      canonical_title: REWRITE_TITLE,
      canonical_published_at: CLEF_AT - H,
    };
    expect(officialReadmissions([c0a0])).toHaveLength(1);

    const plan = buildMergePlan(
      [{ new: [0], existing: ["932a29ca"] }],
      [
        {
          i: 0,
          id: "c0a0a5f5",
          url: CLEF_URL,
          sourceId: "hn",
          points: 140,
          comments: 60,
          rank: 3,
          official: true,
          headline: item("hn", CLEF_URL, c0a0.title, c0a0.published_at),
        },
      ],
      new Map<string, ExistingCandidate>([
        [
          "932a29ca",
          {
            points: 0,
            comments: 0,
            sourceId: "huggingnews",
            url: REWRITE_URL,
            headline: item(
              "huggingnews",
              REWRITE_URL,
              REWRITE_TITLE,
              CLEF_AT - H
            ),
          },
        ],
      ]),
      8
    );
    expect(plan.demoted).toEqual(new Map([["932a29ca", "c0a0a5f5"]]));

    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, source_id TEXT,
      url TEXT, points INTEGER, comments INTEGER, status TEXT,
      duplicate_of TEXT);
      CREATE TABLE item_votes (item_id TEXT NOT NULL, user_id TEXT NOT NULL,
        value INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (item_id, user_id));
      CREATE TABLE notifications (channel TEXT NOT NULL, item_id TEXT NOT NULL,
      target TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent',
      posted_at INTEGER NOT NULL, PRIMARY KEY (channel, item_id))`);
    const add = sqlite.prepare(
      "INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    add.run("932a29ca", "huggingnews", REWRITE_URL, 0, 0, "published", null);
    add.run(
      "0274f85d",
      "marketbrief",
      "https://marketbrief.now/ai/clef",
      0,
      0,
      "merged",
      "932a29ca"
    );
    add.run("c0a0a5f5", "hn", CLEF_URL, 140, 60, "merged", "932a29ca");
    add.run(
      "271b32be",
      "user",
      `${CLEF_URL}?utm_source=twitter`,
      0,
      0,
      "merged",
      "932a29ca"
    );
    sqlite
      .prepare("INSERT INTO notifications VALUES (?, ?, ?, 'sent', ?)")
      .run("telegram", "932a29ca", "@aidr", 1);
    // The write batch upserts the re-admitted row as published first.
    sqlite
      .prepare(
        "UPDATE items SET status = 'published', duplicate_of = NULL WHERE id = ?"
      )
      .run("c0a0a5f5");
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: () => sqlite.prepare(sql).run(...(args as string[])),
        }),
      }),
    } as unknown as D1Database;
    for (const statement of demotedCanonicalStatements(
      db,
      "932a29ca",
      "c0a0a5f5"
    )) {
      (statement as unknown as { run: () => void }).run();
    }
    expect(
      sqlite
        .prepare("SELECT id, status, duplicate_of FROM items ORDER BY id")
        .all()
    ).toEqual([
      { id: "0274f85d", status: "merged", duplicate_of: "c0a0a5f5" },
      { id: "271b32be", status: "merged", duplicate_of: "c0a0a5f5" },
      { id: "932a29ca", status: "merged", duplicate_of: "c0a0a5f5" },
      { id: "c0a0a5f5", status: "published", duplicate_of: null },
    ]);
    expect(sqlite.prepare("SELECT item_id FROM notifications").all()).toEqual([
      { item_id: "c0a0a5f5" },
    ]);
    const signals = rowRankSignals(
      sqlite
        .prepare(
          `SELECT ${RANK_SIGNAL_COLUMNS} FROM items ${RANK_SIGNAL_JOIN} WHERE id = ?`
        )
        .get("c0a0a5f5") as unknown as RankSignalRow
    );
    // HN + aggregator pair + the reader's copy counted as Cloudflare.
    expect(signals).toEqual({
      points: 140,
      comments: 60,
      sourceCount: 3,
      voteNet: 0,
    });
  });
});
