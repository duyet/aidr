import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  BREAKING_BOOST,
  BREAKING_IMPORTANCE,
  buildRerankQuery,
  ENGAGEMENT_BOOST_CAP,
  IMPORTANCE_EXPONENT,
  LOW_IMPORTANCE_ENGAGEMENT_CAP,
  RANK_SIGNAL_COLUMNS,
  RANK_SIGNAL_JOIN,
  type RankSignalRow,
  READER_VOTE_CAP,
  READER_VOTE_GAIN,
  rankScore,
  rankScoreWithoutBreaking,
  rankSignals,
  readerEngagement,
  rowRankSignals,
  sourceBoost,
  voteFactor,
} from "../ranking.js";

const NOW = Date.now();

describe("rankScore", () => {
  it("decays with age", () => {
    const fresh = rankScore({
      importance: 8,
      quality: 8,
      points: 100,
      comments: 20,
      publishedAt: NOW,
      now: NOW,
    });
    const old = rankScore({
      importance: 8,
      quality: 8,
      points: 100,
      comments: 20,
      publishedAt: NOW - 48 * 60 * 60 * 1000,
      now: NOW,
    });
    expect(old).toBeLessThan(fresh);
  });

  it("is monotonic in engagement (points/comments)", () => {
    const base = { importance: 5, quality: 5, publishedAt: NOW, now: NOW };
    const low = rankScore({ ...base, points: 1, comments: 0 });
    const high = rankScore({ ...base, points: 500, comments: 200 });
    expect(high).toBeGreaterThan(low);
  });

  it("lets reader votes and downvotes move the score", () => {
    const base = {
      importance: 8,
      quality: 8,
      points: 40,
      comments: 10,
      publishedAt: NOW,
      now: NOW,
    };
    const plain = rankScore(base);
    expect(rankScore({ ...base, voteNet: 5 })).toBeGreaterThan(plain);
    expect(rankScore({ ...base, voteNet: -5 })).toBeLessThan(plain);
    expect(
      rankScore({ ...base, points: 0, comments: 0, voteNet: -100 })
    ).toBeGreaterThan(0);
    // Without votes the engagement term is the plain source log.
    expect(readerEngagement(40, 10)).toBeCloseTo(
      1 + Math.log10(1 + 40 + 0.5 * 10),
      10
    );
  });

  it("is monotonic in quality", () => {
    const base = {
      importance: 5,
      points: 10,
      comments: 5,
      publishedAt: NOW,
      now: NOW,
    };
    const lowQuality = rankScore({ ...base, quality: 1 });
    const highQuality = rankScore({ ...base, quality: 10 });
    expect(highQuality).toBeGreaterThan(lowQuality);
  });

  it("scales with importance", () => {
    const base = {
      quality: 5,
      points: 10,
      comments: 5,
      publishedAt: NOW,
      now: NOW,
    };
    const lowImportance = rankScore({ ...base, importance: 1 });
    const highImportance = rankScore({ ...base, importance: 10 });
    expect(highImportance).toBeGreaterThan(lowImportance);
  });

  it("never returns negative for valid inputs", () => {
    const score = rankScore({
      importance: 0,
      quality: 0,
      points: 0,
      comments: 0,
      publishedAt: NOW,
      now: NOW,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("rank reachability", () => {
  it("can exceed 25 for an exceptional fresh, well-engaged story", () => {
    // importance 10 × quality 1.0 × decay 1.0 × (1+log10(1+200+20))
    const score = rankScore({
      importance: 10,
      quality: 10,
      points: 200,
      comments: 40,
      publishedAt: NOW,
      now: NOW,
    });
    expect(score).toBeGreaterThanOrEqual(25);
  });

  it("prefers multi-source items over a thin single-source duplicate of equal quality", () => {
    const base = {
      importance: 7,
      quality: 6,
      points: 20,
      comments: 4,
      publishedAt: NOW,
      now: NOW,
    };
    const thin = rankScore({ ...base, sourceCount: 1 });
    const backed = rankScore({ ...base, sourceCount: 4 });
    expect(backed).toBeGreaterThan(thin);
    expect(backed / thin).toBeCloseTo(sourceBoost(4) / sourceBoost(1), 5);
  });

  it("caps corroboration so mirror piles cannot dominate", () => {
    const base = {
      importance: 7,
      quality: 6,
      points: 20,
      comments: 4,
      publishedAt: NOW,
      now: NOW,
    };
    const eight = rankScore({ ...base, sourceCount: 8 });
    const twenty = rankScore({ ...base, sourceCount: 20 });
    expect(twenty).toBe(eight);
    expect(sourceBoost(0)).toBe(1);
    // One outlet is not corroboration.
    expect(sourceBoost(1)).toBe(1);
  });

  it("stays below 25 for a typical live-max story (~importance 8, modest engagement)", () => {
    const score = rankScore({
      importance: 8,
      quality: 8,
      points: 40,
      comments: 10,
      publishedAt: NOW - 6 * 60 * 60 * 1000,
      now: NOW,
    });
    expect(score).toBeLessThan(25);
  });
});

describe("hourly re-rank keeps the source boost", () => {
  // Prod 2026-09-29, item 98b45e32: 8 item_sources, cleared rank 20 at
  // insert, then the hourly re-rank rewrote it without sourceCount and it
  // fell under the trending bar (8.66 stored at ~8h old).
  const item = {
    importance: 7,
    quality: 1,
    points: 13,
    comments: 25,
    publishedAt: 1_790_659_371_000,
    now: 1_790_659_371_000 + 8.09 * 3_600_000,
  };

  it("prices the dropped sourceCount at the full boost", () => {
    // The 8.66 stored in prod came from the formula before 2026-10-11, so it
    // is no longer a fixture. The regression it caught was a re-rank that
    // dropped sourceCount, which must still cost the whole boost.
    const rebuilt = rankScore(item);
    const corroborated = rankScore({ ...item, sourceCount: 8 });
    expect(corroborated).toBeGreaterThan(rebuilt);
    expect(corroborated / rebuilt).toBeLessThanOrEqual(sourceBoost(8));
  });

  it("reads the cluster signals for every re-ranked row", () => {
    expect(buildRerankQuery()).toContain(RANK_SIGNAL_COLUMNS);
    expect(buildRerankQuery()).toContain(RANK_SIGNAL_JOIN);
  });
});

describe("corroboration counts independent outlets, not tweets", () => {
  const member = (sourceId: string, points = 0, comments = 0) => ({
    sourceId,
    points,
    comments,
  });

  // An aggregator story carries up to 8 tweets as item_sources; they are one
  // outlet's view, so the story ranks as uncorroborated.
  it("gives an aggregator item with 8 tweets and no merges no boost", () => {
    const signals = rankSignals([member("huggingnews", 8, 8)]);
    expect(signals.sourceCount).toBe(1);
    expect(sourceBoost(signals.sourceCount)).toBe(1);
  });

  it("boosts HN + TechCrunch + Verge coverage as three families", () => {
    const signals = rankSignals([
      member("hn", 120, 40),
      member("techcrunch-ai"),
      member("theverge-ai"),
    ]);
    expect(signals.sourceCount).toBe(3);
    expect(sourceBoost(signals.sourceCount)).toBeCloseTo(1.24, 6);
  });

  // HuggingNews and MarketBrief publish the same stories under the same slugs.
  it("counts the aggregator mirror pair as one family", () => {
    expect(
      rankSignals([member("huggingnews"), member("marketbrief")]).sourceCount
    ).toBe(1);
  });

  it("ignores aggregator author/tweet counts as engagement", () => {
    const signals = rankSignals([
      member("huggingnews", 120, 319),
      member("marketbrief", 89, 136),
    ]);
    expect(signals.points).toBe(0);
    expect(signals.comments).toBe(0);
  });

  it("takes HN points and comments as engagement, even merged into an aggregator story", () => {
    const signals = rankSignals([
      member("huggingnews", 120, 319),
      member("hn", 250, 90),
    ]);
    expect(signals).toEqual({ points: 250, comments: 90, sourceCount: 2 });
    const base = { importance: 7, quality: 6, publishedAt: NOW, now: NOW };
    expect(rankScore({ ...base, ...signals })).toBeGreaterThan(
      rankScore({ ...base, ...rankSignals([member("huggingnews", 120, 319)]) })
    );
  });

  // The SQL re-rank must see the same cluster the insert scored.
  it("reads the merged members back through the real SQL", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, source_id TEXT,
      points INTEGER, comments INTEGER, status TEXT, duplicate_of TEXT,
      url TEXT);
      CREATE TABLE item_votes (item_id TEXT NOT NULL, user_id TEXT NOT NULL,
        value INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (item_id, user_id))`);
    const add = db.prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?)");
    const at = (id: string) => `https://example.com/${id}`;
    add.run("canon", "huggingnews", 120, 319, "published", null, at("canon"));
    add.run("m1", "marketbrief", 89, 136, "merged", "canon", at("m1"));
    add.run("m2", "hn", 250, 90, "merged", "canon", at("m2"));
    add.run("m3", "theverge-ai", 0, 0, "rejected", "canon", at("m3"));
    add.run("alone", "hn", 30, 5, "published", null, at("alone"));
    // Cloudflare's post from its feed, plus a reader's submission of it.
    const clef = "https://blog.cloudflare.com/clef-decision-models/";
    add.run("post", "cloudflare-blog", 0, 0, "published", null, clef);
    add.run("sub", "user", 0, 0, "merged", "post", `${clef}?ref=x`);
    add.run("agg", "huggingnews", 0, 0, "merged", "post", at("agg"));
    db.prepare(
      "INSERT INTO item_votes VALUES ('canon', 'user_a', 1, 1), ('alone', 'user_a', 1, 1), ('alone', 'user_b', -1, 1)"
    ).run();
    const read = (id: string) =>
      rowRankSignals(
        db
          .prepare(
            `SELECT ${RANK_SIGNAL_COLUMNS} FROM items ${RANK_SIGNAL_JOIN} WHERE id = ?`
          )
          .get(id) as unknown as RankSignalRow
      );
    expect(read("canon")).toEqual({
      points: 250,
      comments: 90,
      sourceCount: 2,
      voteNet: 1,
    });
    expect(read("alone")).toEqual({
      points: 30,
      comments: 5,
      sourceCount: 1,
      voteNet: 0,
    });
    // The submission is the Cloudflare outlet again, not a third source.
    expect(read("post").sourceCount).toBe(2);
  });
});

describe("reader votes", () => {
  it("one vote is a clear nudge and five roughly double the story", () => {
    expect(voteFactor(0)).toBe(1);
    expect(voteFactor(1)).toBeCloseTo(1 + READER_VOTE_GAIN, 10);
    expect(voteFactor(5)).toBeCloseTo(2, 10);
  });

  it("is bounded: votes past the cap add nothing", () => {
    expect(voteFactor(READER_VOTE_CAP + 10)).toBe(voteFactor(READER_VOTE_CAP));
    expect(voteFactor(-READER_VOTE_CAP - 10)).toBe(
      voteFactor(-READER_VOTE_CAP)
    );
  });

  it("lowers but never erases a story on downvotes", () => {
    for (const net of [-1, -5, -50]) {
      const f = voteFactor(net);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
    }
    expect(voteFactor(-5)).toBeLessThan(voteFactor(-1));
  });

  it("moves a story by the same ratio whatever its HN points", () => {
    const base = {
      importance: 8,
      quality: 8,
      publishedAt: NOW - 30 * 3_600_000,
      now: NOW,
      comments: 0,
    };
    // Yandex outage 2026-10-11: with the old weight-10-in-the-log term, one
    // vote on a zero-point story doubled its engagement and put it at #2.
    for (const points of [0, 40, 400]) {
      const ratio =
        rankScore({ ...base, points, voteNet: 1 }) /
        rankScore({ ...base, points });
      expect(ratio).toBeCloseTo(voteFactor(1), 10);
    }
  });
});

describe("ranking rules from the 2026-10-11 replay", () => {
  const H = 3_600_000;
  const base = {
    importance: 7,
    quality: 7,
    points: 100,
    comments: 20,
    sourceCount: 1,
    now: NOW,
  };

  it("decays faster after 24h than the plain 36h curve", () => {
    const at = (hours: number) =>
      rankScore({ ...base, publishedAt: NOW - hours * H });
    expect(at(12) / at(0)).toBeCloseTo(Math.exp(-12 / 36), 10);
    expect(at(48) / at(24)).toBeCloseTo(
      Math.exp(-24 / 36) * Math.exp(-24 / 24),
      10
    );
  });

  it("caps engagement x corroboration so volume cannot hold a stale top", () => {
    const at = (points: number, comments: number) =>
      rankScore({
        ...base,
        points,
        comments,
        sourceCount: 8,
        publishedAt: NOW,
      });
    expect(at(100_000, 5000)).toBeCloseTo(at(2000, 500), 10);
    expect(at(100_000, 5000) / at(0, 0)).toBeGreaterThan(
      ENGAGEMENT_BOOST_CAP / 2
    );
    const single = (points: number) =>
      rankScore({
        ...base,
        points,
        comments: 0,
        sourceCount: 1,
        publishedAt: NOW,
      });
    expect(single(1_000_000) / single(0)).toBeCloseTo(ENGAGEMENT_BOOST_CAP, 10);
  });

  it("spreads importance: a 9 beats a 7 by more than the linear 9/7", () => {
    const at = (importance: number) =>
      rankScoreWithoutBreaking({
        ...base,
        importance,
        publishedAt: NOW - 30 * H,
      });
    expect(at(9) / at(7)).toBeCloseTo((9 / 7) ** IMPORTANCE_EXPONENT, 10);
    expect(at(9) / at(7)).toBeGreaterThan(9 / 7);
  });

  it("keeps a minor item's engagement boost small", () => {
    const quiet = {
      ...base,
      importance: 3,
      points: 0,
      comments: 0,
      publishedAt: NOW,
    };
    const viral = { ...quiet, points: 2000, comments: 600 };
    expect(rankScore(viral) / rankScore(quiet)).toBeCloseTo(
      LOW_IMPORTANCE_ENGAGEMENT_CAP,
      10
    );
    expect(
      rankScore({ ...viral, importance: 4 }) /
        rankScore({ ...quiet, importance: 4 })
    ).toBeGreaterThan(LOW_IMPORTANCE_ENGAGEMENT_CAP);
  });

  it("boosts fresh importance >= 8 and fades the boost within hours", () => {
    const lift = (importance: number, hours: number) => {
      const input = { ...base, importance, publishedAt: NOW - hours * H };
      return rankScore(input) / rankScoreWithoutBreaking(input);
    };
    expect(lift(BREAKING_IMPORTANCE, 0)).toBeCloseTo(1 + BREAKING_BOOST, 10);
    expect(lift(BREAKING_IMPORTANCE, 12)).toBeLessThan(1.01);
    expect(lift(BREAKING_IMPORTANCE - 1, 0)).toBe(1);
  });
});
