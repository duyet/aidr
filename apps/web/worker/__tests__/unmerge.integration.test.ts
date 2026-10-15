/**
 * Unmerge (#733) on real SQLite with every migration. The wrong merge goes
 * through the real ingest write path, so "pre-merge shape" is what ingest
 * itself wrote: the canonical before the merge, and the twins as ingest
 * writes them when nothing else is in their cluster.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { undoUnmerge, unmergeItems } from "../admin/handlers.js";
import { MAX_SOURCES_PER_ITEM } from "../d1-bind.js";
import { buildMergePlan, type ExistingCandidate } from "../dedupe.js";
import type { IngestContext, NewRow } from "../ingest/context.js";
import { buildMergeCandidates, EMPTY_MERGE_PLAN } from "../ingest/merge.js";
import type { ItemScore } from "../ingest/score.js";
import { writeItems } from "../ingest/write.js";
import { dispatchStoryNotifications } from "../notify/index.js";
import type { FetchedItem } from "../sources/types.js";
import { MAX_MERGED_TOPICS } from "../topics.js";
import type { Env } from "../types.js";
import {
  applyUnmerge,
  UNMERGE_AUDIT_CANONICAL,
  UNMERGE_AUDIT_ROW,
  UNMERGE_AUDIT_SOURCES,
} from "../unmerge/apply.js";
import { d1Select, loadUnmergeSnapshot } from "../unmerge/load.js";
import {
  parseUnmergePairs,
  planUnmerge,
  UNMERGE_QUIET_SEC,
  type UnmergePair,
} from "../unmerge/plan.js";

function parsePairs(raw: unknown): UnmergePair[] {
  const parsed = parseUnmergePairs(raw);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.pairs;
}

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next as SqliteInput[];
        return prepared;
      },
      all: async () => ({ results: statement.all(...args) as unknown[] }),
      first: async () => statement.get(...args) ?? null,
      run: async () => {
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return prepared;
  }

  async batch(statements: Array<{ all: () => Promise<unknown> }>) {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const statement of statements) out.push(await statement.all());
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

// 10:00 in the audience timezone: inside the trending hours.
const NOW = new Date("2026-10-14T03:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);
const OLD = NOW_SEC - 10 * 86_400;

const id = (n: number) => n.toString(16).padStart(64, "0");
const C = id(0xc1);
const HUG = id(0xa1);
const MB = id(0xa2);
const RECENT_C = id(0xc2);
const RECENT_L = id(0xb1);

const slug = "anjney-midha-launches-4-b300-gpu-nodes-2f269c2e";
const HUG_URL = `https://huggingnews.com/ai/${slug}`;
const MB_URL = `https://marketbrief.now/ai/${slug}`;
const HUG_IMG = `https://huggingnews.com/og/${slug}.png?v=1`;
const MB_IMG = `https://marketbrief.now/og/${slug}.png?v=2`;
const LOSER_TITLE = "Anjney Midha Launches $4 B300 GPU Nodes for Gov and Edu";

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  return db;
}

function ingest(db: DatabaseSync): IngestContext {
  return {
    env: { DB: new SqliteD1(db) as unknown as D1Database } as Env,
    step: { do: (_name: string, fn: () => Promise<unknown>) => fn() },
  } as unknown as IngestContext;
}

function row(rowId: string, sourceId: string, item: FetchedItem): NewRow {
  return {
    id: rowId,
    source: { id: sourceId, type: "rss", config: "{}", enabled: 1 },
    item,
  };
}

const score = (importance: number): ItemScore => ({
  i: 0,
  relevance: 0.9,
  importance,
  quality: 6,
  category: "",
  tags: [],
  tokens: 0,
});

function canonicalRow(rowId: string, publishedAt: number, slugPart: string) {
  return row(rowId, "hn", {
    url: `https://www.example.test/${slugPart}`,
    title:
      "Study: Claude, ChatGPT Offer Different Shopping Prices Based on Wealth",
    publishedAt,
    points: 15,
    comments: 1,
    sources: [
      {
        kind: "discussion",
        author: "sbulaev",
        postedAt: publishedAt,
        url: `https://news.ycombinator.com/item?id=${slugPart}`,
      },
    ],
  });
}

/** The huggingnews and marketbrief copies of one unrelated story. */
function twins(publishedAt: number): NewRow[] {
  return [
    row(HUG, "huggingnews", {
      url: HUG_URL,
      title: LOSER_TITLE,
      publishedAt,
      points: 1,
      comments: 5,
      imageUrl: HUG_IMG,
      mediaManifest: { version: 1, assets: [{ type: "image", url: HUG_IMG }] },
      sources: [
        {
          kind: "source",
          author: "@anjneymidha",
          postedAt: publishedAt - 600,
          url: "https://x.com/AnjneyMidha/status/1",
        },
      ],
    }),
    row(MB, "marketbrief", {
      url: MB_URL,
      title: LOSER_TITLE,
      publishedAt,
      points: 3,
      comments: 5,
      imageUrl: MB_IMG,
      mediaManifest: { version: 1, assets: [{ type: "image", url: MB_IMG }] },
      sources: [{ kind: "source", url: MB_URL, postedAt: publishedAt }],
    }),
  ];
}

// The crocodile story (production c5196093): a marketbrief canonical, its
// correct huggingnews twin, and a wrong techcrunch story with a real photo.
const CROC = id(0xc3);
const CROC_TWIN = id(0xa3);
const WRONG = id(0xa4);
const crocSlug = "singapore-charges-man-for-ai-crocodile-image-96a9f0c1";
const CROC_CARD = `https://marketbrief.now/og/${crocSlug}.png?v=1`;
const TWIN_CARD = `https://huggingnews.com/og/${crocSlug}.png?v=2`;
const WRONG_PHOTO =
  "https://techcrunch.com/wp-content/uploads/2026/09/openai-getty.jpg";

// Production 7c2855a6 / ba4fcea9: the marketbrief copy went into the wrong
// canonical, then the huggingnews copy published on its own, because ingest
// clusters only against published rows.
const LIVE = id(0xb2);
const HIDDEN = id(0xa6);
const AUS_SLUG = "anthropic-backs-australian-laws-86d58e08";
const AUS_TITLE =
  "Anthropic Backs Australian Laws for AI Agent Breach Reporting";

const TAGS = new Map([
  [C, ["anthropic", "llm"]],
  [HUG, ["nvidia", "funding"]],
  [MB, ["nvidia", "funding"]],
  [CROC, ["safety"]],
  [CROC_TWIN, ["safety", "crime"]],
  [WRONG, ["crime", "openai"]],
  [LIVE, ["anthropic", "policy"]],
  [HIDDEN, ["anthropic", "policy"]],
]);

function australiaCopies(publishedAt: number) {
  const card = (host: string) =>
    `https://${host}/og/${AUS_SLUG}.png?v=${host.length}`;
  const copy = (rowId: string, sourceId: string, host: string) =>
    row(rowId, sourceId, {
      url: `https://${host}/ai/${AUS_SLUG}`,
      title: AUS_TITLE,
      publishedAt,
      points: 2,
      imageUrl: card(host),
      mediaManifest: {
        version: 1,
        assets: [{ type: "image", url: card(host) }],
      },
      sources: [
        {
          kind: "source",
          url: `https://${host}/ai/${AUS_SLUG}`,
          postedAt: publishedAt,
        },
      ],
    });
  return {
    hidden: copy(HIDDEN, "marketbrief", "marketbrief.now"),
    live: copy(LIVE, "huggingnews", "huggingnews.com"),
  };
}

async function writeCanonical(
  db: DatabaseSync,
  newRow: NewRow,
  nowSec: number
) {
  await writeItems(ingest(db), {
    newRows: [newRow],
    scored: new Map([[newRow.id, score(6)]]),
    translated: new Map(),
    mergePlan: EMPTY_MERGE_PLAN,
    canonicalTagsByItem: TAGS,
    now: nowSec * 1000,
  });
}

/** Ingest's merge of `newRows` into `existing` (none: they only cluster
 * with each other), written by the real write step. */
async function writeCluster(
  db: DatabaseSync,
  newRows: NewRow[],
  existing: { id: string; row: NewRow } | null,
  nowSec: number,
  importance = 5
) {
  const scored = new Map(newRows.map((r) => [r.id, score(importance)]));
  const existingById = new Map<string, ExistingCandidate>(
    existing
      ? [
          [
            existing.id,
            {
              points: existing.row.item.points ?? 0,
              comments: existing.row.item.comments ?? 0,
              imageUrl: existing.row.item.imageUrl ?? null,
              mediaManifest: existing.row.item.mediaManifest ?? null,
              sourceId: existing.row.source.id,
              url: existing.row.item.url,
              topics: TAGS.get(existing.id),
            },
          ],
        ]
      : []
  );
  const candidates = buildMergeCandidates(newRows, scored, TAGS, nowSec * 1000);
  const mergePlan = buildMergePlan(
    [
      {
        new: candidates.map((c) => c.i),
        existing: existing ? [existing.id] : [],
      },
    ],
    candidates,
    existingById,
    MAX_SOURCES_PER_ITEM,
    MAX_MERGED_TOPICS
  );
  await writeItems(ingest(db), {
    newRows,
    scored,
    translated: new Map(),
    mergePlan,
    canonicalTagsByItem: TAGS,
    now: nowSec * 1000,
  });
}

const SHAPE = `status, duplicate_of, points, comments, tags, image_url, media_manifest`;

function shape(db: DatabaseSync, rowId: string) {
  return db.prepare(`SELECT ${SHAPE} FROM items WHERE id = ?`).get(rowId);
}

function sources(db: DatabaseSync, rowId: string) {
  return db
    .prepare(
      "SELECT position, kind, author, posted_at, quote, url FROM item_sources WHERE item_id = ? ORDER BY position"
    )
    .all(rowId);
}

function dump(db: DatabaseSync) {
  return [
    "items",
    "item_sources",
    "translations",
    "admin_audit",
    "notifications",
  ].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all());
}

/** items, item_sources and translations: everything an unmerge writes
 * besides its own audit rows. */
function tables(db: DatabaseSync) {
  return ["items", "item_sources", "translations"].map((table) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()
  );
}

// A Vietnamese story the same wrong cluster call put into the canonical.
const VI = id(0xa5);

async function writeVietnameseLoser() {
  const url = "https://vnexpress.net/tau-spacex-lap-ky-luc-5127535.html";
  await writeCluster(
    db,
    [
      row(VI, "vnexpress-tech", {
        url,
        title: "Tàu SpaceX lập kỷ lục bay nhanh nhất đến trạm ISS",
        summary: "Tàu Crew Dragon đến trạm ISS sau 3 giờ bay.",
        publishedAt: OLD + 8500,
        sourceLang: "vi",
        imageUrl: "https://vcdn1-vnexpress.vnecdn.net/2026/10/02/crew.jpg",
        sources: [{ kind: "source", url, postedAt: OLD + 8500 }],
      }),
    ],
    { id: C, row: canonical },
    OLD + 9500
  );
}

const canonical = canonicalRow(C, OLD, "shopping");
const pairs = [
  { canonicalId: C, mergedId: HUG, group: "anjney" },
  { canonicalId: C, mergedId: MB, group: "anjney" },
];

let db: DatabaseSync;
let env: Env;
let preMerge: { shape: unknown; sources: unknown[] };
let insertRank: Map<string, number>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db = migratedDb();
  await writeCanonical(db, canonical, OLD + 600);
  preMerge = { shape: shape(db, C), sources: sources(db, C) };
  // The LLM cluster call put the twins into the unrelated canonical.
  await writeCluster(
    db,
    twins(OLD + 8000),
    { id: C, row: canonical },
    OLD + 9000
  );
  insertRank = new Map(
    (
      db
        .prepare("SELECT id, rank_score FROM items WHERE id IN (?, ?)")
        .all(HUG, MB) as { id: string; rank_score: number }[]
    ).map((r) => [r.id, r.rank_score])
  );
  env = { DB: new SqliteD1(db) as unknown as D1Database } as Env;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  db.close();
});

describe("unmerge", () => {
  it("the merge under test hid the story and moved its sources, tags and image", () => {
    expect(shape(db, HUG)).toMatchObject({ status: "merged", duplicate_of: C });
    expect(shape(db, C)).toMatchObject({
      image_url: expect.stringContaining("/og/"),
    });
    expect(sources(db, C)).toHaveLength(4);
  });

  it("a dry run writes nothing and says what it would change", async () => {
    const before = dump(db);
    const result = await unmergeItems(env, { pairs });
    if ("error" in result) throw new Error(result.error);
    expect(result.dryRun).toBe(true);
    expect(result.counts.pairs).toEqual({ restore: 1, regroup: 1 });
    expect(result.plan.canonicals[0].rows.map((r) => r.role)).toEqual([
      "canonical",
      "lead",
      "twin",
    ]);
    expect(dump(db)).toEqual(before);
  });

  it("returns both rows to their pre-merge shape", async () => {
    const result = await unmergeItems(env, { pairs, dryRun: false });
    if ("error" in result) throw new Error(result.error);

    // The canonical is what ingest wrote before the merge.
    expect(shape(db, C)).toEqual(preMerge.shape);
    expect(sources(db, C)).toEqual(preMerge.sources);

    // The twins are what ingest writes for them with no canonical to join.
    const oracle = migratedDb();
    await writeCanonical(oracle, canonical, OLD + 600);
    await writeCluster(oracle, twins(OLD + 8000), null, OLD + 9000);
    for (const rowId of [HUG, MB]) {
      expect(shape(db, rowId)).toEqual(shape(oracle, rowId));
      expect(sources(db, rowId)).toEqual(sources(oracle, rowId));
    }
    const lead = [HUG, MB].find(
      (rowId) =>
        (shape(oracle, rowId) as { status: string }).status === "published"
    ) as string;
    expect(sources(db, lead).length).toBeGreaterThan(0);
    oracle.close();

    // Scored like its day, not with the insert-time score of a fresh story.
    const leadRank = (
      db.prepare("SELECT rank_score FROM items WHERE id = ?").get(lead) as {
        rank_score: number;
      }
    ).rank_score;
    expect(leadRank).toBeLessThan(insertRank.get(lead) as number);

    const audit = db
      .prepare("SELECT action, detail FROM admin_audit ORDER BY id")
      .all() as { action: string; detail: string }[];
    // One row per write target, then the canonical's summary.
    expect(audit.map((a) => a.action)).toEqual([
      UNMERGE_AUDIT_ROW,
      UNMERGE_AUDIT_ROW,
      UNMERGE_AUDIT_ROW,
      UNMERGE_AUDIT_SOURCES,
      UNMERGE_AUDIT_SOURCES,
      UNMERGE_AUDIT_CANONICAL,
    ]);
    // The before-state is kept, so the unmerge itself can be reversed.
    const written = audit.map((a) => JSON.parse(a.detail));
    const canonicalSources = written.find(
      (d) => d.kind === "sources" && d.target.itemId === C
    );
    expect(canonicalSources.target.before).toHaveLength(4);
    const canonicalRowAudit = written.find(
      (d) => d.kind === "row" && d.target.id === C
    );
    expect(
      canonicalRowAudit.target.changes.find(
        (c: { column: string }) => c.column === "image_url"
      ).before
    ).toContain("/og/");
  });

  it("a repeated unmerge changes nothing", async () => {
    await unmergeItems(env, { pairs, dryRun: false });
    const after = dump(db);
    const again = await unmergeItems(env, { pairs, dryRun: false });
    if ("error" in again) throw new Error(again.error);
    expect(again.counts.pairs).toEqual({ "noop:already-unmerged": 2 });
    expect(again.applied).toMatchObject({
      canonicals: 0,
      statements: 0,
      remaining: 0,
      stale: [],
    });
    expect(dump(db)).toEqual(after);
  });

  it("stops at the statement budget without a partial canonical; a rerun finishes", async () => {
    const before = dump(db);
    const plan = planUnmerge(
      parsePairs(pairs),
      await loadUnmergeSnapshot(d1Select(env.DB), parsePairs(pairs)),
      NOW.getTime()
    );
    expect(await applyUnmerge(env.DB, plan, 1)).toMatchObject({
      canonicals: 0,
      statements: 0,
      remaining: 1,
    });
    expect(dump(db)).toEqual(before);
    const rerun = await unmergeItems(env, { pairs, dryRun: false });
    if ("error" in rerun) throw new Error(rerun.error);
    expect(rerun.applied?.remaining).toBe(0);
    expect(shape(db, C)).toEqual(preMerge.shape);
  });

  it.each([
    [
      "an admin hid the canonical",
      "UPDATE items SET status = 'rejected' WHERE id = ?",
    ],
    ["its points refreshed", "UPDATE items SET points = 99 WHERE id = ?"],
    [
      "a source row was added",
      "INSERT INTO item_sources (item_id, position, kind, url) VALUES (?, 7, 'support', 'https://x.com/late/status/1')",
    ],
  ])("writes nothing when, after the plan was read, %s", async (_case, sql) => {
    const plan = planUnmerge(
      parsePairs(pairs),
      await loadUnmergeSnapshot(d1Select(env.DB), parsePairs(pairs)),
      NOW.getTime()
    );
    db.prepare(sql).run(C);
    const before = dump(db);
    const result = await applyUnmerge(env.DB, plan);
    expect(dump(db)).toEqual(before);
    expect(result).toMatchObject({ canonicals: 0, stale: [C] });
  });

  it("stops at a batch that fails for another reason and still returns the batch id", async () => {
    const plan = planUnmerge(
      parsePairs(pairs),
      await loadUnmergeSnapshot(d1Select(env.DB), parsePairs(pairs)),
      NOW.getTime()
    );
    const before = dump(db);
    const failing = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: async () => {
        throw new Error("D1_ERROR: Network connection lost.");
      },
    } as unknown as D1Database;
    expect(await applyUnmerge(failing, plan)).toMatchObject({
      batchId: NOW.getTime(),
      canonicals: 0,
      failed: { canonicalId: C, error: expect.stringContaining("Network") },
    });
    expect(dump(db)).toEqual(before);
  });

  it("records every write in admin_audit: the lead's new sources and its VI translation too", async () => {
    await writeVietnameseLoser();
    const result = await unmergeItems(env, {
      pairs: [...pairs, { canonicalId: C, mergedId: VI }],
      dryRun: false,
    });
    if ("error" in result) throw new Error(result.error);
    const details = (
      db.prepare("SELECT detail FROM admin_audit ORDER BY id").all() as {
        detail: string;
      }[]
    ).map((a) => JSON.parse(a.detail));
    const written = (itemId: string, kind: string) =>
      details.find((d) => d.kind === kind && d.target?.itemId === itemId)
        ?.target;
    const lead = [HUG, MB].find(
      (rowId) => (shape(db, rowId) as { status: string }).status === "published"
    ) as string;
    expect(written(lead, "sources")).toEqual({
      itemId: lead,
      before: [],
      after: sources(db, lead).map(({ position, ...rest }) => rest),
    });
    expect(written(VI, "translation")).toEqual({
      itemId: VI,
      before: null,
      after: db
        .prepare(
          "SELECT title, summary FROM translations WHERE item_id = ? AND lang = 'vi'"
        )
        .get(VI),
    });
  });

  it("undo returns every row an apply wrote to its pre-apply state", async () => {
    await writeVietnameseLoser();
    const preApply = tables(db);
    const applied = await unmergeItems(env, {
      pairs: [...pairs, { canonicalId: C, mergedId: VI }],
      dryRun: false,
    });
    if ("error" in applied) throw new Error(applied.error);
    const batchId = applied.applied?.batchId as number;
    expect(tables(db)).not.toEqual(preApply);

    const dry = await undoUnmerge(env, { batchId });
    if ("error" in dry) throw new Error(dry.error);
    expect(dry.dryRun).toBe(true);
    expect(dry.plan.canonicals.map((c) => c.state)).toEqual(["undo"]);
    expect(tables(db)).not.toEqual(preApply);

    const undone = await undoUnmerge(env, { batchId, dryRun: false });
    if ("error" in undone) throw new Error(undone.error);
    expect(tables(db)).toEqual(preApply);

    const again = await undoUnmerge(env, { batchId, dryRun: false });
    if ("error" in again) throw new Error(again.error);
    expect(again.plan.canonicals.map((c) => c.state)).toEqual(["noop"]);
    expect(tables(db)).toEqual(preApply);
  });

  it("merges a story already live into its live copy, as ingest would have, and publishes nothing new", async () => {
    const { hidden, live } = australiaCopies(OLD + 7000);
    await writeCluster(db, [hidden], { id: C, row: canonical }, OLD + 9600);
    await writeCanonical(db, live, OLD + 9700);
    const published = () =>
      db
        .prepare("SELECT id FROM items WHERE status = 'published' ORDER BY id")
        .all();
    const publishedBefore = published();

    // What ingest writes when the marketbrief copy meets the live one.
    const oracle = migratedDb();
    await writeCanonical(oracle, live, OLD + 9700);
    await writeCluster(oracle, [hidden], { id: LIVE, row: live }, OLD + 9800);

    const result = await unmergeItems(env, {
      pairs: [{ canonicalId: C, mergedId: HIDDEN }],
      dryRun: false,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.plan.canonicals[0].pairs[0].outcome).toEqual({
      action: "repoint",
      twinId: LIVE,
      rule: "aggregator-slug",
    });
    expect(published()).toEqual(publishedBefore);
    for (const rowId of [HIDDEN, LIVE]) {
      expect(shape(db, rowId)).toEqual(shape(oracle, rowId));
      expect(sources(db, rowId)).toEqual(sources(oracle, rowId));
    }
    // The canonical gives the copy's source row and tags back.
    expect(sources(db, C).map((s) => (s as { url: string }).url)).not.toContain(
      hidden.item.url
    );
    expect(shape(db, C)).toMatchObject({
      tags: JSON.stringify(["anthropic", "llm", "nvidia", "funding"]),
    });
    oracle.close();
  });

  // #749 and #790 put `distinct: true` on every pair to say "not the same
  // story as its canonical". Restoring such a row next to a live copy of its
  // own story shows that story twice.
  it("a distinct pair still joins a live copy of its story: distinct judges the canonical only", async () => {
    const { hidden, live } = australiaCopies(OLD + 7000);
    await writeCluster(db, [hidden], { id: C, row: canonical }, OLD + 9600);
    await writeCanonical(db, live, OLD + 9700);
    const published = () =>
      db
        .prepare("SELECT id FROM items WHERE status = 'published' ORDER BY id")
        .all();
    const publishedBefore = published();

    const result = await unmergeItems(env, {
      pairs: [{ canonicalId: C, mergedId: HIDDEN, distinct: true }],
      dryRun: false,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.plan.canonicals[0].pairs[0].outcome).toEqual({
      action: "repoint",
      twinId: LIVE,
      rule: "aggregator-slug",
    });
    expect(published()).toEqual(publishedBefore);
    expect(shape(db, HIDDEN)).toMatchObject({
      status: "merged",
      duplicate_of: LIVE,
    });
  });

  it("a distinct pair whose story is likely live under another URL waits for a decision", async () => {
    const { hidden } = australiaCopies(OLD + 7000);
    await writeCluster(db, [hidden], { id: C, row: canonical }, OLD + 9600);
    await writeCanonical(
      db,
      row(LIVE, "the-decoder", {
        url: "https://the-decoder.com/anthropic-australia-ai-agent-breach-laws/",
        title: "Anthropic backs Australian laws on AI agent breach reporting",
        publishedAt: OLD + 7000,
        points: 2,
        sources: [],
      }),
      OLD + 9700
    );
    const before = tables(db);

    const result = await unmergeItems(env, {
      pairs: [{ canonicalId: C, mergedId: HIDDEN, distinct: true }],
      dryRun: false,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.plan.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "skip",
      reason: "needs-decision",
    });
    expect(tables(db)).toEqual(before);
  });

  it("writes nothing when the live copy was taken down after the plan was read", async () => {
    const { hidden, live } = australiaCopies(OLD + 7000);
    await writeCluster(db, [hidden], { id: C, row: canonical }, OLD + 9600);
    await writeCanonical(db, live, OLD + 9700);
    const repoint = parsePairs([{ canonicalId: C, mergedId: HIDDEN }]);
    const plan = planUnmerge(
      repoint,
      await loadUnmergeSnapshot(d1Select(env.DB), repoint),
      NOW.getTime()
    );
    db.prepare("UPDATE items SET status = 'rejected' WHERE id = ?").run(LIVE);
    const before = dump(db);
    expect(await applyUnmerge(env.DB, plan)).toMatchObject({ stale: [C] });
    expect(dump(db)).toEqual(before);
  });

  it("undo reverses a merge into a live copy too", async () => {
    const { hidden, live } = australiaCopies(OLD + 7000);
    await writeCluster(db, [hidden], { id: C, row: canonical }, OLD + 9600);
    await writeCanonical(db, live, OLD + 9700);
    const preApply = tables(db);
    const applied = await unmergeItems(env, {
      pairs: [...pairs, { canonicalId: C, mergedId: HIDDEN }],
      dryRun: false,
    });
    if ("error" in applied) throw new Error(applied.error);
    expect(applied.counts.repointed).toBe(1);
    const undone = await undoUnmerge(env, {
      batchId: applied.applied?.batchId,
      dryRun: false,
    });
    if ("error" in undone) throw new Error(undone.error);
    expect(tables(db)).toEqual(preApply);
  });

  it("undo refuses a canonical whose rows changed since the apply", async () => {
    const applied = await unmergeItems(env, { pairs, dryRun: false });
    if ("error" in applied) throw new Error(applied.error);
    db.prepare("UPDATE items SET points = 42 WHERE id = ?").run(C);
    const changed = tables(db);
    const undo = await undoUnmerge(env, {
      batchId: applied.applied?.batchId,
      dryRun: false,
    });
    if ("error" in undo) throw new Error(undo.error);
    expect(undo.plan.canonicals[0]).toMatchObject({ state: "conflict" });
    expect(tables(db)).toEqual(changed);
  });

  it("posts nothing: restored rows are outside every send window, recent ones wait", async () => {
    // A wrong merge from two hours ago: restoring it now would make an
    // importance-9 story trend.
    const recent = canonicalRow(RECENT_C, NOW_SEC - 3 * 3600, "recent");
    await writeCanonical(db, recent, NOW_SEC - 3 * 3600 + 60);
    const recentLoser = row(RECENT_L, "techcrunch-ai", {
      url: "https://techcrunch.example.test/amazon-ndas",
      title:
        "Amazon responds to data center backlash, says it no longer uses NDAs",
      summary:
        "Amazon says it stopped asking towns to sign NDAs before it builds data centers, after months of local pushback over secrecy and power use.",
      publishedAt: NOW_SEC - 2 * 3600,
      imageUrl: "https://techcrunch.example.test/amazon.jpg",
      sources: [
        {
          kind: "source",
          url: "https://techcrunch.example.test/amazon-ndas",
          postedAt: NOW_SEC - 2 * 3600,
        },
      ],
    });
    await writeCluster(
      db,
      [recentLoser],
      { id: RECENT_C, row: recent },
      NOW_SEC - 2 * 3600 + 60,
      9
    );

    const result = await unmergeItems(env, {
      pairs: [...pairs, { canonicalId: RECENT_C, mergedId: RECENT_L }],
      dryRun: false,
    });
    if ("error" in result) throw new Error(result.error);
    const recentOutcome = result.plan.canonicals[1].pairs[0].outcome;
    expect(recentOutcome).toMatchObject({
      action: "skip",
      reason: "inside-quiet-window",
    });
    expect(shape(db, RECENT_L)).toMatchObject({
      status: "merged",
      duplicate_of: RECENT_C,
    });

    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""));
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: bodies.length } }),
          { headers: { "content-type": "application/json" } }
        );
      })
    );
    await dispatchStoryNotifications({
      ...env,
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_VI_CHAT_ID: "@vi",
      TELEGRAM_EN_CHAT_ID: "@en",
    } as Env);
    for (const text of [LOSER_TITLE, "Amazon responds", HUG_URL, MB_URL]) {
      expect(bodies.join("\n")).not.toContain(text);
    }
    for (const restored of [HUG, MB, RECENT_L]) {
      for (const short of [restored, restored.slice(0, 8)]) {
        expect(bodies.join("\n")).not.toContain(short);
      }
    }
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM notifications WHERE item_id IN (?, ?, ?)"
        )
        .get(HUG, MB, RECENT_L)
    ).toEqual({ n: 0 });
    expect(UNMERGE_QUIET_SEC).toBeGreaterThanOrEqual(8 * 86_400);
  });

  it("keeps the canonical's correct twin when it takes the wrong story out", async () => {
    const croc = row(CROC, "marketbrief", {
      url: `https://marketbrief.now/ai/${crocSlug}`,
      title:
        "Singapore Charges Man for AI Crocodile Image that Halted Reservoir Use",
      publishedAt: OLD,
      points: 4,
      imageUrl: CROC_CARD,
      mediaManifest: {
        version: 1,
        assets: [{ type: "image", url: CROC_CARD }],
      },
      sources: [
        {
          kind: "source",
          url: `https://marketbrief.now/ai/${crocSlug}`,
          postedAt: OLD,
        },
      ],
    });
    const twin = row(CROC_TWIN, "huggingnews", {
      url: `https://huggingnews.com/ai/${crocSlug}`,
      title: croc.item.title,
      publishedAt: OLD,
      points: 1,
      imageUrl: TWIN_CARD,
      mediaManifest: {
        version: 1,
        assets: [{ type: "image", url: TWIN_CARD }],
      },
      sources: [
        {
          kind: "source",
          author: "@straits",
          postedAt: OLD - 300,
          url: "https://x.com/straits/status/9",
        },
      ],
    });
    const wrong = row(WRONG, "techcrunch-ai", {
      url: "https://techcrunch.com/2026/09/29/openai-app-store/",
      title: "OpenAI's latest features take direct aim at the app store model",
      publishedAt: OLD + 3600,
      imageUrl: WRONG_PHOTO,
      mediaManifest: {
        version: 1,
        assets: [{ type: "image", url: WRONG_PHOTO }],
      },
      sources: [
        {
          kind: "source",
          url: "https://techcrunch.com/2026/09/29/openai-app-store/",
          postedAt: OLD + 3600,
        },
      ],
    });
    const build = async (target: DatabaseSync, withWrong: boolean) => {
      await writeCanonical(target, croc, OLD + 600);
      await writeCluster(target, [twin], { id: CROC, row: croc }, OLD + 1200);
      if (withWrong) {
        await writeCluster(
          target,
          [wrong],
          { id: CROC, row: croc },
          OLD + 4200
        );
      }
    };
    await build(db, true);
    const oracle = migratedDb();
    await build(oracle, false);
    expect(shape(db, CROC)).toMatchObject({ image_url: WRONG_PHOTO });

    const result = await unmergeItems(env, {
      pairs: [{ canonicalId: CROC, mergedId: WRONG }],
      dryRun: false,
    });
    if ("error" in result) throw new Error(result.error);

    const without = ({
      image_url,
      media_manifest,
      ...rest
    }: Record<string, unknown>) => rest;
    expect(without(shape(db, CROC) as Record<string, unknown>)).toEqual(
      without(shape(oracle, CROC) as Record<string, unknown>)
    );
    expect(sources(db, CROC)).toEqual(sources(oracle, CROC));
    expect(shape(db, CROC_TWIN)).toEqual(shape(oracle, CROC_TWIN));
    // The wrong merge's photo pruned the canonical's own card for good; the
    // twin's card of the same story stands in, never the foreign photo.
    expect(shape(db, CROC)).toMatchObject({ image_url: TWIN_CARD });
    expect(result.plan.canonicals[0].lossy.join("\n")).toContain(
      "pruned the canonical's own image"
    );
    expect(shape(db, WRONG)).toMatchObject({
      status: "published",
      duplicate_of: null,
      image_url: WRONG_PHOTO,
    });
    oracle.close();
  });

  it("leaves tldr_snapshots and digest rows alone", async () => {
    db.prepare(
      "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at) VALUES (?, ?, ?, ?)"
    ).run(
      "2026-10-04",
      JSON.stringify([{ text: "x", item_ids: [C] }]),
      "[]",
      1
    );
    const read = () => [
      db.prepare("SELECT * FROM tldr_snapshots").all(),
      db.prepare("SELECT * FROM notify_digest_items").all(),
      db.prepare("SELECT * FROM weekly_snapshots").all(),
      db.prepare("SELECT * FROM weekly_digests").all(),
    ];
    const before = read();
    await unmergeItems(env, { pairs, dryRun: false });
    expect(read()).toEqual(before);
  });
});
