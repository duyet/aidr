import { describe, expect, it } from "vitest";
import {
  attributeSources,
  type ItemId,
  parseUnmergePairs,
  planUnmerge,
  type StoredSource,
  toWirePair,
  UNMERGE_QUIET_SEC,
  type UnmergeItemRow,
} from "../unmerge/plan.js";
import { sameStoryRule } from "../unmerge/twins.js";

const NOW_MS = Date.UTC(2026, 9, 14, 3);
const OLD = NOW_MS / 1000 - 10 * 86_400;
const hex = (n: number) => n.toString(16).padStart(64, "0") as ItemId;

function item(
  n: number,
  sourceId: string,
  url: string,
  extra: Partial<UnmergeItemRow> = {}
): UnmergeItemRow {
  return {
    id: hex(n),
    source_id: sourceId,
    url,
    title: `story ${n}`,
    summary: null,
    status: "merged",
    duplicate_of: hex(1),
    points: 0,
    comments: 0,
    tags: "[]",
    image_url: null,
    media_manifest: null,
    published_at: OLD,
    fetched_at: OLD + 600,
    llm_relevance: 0.9,
    category: null,
    llm_importance: 5,
    llm_quality: 5,
    rank_score: 1,
    source_lang: "en",
    title_en: null,
    vote_net: 0,
    notifications: 0,
    has_vi: 0,
    ...extra,
  };
}

const storyRef = (row: UnmergeItemRow) => ({
  id: row.id,
  source_id: row.source_id,
  url: row.url,
  title: row.title,
  published_at: row.published_at,
  source_lang: row.source_lang,
  title_en: row.title_en,
});
const liveRef = (row: UnmergeItemRow) => ({ ...storyRef(row), root: row.id });

const tweet = (handle: string): StoredSource => ({
  kind: "support",
  author: `@${handle}`,
  posted_at: OLD - 100,
  quote: null,
  url: `https://x.com/${handle}/status/1`,
});
const entry = (sourceId: string, url: string): StoredSource => ({
  kind: "source",
  author: sourceId,
  posted_at: null,
  quote: null,
  url,
});
const self = (url: string, postedAt = OLD): StoredSource => ({
  kind: "source",
  author: null,
  posted_at: postedAt,
  quote: null,
  url,
});

describe("parseUnmergePairs", () => {
  const a = hex(1);
  const b = hex(2);
  const c = hex(3);
  it("rejects input that would restore a story twice or split a group", () => {
    expect(
      parseUnmergePairs([{ canonicalId: a, mergedId: "abc" }])
    ).toHaveProperty("error");
    expect(
      parseUnmergePairs([
        { canonicalId: a, mergedId: b },
        { canonicalId: c, mergedId: b },
      ])
    ).toHaveProperty("error");
    expect(
      parseUnmergePairs([
        { canonicalId: a, mergedId: b, group: "g" },
        { canonicalId: c, mergedId: hex(4), group: "g" },
      ])
    ).toHaveProperty("error");
    expect(
      parseUnmergePairs([
        { canonicalId: a, mergedId: b },
        { canonicalId: b, mergedId: c },
      ])
    ).toHaveProperty("error");
  });

  it("rejects a decision that cannot be applied", () => {
    for (const extra of [
      { sameAs: "abc" },
      { distinct: false },
      { sameAs: c, distinct: true },
      { sameAs: c, distinctFrom: [hex(4)] },
      { distinctFrom: [] },
      { distinctFrom: hex(4) },
      { distinctFrom: ["abc"] },
    ]) {
      expect(
        parseUnmergePairs([{ canonicalId: a, mergedId: b, ...extra }])
      ).toHaveProperty("error");
    }
    expect(
      parseUnmergePairs([
        { canonicalId: a, mergedId: b, group: "g", distinct: true },
        { canonicalId: a, mergedId: hex(4), group: "g", sameAs: c },
      ])
    ).toHaveProperty("error");
    expect(
      parseUnmergePairs([{ canonicalId: a, mergedId: b, sameAs: c }])
    ).toEqual({
      pairs: [
        {
          canonicalId: a,
          mergedId: b,
          group: b,
          decision: { kind: "same-as", twinId: c },
        },
      ],
    });
  });

  it("defaults a pair's group to its merged id", () => {
    expect(parseUnmergePairs([{ canonicalId: a, mergedId: b }])).toEqual({
      pairs: [{ canonicalId: a, mergedId: b, group: b }],
    });
  });
});

describe("toWirePair", () => {
  it("keeps sameAs and distinct decisions through the CLI apply body and the endpoint re-parse", () => {
    const file = [
      { canonicalId: hex(1), mergedId: hex(2), group: "g1", sameAs: hex(3) },
      { canonicalId: hex(1), mergedId: hex(4), group: "g2", distinct: true },
      {
        canonicalId: hex(1),
        mergedId: hex(5),
        group: "g3",
        distinctFrom: [hex(6)],
      },
    ];
    const cli = parseUnmergePairs(file);
    if ("error" in cli) throw new Error(cli.error);
    const body = JSON.parse(
      JSON.stringify({ pairs: cli.pairs.map(toWirePair) })
    );
    expect(parseUnmergePairs(body.pairs)).toEqual(cli);
    expect(cli.pairs.map((p) => p.decision)).toEqual([
      { kind: "same-as", twinId: hex(3) },
      { kind: "distinct", from: [] },
      { kind: "distinct", from: [hex(6)] },
    ]);
  });
});

describe("attributeSources", () => {
  // Production 8d0ba39a: a marketbrief canonical, its correct huggingnews
  // twin, then a wrong huggingnews/marketbrief pair whose URL rows the
  // 8-row cap dropped.
  const canonical = item(
    1,
    "marketbrief",
    "https://marketbrief.now/kospi-c549",
    {
      status: "published",
      duplicate_of: null,
    }
  );
  const twin = item(2, "huggingnews", "https://huggingnews.com/kospi-c549");
  const wrongHug = item(
    3,
    "huggingnews",
    "https://huggingnews.com/openai-13c2",
    {
      fetched_at: OLD + 900,
    }
  );
  const wrongMb = item(
    4,
    "marketbrief",
    "https://marketbrief.now/openai-13c2",
    {
      fetched_at: OLD + 900,
    }
  );
  const rows = [
    self(canonical.url),
    tweet("techmeme"),
    tweet("marionawfal"),
    entry("huggingnews", twin.url),
    tweet("techmeme2"),
    tweet("dylfreed"),
    tweet("micahcarroll"),
    tweet("marcus"),
  ];
  const groupOf = new Map([
    [wrongHug.id as string, "openai"],
    [wrongMb.id as string, "openai"],
  ]);

  it("gives a tweet run to the member whose URL row ends it, and capped trailing rows to the one group missing its URL row", () => {
    const owners = attributeSources(
      canonical,
      [twin, wrongHug, wrongMb],
      rows,
      groupOf
    ).map((a) => [a.owner, a.rule]);
    expect(owners).toEqual([
      [canonical.id, "url"],
      [twin.id, "run-before-member"],
      [twin.id, "run-before-member"],
      [twin.id, "url"],
      [wrongHug.id, "trailing-capped"],
      [wrongHug.id, "trailing-capped"],
      [wrongHug.id, "trailing-capped"],
      [wrongHug.id, "trailing-capped"],
    ]);
  });

  it("never moves a tweet-sourced canonical's leading tweets, and flags them", () => {
    // Production d7a217b1: eight tweets and no member URL row at all.
    const hugCanonical = item(
      5,
      "huggingnews",
      "https://huggingnews.com/own-3332",
      {
        status: "published",
        duplicate_of: null,
      }
    );
    const attribution = attributeSources(
      hugCanonical,
      [wrongHug, wrongMb],
      ["a", "b", "c"].map(tweet),
      groupOf
    );
    expect(attribution.every((a) => a.owner === hugCanonical.id)).toBe(true);
    expect(attribution.every((a) => a.ambiguous)).toBe(true);
  });

  it("keeps the canonical's own tweets behind an official link moved to the front", () => {
    const hugCanonical = item(
      12,
      "huggingnews",
      "https://huggingnews.com/own-1",
      {
        status: "published",
        duplicate_of: null,
      }
    );
    const official = item(13, "openai", "https://openai.com/index/post");
    const wrong = item(14, "huggingnews", "https://huggingnews.com/wrong-2");
    const attribution = attributeSources(
      hugCanonical,
      [official, wrong],
      [
        entry("openai", official.url),
        tweet("ownA"),
        tweet("ownB"),
        entry("huggingnews", wrong.url),
      ],
      new Map([[wrong.id as string, "wrong"]])
    );
    expect(attribution.map((a) => [a.owner, a.ambiguous])).toEqual([
      [official.id, false],
      [hugCanonical.id, true],
      [hugCanonical.id, true],
      [wrong.id, false],
    ]);
  });

  it("matches an HN or Lobsters discussion row to the item it was posted with", () => {
    const hnCanonical = item(6, "hn", "https://example.test/a", {
      status: "published",
      duplicate_of: null,
      published_at: OLD - 5000,
    });
    const hnLoser = item(7, "hn", "https://example.test/b");
    const discussion = (postedAt: number): StoredSource => ({
      kind: "discussion",
      author: "someone",
      posted_at: postedAt,
      quote: null,
      url: `https://news.ycombinator.com/item?id=${postedAt}`,
    });
    const owners = attributeSources(
      hnCanonical,
      [hnLoser],
      [discussion(OLD - 5000), discussion(OLD), entry("hn", hnLoser.url)],
      new Map([[hnLoser.id as string, hnLoser.id as string]])
    ).map((a) => a.owner);
    expect(owners).toEqual([hnCanonical.id, hnLoser.id, hnLoser.id]);
  });
});

describe("planUnmerge", () => {
  const canonical = item(1, "hn", "https://example.test/c", {
    status: "published",
    duplicate_of: null,
    rank_score: 0.5,
  });
  const snapshot = (rows: UnmergeItemRow[], sources: StoredSource[] = []) => ({
    items: new Map(rows.map((r) => [r.id as string, r])),
    sources: new Map([[canonical.id as string, sources]]),
    live: rows.filter((r) => r.status === "published").map(liveRef),
  });

  it("restores a VI-source row with the native translations row ingest writes", () => {
    const vi = item(8, "vnexpress-tech", "https://vnexpress.net/a.html", {
      title: "Tàu SpaceX lập kỷ lục",
      summary: "Tóm tắt.",
      source_lang: "vi",
    });
    const plan = planUnmerge(
      [{ canonicalId: canonical.id, mergedId: vi.id, group: vi.id }],
      snapshot([canonical, vi], [self(vi.url)]),
      NOW_MS
    );
    expect(plan.canonicals[0].translations).toEqual([
      {
        itemId: vi.id,
        before: null,
        after: { title: "Tàu SpaceX lập kỷ lục", summary: "Tóm tắt." },
      },
    ]);
  });

  it("restores a row under the relevance bar as rejected, as ingest would have", () => {
    const low = item(9, "latent-space", "https://example.test/ainews", {
      llm_relevance: 0.1,
    });
    const plan = planUnmerge(
      [{ canonicalId: canonical.id, mergedId: low.id, group: low.id }],
      snapshot([canonical, low]),
      NOW_MS
    );
    expect(plan.canonicals[0].pairs[0].outcome).toEqual({
      action: "restore",
      leadId: low.id,
      status: "rejected",
    });
  });

  it("drops a removed item's video poster from the canonical's image_url", () => {
    const video = {
      type: "video" as const,
      url: "https://www.youtube.com/watch?v=abc123",
      poster_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    };
    const manifest = JSON.stringify({ version: 1, assets: [video] });
    const withVideo = {
      ...canonical,
      image_url: video.poster_url,
      media_manifest: manifest,
    };
    const member = item(15, "techcrunch-ai", "https://example.test/video", {
      media_manifest: manifest,
      image_url: video.poster_url,
    });
    const plan = planUnmerge(
      [{ canonicalId: canonical.id, mergedId: member.id, group: member.id }],
      snapshot([withVideo, member]),
      NOW_MS
    );
    expect(plan.canonicals[0].leads[0]).toMatchObject({
      role: "canonical",
      before: video.poster_url,
      after: null,
    });
  });

  const rawManifest = (...urls: string[]) =>
    JSON.stringify({
      version: 1,
      assets: urls.map((url) => ({ type: "image", url })),
    });
  const canonicalAfter = (
    plan: ReturnType<typeof planUnmerge>,
    column: string
  ) =>
    plan.canonicals[0].rows
      .find((r) => r.role === "canonical")
      ?.changes.find((c) => c.column === column)?.after;

  it("drops a removed story's share card and avatar that its parsed manifest hides (production c8680b9d)", () => {
    // The stored manifests are raw: the merge kept every asset, while
    // `parseMediaManifest` drops the card next to a real photo and the
    // avatar altogether.
    const own =
      "https://vcdn1-vnexpress.vnecdn.net/2026/10/01/gemini-argon.png?w=1200";
    const grokCard =
      "https://huggingnews.com/og/grok-47-launches-in-general-apps-eb1f6886.png?v=1c9yll4";
    const grokPhoto =
      "https://static.huggingnews.com/story-media/2105725672089854306/HTkJvM5X0AArlmT-large.jpg";
    const portrait =
      "https://secure.gravatar.com/avatar/213d511460b4d497?d=identicon&r=g&s=96";
    const vn = {
      ...canonical,
      image_url: own,
      media_manifest: rawManifest(own, grokCard, grokPhoto, portrait),
    };
    const grok = item(16, "huggingnews", "https://huggingnews.com/ai/grok", {
      image_url: grokCard,
      media_manifest: rawManifest(grokCard, grokPhoto),
    });
    const other = item(17, "techcrunch-ai", "https://example.test/amazon", {
      image_url: "https://example.test/amazon.jpg",
      media_manifest: rawManifest("https://example.test/amazon.jpg", portrait),
    });
    const plan = planUnmerge(
      [
        { canonicalId: canonical.id, mergedId: grok.id, group: grok.id },
        { canonicalId: canonical.id, mergedId: other.id, group: other.id },
      ],
      snapshot([vn, grok, other]),
      NOW_MS
    );
    expect(canonicalAfter(plan, "media_manifest")).toBe(rawManifest(own));
  });

  it("leaves no removed avatar behind on a canonical with no image of its own (production 4474df4c)", () => {
    const photo = "https://techcrunch.com/wp-content/uploads/2026/08/g.jpg";
    const portrait =
      "https://secure.gravatar.com/avatar/213d511460b4d497?d=identicon&r=g&s=96";
    const hn = {
      ...canonical,
      image_url: photo,
      media_manifest: rawManifest(photo, portrait),
    };
    const amazon = item(18, "techcrunch-ai", "https://techcrunch.com/amazon", {
      image_url: photo,
      media_manifest: rawManifest(photo, portrait),
    });
    const plan = planUnmerge(
      [{ canonicalId: canonical.id, mergedId: amazon.id, group: amazon.id }],
      snapshot([hn, amazon]),
      NOW_MS
    );
    expect(canonicalAfter(plan, "media_manifest")).toBe(rawManifest());
    expect(canonicalAfter(plan, "image_url")).toBeNull();
  });

  it("keeps an asset a remaining member also carries in its raw manifest", () => {
    const card = "https://huggingnews.com/og/shared-story-aa11bb22.png?v=1";
    const photo = "https://example.test/real-photo.jpg";
    const withCard = {
      ...canonical,
      image_url: photo,
      media_manifest: rawManifest(photo, card),
    };
    const removed = item(19, "huggingnews", "https://huggingnews.com/a", {
      media_manifest: rawManifest(photo, card),
    });
    const stays = item(20, "marketbrief", "https://marketbrief.now/a", {
      media_manifest: rawManifest(card),
    });
    const plan = planUnmerge(
      [{ canonicalId: canonical.id, mergedId: removed.id, group: removed.id }],
      snapshot([withCard, removed, stays]),
      NOW_MS
    );
    expect(canonicalAfter(plan, "media_manifest")).toBe(rawManifest(card));
  });

  it("keeps a restored lead's own image over its twin's picture (production 0af325cb)", () => {
    const slug = "ai-agents-probed-white-house-df053323";
    const ownCard = `https://marketbrief.now/og/${slug}.png?v=l1q564`;
    const twinPhoto =
      "https://pbs.twimg.com/card_img/2105460326389161984/PeEQR7Oq?format=webp&name=medium";
    const lead = item(
      21,
      "marketbrief",
      `https://marketbrief.now/cyber/${slug}`,
      {
        points: 15,
        llm_importance: 6.79,
        image_url: ownCard,
        media_manifest: rawManifest(ownCard),
      }
    );
    const twin = item(
      22,
      "huggingnews",
      `https://huggingnews.com/cyber/${slug}`,
      {
        points: 1,
        llm_importance: 6.65,
        image_url: twinPhoto,
        media_manifest: rawManifest(
          twinPhoto,
          `https://huggingnews.com/og/${slug}.png?v=jifxl8`
        ),
      }
    );
    const plan = planUnmerge(
      [
        { canonicalId: canonical.id, mergedId: lead.id, group: "slug" },
        { canonicalId: canonical.id, mergedId: twin.id, group: "slug" },
      ],
      snapshot([canonical, lead, twin]),
      NOW_MS
    );
    expect(plan.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "restore",
      leadId: lead.id,
    });
    const leadRow = plan.canonicals[0].rows.find((r) => r.role === "lead");
    expect(leadRow?.changes.map((c) => c.column)).not.toContain("image_url");
    expect(plan.canonicals[0].leads).toContainEqual(
      expect.objectContaining({ id: lead.id, after: ownCard })
    );
  });

  it("refuses a demoted canonical, whose notifications and votes already moved", () => {
    const demoted = item(11, "techcrunch-ai", "https://example.test/old", {
      fetched_at: canonical.fetched_at - 3600,
    });
    const plan = planUnmerge(
      [{ canonicalId: canonical.id, mergedId: demoted.id, group: demoted.id }],
      snapshot([canonical, demoted]),
      NOW_MS
    );
    expect(plan.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "skip",
      reason: "demoted-canonical",
    });
    expect(plan.canonicals[0].rows).toEqual([]);
  });

  it("waits while the story is inside the send window, then restores it", () => {
    const recent = item(10, "techcrunch-ai", "https://example.test/recent", {
      published_at: NOW_MS / 1000 - UNMERGE_QUIET_SEC + 3600,
    });
    const pairs = [
      { canonicalId: canonical.id, mergedId: recent.id, group: recent.id },
    ];
    const now = planUnmerge(pairs, snapshot([canonical, recent]), NOW_MS);
    expect(now.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "skip",
      reason: "inside-quiet-window",
    });
    expect(now.canonicals[0].rows).toEqual([]);
    const later = planUnmerge(
      pairs,
      snapshot([canonical, recent]),
      NOW_MS + 2 * 3600 * 1000
    );
    expect(later.canonicals[0].pairs[0].outcome.action).toBe("restore");
  });
});

describe("planUnmerge: a restored story already live as another row", () => {
  const canonical = item(1, "hn", "https://example.test/c", {
    status: "published",
    duplicate_of: null,
    title: "Anthropic founders keep voting power after IPO",
    rank_score: 0.5,
  });
  const live = (n: number, sourceId: string, url: string, title: string) =>
    item(n, sourceId, url, {
      status: "published",
      duplicate_of: null,
      title,
      fetched_at: OLD + 1800,
      rank_score: 0.4,
    });
  const plan = (
    rows: UnmergeItemRow[],
    pairs: Record<string, unknown>[],
    sources: StoredSource[] = []
  ) => {
    const parsed = parseUnmergePairs(pairs);
    if ("error" in parsed) throw new Error(parsed.error);
    return planUnmerge(
      parsed.pairs,
      {
        items: new Map(rows.map((r) => [r.id as string, r])),
        sources: new Map([[canonical.id as string, sources]]),
        live: rows.filter((r) => r.status === "published").map(liveRef),
      },
      NOW_MS
    );
  };
  const pair = (merged: UnmergeItemRow, extra = {}) => ({
    canonicalId: canonical.id,
    mergedId: merged.id,
    ...extra,
  });

  // Production 7c2855a6 (marketbrief, merged into 310ebe3d) and ba4fcea9
  // (huggingnews, published on its own an hour later).
  const title = "Anthropic Backs Australian Laws for AI Agent Breach Reporting";
  const slug = "anthropic-backs-australian-laws-for-ai-agent-breach-86d58e08";
  const hidden = item(30, "marketbrief", `https://marketbrief.now/ai/${slug}`, {
    title,
  });
  const twin = live(
    31,
    "huggingnews",
    `https://huggingnews.com/ai/${slug}`,
    title
  );

  it("re-points it to its published aggregator twin instead of publishing a second copy", () => {
    const result = plan(
      [canonical, hidden, twin],
      [pair(hidden)],
      [self(hidden.url)]
    ).canonicals[0];
    expect(result.pairs[0].outcome).toEqual({
      action: "repoint",
      twinId: twin.id,
      rule: "aggregator-slug",
    });
    expect(result.rows.find((r) => r.id === hidden.id)?.changes).toEqual([
      { column: "duplicate_of", before: canonical.id, after: twin.id },
    ]);
    expect(
      result.rows.flatMap((r) => r.changes).filter((c) => c.column === "status")
    ).toEqual([]);
    expect(result.sources.find((s) => s.itemId === twin.id)?.after).toEqual([
      self(hidden.url),
    ]);
    // The canonical gives the story's source row back.
    expect(
      result.sources.find((s) => s.itemId === canonical.id)?.after
    ).toEqual([]);
  });

  it("re-points one vnexpress article under a second slug (production 1e98238c)", () => {
    const vnHidden = item(
      32,
      "vnexpress-tech",
      "https://vnexpress.net/tau-spacex-lap-ky-luc-bay-nhanh-nhat-den-tram-iss-5127535.html",
      { title: "Tàu SpaceX lập kỷ lục bay nhanh nhất đến trạm ISS" }
    );
    const vnLive = live(
      33,
      "vnexpress-tech",
      "https://vnexpress.net/spacex-lap-ky-luc-tau-vu-tru-my-bay-nhanh-nhat-den-tram-iss-5127535.html",
      "SpaceX lập kỷ lục tàu vũ trụ Mỹ bay nhanh nhất đến trạm ISS"
    );
    const result = plan([canonical, vnHidden, vnLive], [pair(vnHidden)]);
    expect(result.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "repoint",
      twinId: vnLive.id,
      rule: "article-id",
    });
    expect(result.canonicals[0].translations).toEqual([]);
  });

  // Production ff6e8971 and the-decoder's 3b1a6af7: one event, two URLs.
  const moonshot = item(
    34,
    "marketbrief",
    "https://marketbrief.now/ai/openai-disrupts-moonshot-ai-campaign-69cd8eaa",
    { title: "OpenAI Disrupts Moonshot AI Campaign to Extract Model Reasoning" }
  );
  const decoder = live(
    35,
    "the-decoder",
    "https://the-decoder.com/openai-says-it-stopped-a-campaign/",
    "OpenAI says it stopped a campaign to steal its models' reasoning, but the trick still worked on Azure"
  );

  it("holds a likely same event with a different URL for a human decision", () => {
    const result = plan([canonical, moonshot, decoder], [pair(moonshot)]);
    // The full id, so the owner can paste it into `sameAs`.
    expect(result.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "skip",
      reason: "needs-decision",
      candidates: [storyRef(decoder)],
    });
    expect(result.canonicals[0].rows).toEqual([]);
  });

  it("follows the pair's decision: distinctFrom publishes it, sameAs re-points it", () => {
    const distinctFrom = plan(
      [canonical, moonshot, decoder],
      [pair(moonshot, { distinctFrom: [decoder.id] })]
    );
    expect(distinctFrom.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "restore",
      status: "published",
    });
    const same = plan(
      [canonical, moonshot, decoder],
      [pair(moonshot, { sameAs: decoder.id })]
    );
    expect(same.canonicals[0].pairs[0].outcome).toEqual({
      action: "repoint",
      twinId: decoder.id,
      rule: "same-as",
    });
  });

  // #749 and #790 wrote `distinct: true` on every pair to mean "not the
  // canonical's story"; about 18 of #790's restores were live elsewhere.
  it("holds a distinct pair whose story is likely live as another row", () => {
    const result = plan(
      [canonical, moonshot, decoder],
      [pair(moonshot, { distinct: true })]
    );
    expect(result.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "skip",
      reason: "needs-decision",
      candidates: [storyRef(decoder)],
    });
  });

  it("re-points a distinct pair to a live row with its identity, even one distinctFrom names", () => {
    for (const decision of [{ distinct: true }, { distinctFrom: [twin.id] }]) {
      const result = plan(
        [canonical, hidden, twin],
        [pair(hidden, decision)],
        [self(hidden.url)]
      );
      expect(result.canonicals[0].pairs[0].outcome).toEqual({
        action: "repoint",
        twinId: twin.id,
        rule: "aggregator-slug",
      });
    }
  });

  it("lets distinct overrule identity with the canonical only", () => {
    const sameTitle = item(39, "techcrunch-ai", "https://example.test/t", {
      title: canonical.title,
    });
    expect(
      plan([canonical, sameTitle], [pair(sameTitle)]).canonicals[0].pairs[0]
        .outcome
    ).toMatchObject({ action: "skip", reason: "twin-is-canonical" });
    expect(
      plan([canonical, sameTitle], [pair(sameTitle, { distinct: true })])
        .canonicals[0].pairs[0].outcome
    ).toMatchObject({ action: "restore", status: "published" });
  });

  it("never treats a feed's reused title as the same story", () => {
    const today = item(36, "latent-space", "https://example.test/ainews-2", {
      title: "AINews: not much happened today",
    });
    const yesterday = live(
      37,
      "latent-space",
      "https://example.test/ainews-1",
      "AINews: not much happened today"
    );
    const result = plan(
      [canonical, today, { ...yesterday, published_at: OLD - 86_400 }],
      [pair(today)]
    );
    expect(result.canonicals[0].pairs[0].outcome.action).not.toBe("repoint");
  });

  it("re-points to the published row whose merged copy is the story's twin", () => {
    const root = live(
      40,
      "theverge-ai",
      "https://example.test/verge",
      "Anthropic backs Australian breach reporting laws for AI agents"
    );
    const copy = item(41, "huggingnews", `https://huggingnews.com/ai/${slug}`, {
      title,
      duplicate_of: root.id,
    });
    const parsed = parseUnmergePairs([pair(hidden)]);
    if ("error" in parsed) throw new Error(parsed.error);
    const result = planUnmerge(
      parsed.pairs,
      {
        items: new Map(
          [canonical, hidden, root, copy].map((r) => [r.id as string, r])
        ),
        sources: new Map(),
        live: [
          liveRef(canonical),
          liveRef(root),
          { ...storyRef(copy), root: root.id },
        ],
      },
      NOW_MS
    );
    expect(result.canonicals[0].pairs[0].outcome).toEqual({
      action: "repoint",
      twinId: root.id,
      rule: "aggregator-slug",
    });
  });

  it("holds a Vietnamese row whose English title is a live headline, never re-points it", () => {
    const vi = item(
      42,
      "vnexpress-tech",
      "https://vnexpress.net/a-5130002.html",
      {
        title: "Anthropic ủng hộ luật báo cáo sự cố tác tử AI tại Australia",
        source_lang: "vi",
        title_en: title,
      }
    );
    const english = live(
      43,
      "the-decoder",
      "https://example.test/decoder",
      title
    );
    const result = plan([canonical, vi, english], [pair(vi)]);
    expect(result.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "skip",
      reason: "needs-decision",
      candidates: [storyRef(english)],
    });
  });

  it("reads one page behind a trailing slash, www. or a fragment, but not another query", () => {
    const at = (n: number, url: string) => ({
      ...storyRef(item(n, "hn", url)),
      title: `t${n}`,
    });
    const page = at(50, "https://openai.com/index/mentalhealthbench/");
    for (const url of [
      "https://openai.com/index/mentalhealthbench",
      "https://www.openai.com/index/mentalhealthbench#results",
      "http://openai.com/index/mentalhealthbench/?utm_source=rss",
    ]) {
      expect(sameStoryRule(page, at(51, url))).toBe("url");
    }
    expect(
      sameStoryRule(
        at(52, "https://news.ycombinator.com/item?id=1"),
        at(53, "https://news.ycombinator.com/item?id=2")
      )
    ).toBeNull();
  });

  it("defers the second of two restored copies of one story until the first is live", () => {
    const other = item(2, "techcrunch-ai", "https://example.test/c2", {
      status: "published",
      duplicate_of: null,
      title: "Unrelated canonical",
      rank_score: 0.5,
    });
    const copy = item(38, "huggingnews", `https://huggingnews.com/ai/${slug}`, {
      title,
      duplicate_of: other.id,
    });
    const result = plan(
      [canonical, other, hidden, copy],
      [pair(hidden), { canonicalId: other.id, mergedId: copy.id }]
    );
    expect(result.canonicals[0].pairs[0].outcome.action).toBe("restore");
    expect(result.canonicals[1].pairs[0].outcome).toMatchObject({
      action: "skip",
      reason: "twin-restores-first",
    });
  });
});
