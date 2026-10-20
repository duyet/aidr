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
import { CHECK_VERSION } from "../unmerge/check.js";
import {
  d1Select,
  loadCheckPlan,
  loadDanglingSnapshot,
  loadUnmergeSnapshot,
} from "../unmerge/load.js";
import {
  parseDanglingDecisions,
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

    expect(shape(db, C)).toEqual(preMerge.shape);
    expect(sources(db, C)).toEqual(preMerge.sources);

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

  // #795: a batch restored many stories, and only a few of them came back
  // next to a live copy. Undoing the whole batch would hide the rest again.
  describe("undo of one canonical (#795)", () => {
    const C2 = id(0xc4);
    const second = canonicalRow(C2, OLD + 100, "second");
    const ids = [C, HUG, MB, C2, HIDDEN];
    const rowsOf = (rowIds: string[]) =>
      rowIds.map((rowId) => [shape(db, rowId), sources(db, rowId)]);

    /** One apply batch writing two canonicals: C (the anjney pair) and C2
     * (the Australia story, with no live copy yet). */
    async function applyTwoCanonicals() {
      await writeCanonical(db, second, OLD + 700);
      const { hidden } = australiaCopies(OLD + 7000);
      await writeCluster(db, [hidden], { id: C2, row: second }, OLD + 9600);
      const preApply = rowsOf(ids);
      const applied = await unmergeItems(env, {
        pairs: [...pairs, { canonicalId: C2, mergedId: HIDDEN }],
        dryRun: false,
      });
      if ("error" in applied) throw new Error(applied.error);
      expect(applied.applied?.canonicals).toBe(2);
      expect(shape(db, HIDDEN)).toMatchObject({ status: "published" });
      vi.setSystemTime(NOW.getTime() + 60_000);
      return { batchId: applied.applied?.batchId as number, preApply };
    }

    it("reverts only the named canonical and leaves the batch's other restores live", async () => {
      const { batchId, preApply } = await applyTwoCanonicals();
      const afterApply = rowsOf(ids);

      const dry = await undoUnmerge(env, { batchId, canonicalIds: [C2] });
      if ("error" in dry) throw new Error(dry.error);
      expect(dry.plan.canonicals.map((c) => [c.canonicalId, c.state])).toEqual([
        [C2, "undo"],
      ]);
      expect(rowsOf(ids)).toEqual(afterApply);

      const undone = await undoUnmerge(env, {
        batchId,
        canonicalIds: [C2],
        dryRun: false,
      });
      if ("error" in undone) throw new Error(undone.error);
      expect(undone.applied).toMatchObject({ canonicals: 1, stale: [] });
      expect(rowsOf([C2, HIDDEN])).toEqual(preApply.slice(3));
      expect(shape(db, HIDDEN)).toMatchObject({
        status: "merged",
        duplicate_of: C2,
      });
      expect(rowsOf([C, HUG, MB])).toEqual(afterApply.slice(0, 3));
      const undoAudit = db
        .prepare(
          "SELECT detail FROM admin_audit WHERE action = 'unmerge.undo.canonical'"
        )
        .all() as { detail: string }[];
      expect(undoAudit.map((a) => JSON.parse(a.detail))).toEqual([
        expect.objectContaining({ canonicalId: C2, undoes: batchId }),
      ]);

      const again = await undoUnmerge(env, {
        batchId,
        canonicalIds: [C2],
        dryRun: false,
      });
      if ("error" in again) throw new Error(again.error);
      expect(again.plan.canonicals.map((c) => c.state)).toEqual(["noop"]);
      expect(again.applied).toMatchObject({ canonicals: 0 });

      const rest = await undoUnmerge(env, { batchId, dryRun: false });
      if ("error" in rest) throw new Error(rest.error);
      expect(
        Object.fromEntries(
          rest.plan.canonicals.map((c) => [c.canonicalId, c.state])
        )
      ).toEqual({ [C]: "undo", [C2]: "noop" });
      expect(rowsOf(ids)).toEqual(preApply);
    });

    it("refuses a canonical the batch did not write, a short id, or an empty list, and writes nothing", async () => {
      const { batchId } = await applyTwoCanonicals();
      const before = dump(db);
      for (const canonicalIds of [[C2, id(0xee)], [C2.slice(0, 8)], [], C2]) {
        expect(
          await undoUnmerge(env, { batchId, canonicalIds, dryRun: false })
        ).toMatchObject({ status: 400 });
      }
      expect(dump(db)).toEqual(before);
    });

    it("a scoped undo, then sameAs, merges a restored row into a live copy published since", async () => {
      const { batchId } = await applyTwoCanonicals();
      const afterApply = rowsOf([C, HUG, MB]);
      // The story's other copy went live after the restore: shown twice.
      // Written now, so its run re-ranks none of the batch's old rows.
      const { live } = australiaCopies(OLD + 7000);
      await writeCanonical(db, live, NOW_SEC);
      const published = () =>
        (
          db
            .prepare(
              "SELECT id FROM items WHERE status = 'published' AND id IN (?, ?)"
            )
            .all(HIDDEN, LIVE) as { id: string }[]
        ).map((r) => r.id);
      expect(published().sort()).toEqual([HIDDEN, LIVE].sort());

      const undone = await undoUnmerge(env, {
        batchId,
        canonicalIds: [C2],
        dryRun: false,
      });
      if ("error" in undone) throw new Error(undone.error);
      vi.setSystemTime(NOW.getTime() + 120_000);
      const repair = await unmergeItems(env, {
        pairs: [{ canonicalId: C2, mergedId: HIDDEN, sameAs: LIVE }],
        dryRun: false,
      });
      if ("error" in repair) throw new Error(repair.error);
      expect(repair.counts.pairs).toEqual({ repoint: 1 });
      expect(published()).toEqual([LIVE]);
      expect(shape(db, HIDDEN)).toMatchObject({
        status: "merged",
        duplicate_of: LIVE,
      });
      expect(rowsOf([C, HUG, MB])).toEqual(afterApply);
    });
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

// Ingest before 049e36df (#791): the cluster call answered a made-up
// existing id, the merge wrote it as `duplicate_of`, and wrote the
// cluster's source union under it.
const TRIO_HUG = id(0xd1);
const TRIO_MB = id(0xd2);
const TRIO_VERGE = id(0xd3);
const LONE = id(0xd4);
const LOW = id(0xd5);
const UNSCORED = id(0xd6);
const SIM = id(0xd7);
const RECENT_D = id(0xd8);
const SIM_LIVE = id(0xe1);
const RUN1 = OLD + 20_000;
const RUN2 = OLD + 40_000;
const TRIO_SLUG = "trump-replaces-term-ai-with-super-intelligence-4a261299";
const TRIO_TITLE =
  "Trump Replaces Term AI With Super Intelligence in Government Order";

function aggregatorCopy(
  rowId: string,
  sourceId: "huggingnews" | "marketbrief",
  slugPart: string,
  title: string,
  publishedAt: number
): NewRow {
  const host =
    sourceId === "huggingnews" ? "huggingnews.com" : "marketbrief.now";
  const url = `https://${host}/us-politics/${slugPart}`;
  const card = `https://${host}/og/${slugPart}.png?v=1`;
  return row(rowId, sourceId, {
    url,
    title,
    publishedAt,
    points: sourceId === "huggingnews" ? 1 : 3,
    imageUrl: card,
    mediaManifest: { version: 1, assets: [{ type: "image", url: card }] },
    sources:
      sourceId === "huggingnews"
        ? [
            {
              kind: "source",
              author: "@whitehouse",
              postedAt: publishedAt - 600,
              url: `https://x.com/WhiteHouse/status/${slugPart.length}`,
            },
          ]
        : [{ kind: "source", url, postedAt: publishedAt }],
  });
}

function story(
  rowId: string,
  sourceId: string,
  title: string,
  publishedAt: number,
  path: string
): NewRow {
  return row(rowId, sourceId, {
    url: `https://example.test/${path}`,
    title,
    publishedAt,
    points: 12,
    comments: 3,
    sources:
      sourceId === "hn"
        ? [
            {
              kind: "discussion",
              author: "pg",
              postedAt: publishedAt,
              url: `https://news.ycombinator.com/item?id=${path}`,
            },
          ]
        : [],
  });
}

const trio = (): NewRow[] => [
  aggregatorCopy(TRIO_HUG, "huggingnews", TRIO_SLUG, TRIO_TITLE, RUN1 - 900),
  aggregatorCopy(TRIO_MB, "marketbrief", TRIO_SLUG, TRIO_TITLE, RUN1 - 900),
  story(
    TRIO_VERGE,
    "theverge-ai",
    "Trump orders US government to call AI ‘Super Intelligence’",
    RUN1 - 600,
    "trump-ai-superintelligence-executive-order"
  ),
];
const lone = () =>
  story(
    LONE,
    "hn",
    "Show HN: A tiny SQLite page inspector",
    RUN1 - 800,
    "49722276"
  );
const low = () =>
  story(
    LOW,
    "marketbrief",
    "Spreadsheet Startup Raises Seed Round for Formula Assistant",
    RUN2 - 900,
    "seed-round"
  );
const unscored = () =>
  story(
    UNSCORED,
    "aws-ml",
    "Build a document pipeline with Amazon Bedrock Data Automation",
    RUN2 - 700,
    "bedrock-pipeline"
  );

/** Ingest's write of one cluster: into `madeUpId` as the old cluster call
 * answered it, or with no existing id (what ingest writes without it).
 * Relevance is 0.9 unless `relevance` says otherwise; null leaves the row
 * unscored. */
async function writeRun(
  target: DatabaseSync,
  newRows: NewRow[],
  madeUpId: string | null,
  nowSec: number,
  relevance: ReadonlyMap<string, number | null> = new Map(),
  importance = 5
) {
  const scored = new Map<string, ItemScore>();
  for (const r of newRows) {
    const value = relevance.has(r.id) ? relevance.get(r.id) : 0.9;
    if (typeof value === "number") {
      scored.set(r.id, { ...score(importance), relevance: value });
    }
  }
  const candidates = buildMergeCandidates(newRows, scored, TAGS, nowSec * 1000);
  const mergePlan =
    newRows.length > 1 || madeUpId
      ? buildMergePlan(
          [
            {
              new: candidates.map((c) => c.i),
              existing: madeUpId ? [madeUpId] : [],
            },
          ],
          candidates,
          new Map(),
          MAX_SOURCES_PER_ITEM,
          MAX_MERGED_TOPICS
        )
      : EMPTY_MERGE_PLAN;
  await writeItems(ingest(target), {
    newRows,
    scored,
    translated: new Map(),
    mergePlan,
    canonicalTagsByItem: TAGS,
    now: nowSec * 1000,
  });
}

const LOW_RELEVANCE = new Map([
  [LOW, 0.3],
  [UNSCORED, null],
]);

/** The September shape: one cluster call lumped the trio and an unrelated
 * story under `abc123`, a later run reused `abc123` for two more stories,
 * and another gave `22` to a copy whose twin then published on its own. */
async function writeDangling(target: DatabaseSync) {
  await writeRun(target, [...trio(), lone()], "abc123", RUN1);
  await writeRun(target, [low(), unscored()], "abc123", RUN2, LOW_RELEVANCE);
  const { hidden, live } = australiaCopies(OLD + 60_000);
  await writeRun(target, [hidden], "22", OLD + 61_000);
  await writeCanonical(target, live, OLD + 61_500);
  // A live story with a near-duplicate headline under another URL.
  await writeCanonical(
    target,
    story(
      SIM_LIVE,
      "hn",
      "OpenAI Halves API Prices With Launch of GPT-6 Sol and Luna",
      OLD + 70_000,
      "gpt6-prices"
    ),
    OLD + 70_100
  );
  await writeRun(
    target,
    [
      aggregatorCopy(
        SIM,
        "huggingnews",
        "openai-cuts-api-prices-50-in-new-gpt-6-model-launch-0be1c2d3",
        "OpenAI Cuts API Prices 50% in New GPT-6 Model Launch",
        OLD + 71_000
      ),
    ],
    "ghi789",
    OLD + 72_000
  );
  // Merged two hours ago, importance 9: restored now, it would trend.
  await writeRun(
    target,
    [
      row(RECENT_D, "techcrunch-ai", {
        url: "https://techcrunch.example.test/amazon-ndas",
        title:
          "Amazon responds to data center backlash, says it no longer uses NDAs",
        summary:
          "Amazon says it stopped asking towns to sign NDAs before it builds data centers, after months of local pushback over secrecy and power use.",
        publishedAt: NOW_SEC - 2 * 3600,
        imageUrl: "https://techcrunch.example.test/amazon.jpg",
        sources: [],
      }),
    ],
    "abc123",
    NOW_SEC - 3600,
    new Map(),
    9
  );
}

/** What ingest writes for the same rows when no made-up id exists. */
async function writeOracle(target: DatabaseSync) {
  await writeRun(target, trio(), null, RUN1);
  await writeRun(target, [lone()], null, RUN1);
  await writeRun(target, [low()], null, RUN2, LOW_RELEVANCE);
  await writeRun(target, [unscored()], null, RUN2, LOW_RELEVANCE);
}

const statusOf = (target: DatabaseSync, rowId: string) =>
  shape(target, rowId) as { status: string; duplicate_of: string | null };

/** Stores a clear model verdict (#797) for every story the dangling plan
 * holds only for one, as a check whose model links nothing would, until no
 * story waits. These tests are about the deterministic rules; the check
 * itself is tested in unmerge-check.integration.test.ts. */
async function clearChecks(decisions: unknown): Promise<void> {
  const parsed = parseDanglingDecisions(decisions);
  if ("error" in parsed) return;
  const select = d1Select(env.DB);
  for (let round = 0; round < 5; round++) {
    const snapshot = await loadDanglingSnapshot(select, parsed.decisions);
    const { work } = await loadCheckPlan(
      select,
      snapshot,
      parsed.decisions,
      Date.now()
    );
    if (work.length === 0) return;
    for (const { candidate } of work) {
      db.prepare(
        `INSERT INTO unmerge_checks (story, version, verdict, matches, dropped,
           sent, model, operation_id, checked_at)
         VALUES (?, ?, 'clear', '[]', '[]', '[]', NULL, 'test', ?)`
      ).run(candidate.story, CHECK_VERSION, Date.now());
    }
  }
  throw new Error("checks did not settle");
}

async function checkedDangling(
  target: Env,
  body: Parameters<typeof unmergeItems>[1]
) {
  await clearChecks(body.decisions);
  return unmergeItems(target, body);
}

describe("unmerge of dangling merges (#791)", () => {
  beforeEach(async () => {
    await writeDangling(db);
  });

  it("the fixture has the production shape: rows merged into ids no item has, sources under those ids", () => {
    for (const rowId of [TRIO_HUG, TRIO_MB, TRIO_VERGE, LONE, LOW, UNSCORED]) {
      expect(shape(db, rowId)).toMatchObject({
        status: "merged",
        duplicate_of: "abc123",
      });
    }
    expect(statusOf(db, HIDDEN).duplicate_of).toBe("22");
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM items WHERE id IN ('abc123', '22', 'ghi789')"
        )
        .get()
    ).toEqual({ n: 0 });
    expect(sources(db, "abc123").length).toBeGreaterThan(0);
  });

  it("a dry run writes nothing and plans each story once", async () => {
    const before = dump(db);
    const result = await checkedDangling(env, { dangling: true });
    if ("error" in result) throw new Error(result.error);
    expect(result.dryRun).toBe(true);
    expect(dump(db)).toEqual(before);
    const outcomes = Object.fromEntries(
      result.plan.canonicals.flatMap((c) =>
        c.pairs.map(({ pair, outcome }) => [
          pair.mergedId,
          outcome.action === "skip" ? outcome.reason : outcome.action,
        ])
      )
    );
    // The trio is one story: a slug pair and a near-duplicate headline the
    // same cluster call put with them. The rest are stories of their own.
    expect(outcomes).toEqual({
      [TRIO_HUG]: expect.stringMatching(/^(restore|regroup)$/),
      [TRIO_MB]: expect.stringMatching(/^(restore|regroup)$/),
      [TRIO_VERGE]: expect.stringMatching(/^(restore|regroup)$/),
      [LONE]: "restore",
      [LOW]: "restore",
      [UNSCORED]: "restore",
      [HIDDEN]: "repoint",
      [SIM]: "needs-decision",
      [RECENT_D]: "inside-quiet-window",
    });
    expect(result.counts).toMatchObject({
      pairs: expect.objectContaining({ restore: 4, regroup: 2 }),
      restoredPublished: 3,
      restoredRejected: 1,
      repointed: 1,
      needsDecision: 1,
      canonicalsChanged: 0,
    });
  });

  it("restores each story as ingest writes it with no made-up id", async () => {
    const result = await checkedDangling(env, {
      dangling: true,
      dryRun: false,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.applied).toMatchObject({ stale: [], remaining: 0 });

    const oracle = migratedDb();
    await writeOracle(oracle);
    for (const rowId of [TRIO_HUG, TRIO_MB, TRIO_VERGE, LONE, LOW, UNSCORED]) {
      expect(shape(db, rowId)).toEqual(shape(oracle, rowId));
    }
    for (const rowId of [TRIO_HUG, TRIO_MB, TRIO_VERGE, LONE]) {
      expect(sources(db, rowId)).toEqual(sources(oracle, rowId));
    }
    expect(statusOf(db, LOW).status).toBe("rejected");
    expect(statusOf(db, UNSCORED).status).toBe("published");
    oracle.close();

    // A merge into a real canonical is not this mode's to touch.
    expect(shape(db, HUG)).toMatchObject({ status: "merged", duplicate_of: C });
  });

  it("never publishes a story that is already live under another id", async () => {
    const published = () =>
      db
        .prepare("SELECT id FROM items WHERE status = 'published' ORDER BY id")
        .all()
        .map((r) => (r as { id: string }).id);
    const before = published();
    const result = await checkedDangling(env, {
      dangling: true,
      dryRun: false,
    });
    if ("error" in result) throw new Error(result.error);

    // The copy whose twin is live joins it, as ingest would have merged it.
    expect(statusOf(db, HIDDEN)).toMatchObject({
      status: "merged",
      duplicate_of: LIVE,
    });
    // A near-duplicate of a live story waits for a human; nothing is written.
    expect(statusOf(db, SIM)).toMatchObject({
      status: "merged",
      duplicate_of: "ghi789",
    });
    const lead = [TRIO_HUG, TRIO_MB, TRIO_VERGE].find(
      (rowId) => statusOf(db, rowId).status === "published"
    );
    expect(published().filter((rowId) => !before.includes(rowId))).toEqual(
      [lead, LONE, UNSCORED].sort()
    );
  });

  it("posts nothing and leaves the recent merge for later", async () => {
    await checkedDangling(env, { dangling: true, dryRun: false });
    expect(statusOf(db, RECENT_D)).toMatchObject({
      status: "merged",
      duplicate_of: "abc123",
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
    const sent = bodies.join("\n");
    for (const text of [
      TRIO_TITLE,
      "Super Intelligence",
      "SQLite page",
      "Amazon responds",
    ]) {
      expect(sent).not.toContain(text);
    }
    for (const restored of [
      TRIO_HUG,
      TRIO_MB,
      TRIO_VERGE,
      LONE,
      UNSCORED,
      RECENT_D,
    ]) {
      expect(sent).not.toContain(restored);
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM notifications").get()).toEqual(
      { n: 0 }
    );
  });

  it("a rerun writes nothing and plans only the held rows", async () => {
    await checkedDangling(env, { dangling: true, dryRun: false });
    const after = dump(db);
    const again = await checkedDangling(env, { dangling: true, dryRun: false });
    if ("error" in again) throw new Error(again.error);
    expect(again.counts.pairs).toEqual({
      "skip:needs-decision": 1,
      "skip:inside-quiet-window": 1,
    });
    expect(again.applied).toMatchObject({ canonicals: 0, statements: 0 });
    expect(dump(db)).toEqual(after);
  });

  it("undo puts every row back, and a second undo is a no-op", async () => {
    const preApply = tables(db);
    const applied = await checkedDangling(env, {
      dangling: true,
      dryRun: false,
    });
    if ("error" in applied) throw new Error(applied.error);
    expect(tables(db)).not.toEqual(preApply);
    const batchId = applied.applied?.batchId;
    const undone = await undoUnmerge(env, { batchId, dryRun: false });
    if ("error" in undone) throw new Error(undone.error);
    expect(undone.plan.canonicals.map((c) => c.state)).not.toContain(
      "conflict"
    );
    expect(tables(db)).toEqual(preApply);
    const again = await undoUnmerge(env, { batchId, dryRun: false });
    if ("error" in again) throw new Error(again.error);
    expect(new Set(again.plan.canonicals.map((c) => c.state))).toEqual(
      new Set(["noop"])
    );
    expect(tables(db)).toEqual(preApply);
  });

  it("refuses dangling together with pairs", async () => {
    expect(await checkedDangling(env, { dangling: true, pairs })).toMatchObject(
      {
        status: 400,
      }
    );
  });

  it("settles a held story by a decision on any of its rows (#793)", async () => {
    const outcomeOf = async (decisions: unknown[]) => {
      const result = await checkedDangling(env, { dangling: true, decisions });
      if ("error" in result) throw new Error(result.error);
      return result.plan.canonicals
        .flatMap((c) => c.pairs)
        .find(({ pair }) => pair.mergedId === SIM)?.outcome;
    };
    expect(
      await outcomeOf([{ mergedId: SIM, distinctFrom: [SIM_LIVE] }])
    ).toMatchObject({ action: "restore", status: "published" });
    expect(await outcomeOf([{ mergedId: SIM, sameAs: SIM_LIVE }])).toEqual({
      action: "repoint",
      twinId: SIM_LIVE,
      rule: "same-as",
    });

    const before = dump(db);
    const applied = await checkedDangling(env, {
      dangling: true,
      decisions: [{ mergedId: SIM, distinctFrom: [SIM_LIVE] }],
      dryRun: false,
    });
    if ("error" in applied) throw new Error(applied.error);
    expect(dump(db)).not.toEqual(before);
    expect(statusOf(db, SIM)).toMatchObject({
      status: "published",
      duplicate_of: null,
    });
    // The rerun of a capped apply posts the same decisions; a spent one is
    // not an error.
    expect(
      await checkedDangling(env, {
        dangling: true,
        decisions: [{ mergedId: SIM, distinctFrom: [SIM_LIVE] }],
      })
    ).not.toHaveProperty("error");
  });

  it("still joins a live copy with the story's identity, whatever distinctFrom names", async () => {
    const result = await checkedDangling(env, {
      dangling: true,
      decisions: [{ mergedId: HIDDEN, distinctFrom: [LIVE] }],
    });
    if ("error" in result) throw new Error(result.error);
    expect(
      result.plan.canonicals
        .flatMap((c) => c.pairs)
        .find(({ pair }) => pair.mergedId === HIDDEN)?.outcome
    ).toMatchObject({ action: "repoint", twinId: LIVE });
  });

  it("holds a story whose rows carry two different decisions", async () => {
    const result = await checkedDangling(env, {
      dangling: true,
      decisions: [
        { mergedId: TRIO_HUG, sameAs: SIM_LIVE },
        { mergedId: TRIO_MB, distinctFrom: [SIM_LIVE] },
      ],
    });
    if ("error" in result) throw new Error(result.error);
    const trio = result.plan.canonicals
      .flatMap((c) => c.pairs)
      .filter(({ pair }) =>
        [TRIO_HUG, TRIO_MB, TRIO_VERGE].includes(pair.mergedId)
      );
    expect(trio.map(({ outcome }) => outcome)).toEqual(
      Array(3).fill(
        expect.objectContaining({ action: "skip", reason: "needs-decision" })
      )
    );
  });

  it("refuses a decision it cannot apply, and writes nothing", async () => {
    const before = dump(db);
    for (const decisions of [
      // No canonical to be distinct from: it would judge nothing.
      [{ mergedId: SIM, distinct: true }],
      [{ mergedId: SIM }],
      [{ mergedId: id(0xdead), sameAs: SIM_LIVE }],
      [
        { mergedId: SIM, sameAs: SIM_LIVE },
        { mergedId: SIM, distinctFrom: [SIM_LIVE] },
      ],
      { mergedId: SIM, sameAs: SIM_LIVE },
    ]) {
      expect(
        await checkedDangling(env, { dangling: true, decisions, dryRun: false })
      ).toMatchObject({ status: 400 });
    }
    expect(
      await unmergeItems(env, {
        pairs,
        decisions: [{ mergedId: SIM, sameAs: SIM_LIVE }],
      })
    ).toMatchObject({ status: 400 });
    expect(dump(db)).toEqual(before);
  });
});

// The live copies the #794 dry run missed: a merged copy of a live story, a
// URL with a trailing slash, a Vietnamese live row, and one story under two
// made-up ids.
const ROOT = id(0xf1);
const ROOT_COPY = id(0xf2);
const COPY_D = id(0xf3);
const SLASH_LIVE = id(0xf4);
const SLASH_D = id(0xf5);
const VI_LIVE = id(0xf6);
const VI_D = id(0xf7);
const FOLD_A = id(0xf8);
const FOLD_B = id(0xf9);
const NEAR_D = id(0xfa);
const STRAY_ROOT = id(0xfb);
const STRAY_COPY = id(0xfc);
const STRAY_D = id(0xfd);
const LATE_LIVE = id(0xfe);
const LATE_D = id(0xff);
const REWORD_LIVE = id(0xe2);
const REWORD_D = id(0xe3);
const T = OLD - 10 * 86_400;
const HOUR = 3600;
const MUSE_SLUG =
  "meta-enables-muse-ai-checkout-for-paypal-and-shopify-7814a26b";
const MUSE_TITLE =
  "Meta Enables Muse AI Checkout for All PayPal and Shopify Merchants";

function translateToEnglish(
  target: DatabaseSync,
  rowId: string,
  title: string
) {
  target
    .prepare(
      "INSERT INTO translations (item_id, lang, title, summary) VALUES (?, 'en', ?, ?)"
    )
    .run(rowId, title, "Summary in English.");
}

async function writeMissedCopies(target: DatabaseSync) {
  // The copy joined its root 80 hours later; the dangling rows sit near the
  // copy, and NEAR_D is 100 hours from the root.
  const root = story(
    ROOT,
    "theverge-ai",
    "Meta’s Muse AI checkout comes to PayPal merchants",
    T,
    "verge-muse-checkout"
  );
  await writeCanonical(target, root, T + 100);
  await writeCluster(
    target,
    [
      aggregatorCopy(
        ROOT_COPY,
        "marketbrief",
        MUSE_SLUG,
        MUSE_TITLE,
        T + 80 * HOUR
      ),
    ],
    { id: ROOT, row: root },
    T + 80 * HOUR + 100
  );
  await writeRun(
    target,
    [
      aggregatorCopy(
        COPY_D,
        "huggingnews",
        MUSE_SLUG,
        MUSE_TITLE,
        T + 81 * HOUR
      ),
    ],
    "abc123",
    T + 81 * HOUR + 100
  );
  await writeRun(
    target,
    [
      aggregatorCopy(
        NEAR_D,
        "huggingnews",
        "meta-muse-ai-checkout-reaches-paypal-and-shopify-merchants-9a8b7c6d",
        "Meta Muse AI Checkout Reaches PayPal and Shopify Merchants",
        T + 100 * HOUR
      ),
    ],
    "pqr678",
    T + 100 * HOUR + 100
  );

  // An aggregator copy the cluster call put into an unrelated story.
  const agentCore = story(
    STRAY_ROOT,
    "aws-ml",
    "The new AgentCore runtime: Elastic, optimized, and consistent",
    T + 1500,
    "agentcore-runtime"
  );
  await writeCanonical(target, agentCore, T + 1600);
  const plugin = "plugin4shell-zero-click-rce-hits-4-ai-agents-3e1f2a7b";
  const pluginTitle =
    "Plugin4Shell Zero Click RCE Hits 4 AI Agents in First AI Supply Chain Flaw";
  await writeCluster(
    target,
    [aggregatorCopy(STRAY_COPY, "marketbrief", plugin, pluginTitle, T + 1700)],
    { id: STRAY_ROOT, row: agentCore },
    T + 1800
  );
  await writeRun(
    target,
    [aggregatorCopy(STRAY_D, "huggingnews", plugin, pluginTitle, T + 1750)],
    "stu901",
    T + 1900
  );

  // One launch, reported 77 hours apart: past the 72-hour merge lookback.
  await writeCanonical(
    target,
    aggregatorCopy(
      LATE_LIVE,
      "marketbrief",
      "glm-53-flashx-hits-200-tokens-per-second-at-25x-price-5f8a8265",
      "GLM 5.3 FlashX Hits 200 Tokens Per Second at 2.5X Price",
      T + 5000
    ),
    T + 5100
  );
  await writeRun(
    target,
    [
      aggregatorCopy(
        LATE_D,
        "huggingnews",
        "zhipu-launches-glm-53-flashx-at-200-tokens-per-second-f809ee92",
        "Zhipu Launches GLM 5.3 FlashX at 200 Tokens Per Second on 100 000 Chinese Chips",
        T + 5000 + 77 * HOUR
      ),
    ],
    "vwx234",
    T + 5000 + 77 * HOUR + 100
  );

  await writeCanonical(
    target,
    story(
      REWORD_LIVE,
      "the-decoder",
      "Google Deepmind's Dream-RSI helps AI agents improve by “dreaming” about past attempts",
      T + 6000,
      "deepmind-dream-rsi"
    ),
    T + 6100
  );
  await writeRun(
    target,
    [
      aggregatorCopy(
        REWORD_D,
        "marketbrief",
        "google-deepmind-dream-rsi-boosts-ai-performance-209x-6415fdd4",
        "Google DeepMind Dream-RSI Boosts AI Performance 2.09x Without Changing Model Weights",
        T + 6000 + 70 * HOUR
      ),
    ],
    "yz123",
    T + 6000 + 70 * HOUR + 100
  );

  const page = "https://openai.example.test/index/mentalhealthbench";
  await writeCanonical(
    target,
    row(SLASH_LIVE, "hn", {
      url: page,
      title: "MentalHealthBench: how models handle mental health conversations",
      publishedAt: T + 1000,
      points: 40,
      sources: [],
    }),
    T + 1100
  );
  await writeRun(
    target,
    [
      row(SLASH_D, "openai", {
        url: `${page}/`,
        title: "Introducing MentalHealthBench",
        publishedAt: T + 900,
        sources: [],
      }),
    ],
    "def456",
    T + 1200
  );

  const vnexpress = "https://vnexpress.net/openai-giam-gia-api-5130001.html";
  await writeCanonical(
    target,
    row(VI_LIVE, "vnexpress-tech", {
      url: vnexpress,
      title: "OpenAI giảm một nửa giá API khi ra mắt GPT-6",
      publishedAt: T + 2000,
      sourceLang: "vi",
      sources: [{ kind: "source", url: vnexpress, postedAt: T + 2000 }],
    }),
    T + 2100
  );
  translateToEnglish(
    target,
    VI_LIVE,
    "OpenAI Halves API Prices With Launch of GPT-6 Sol and Luna"
  );
  await writeRun(
    target,
    [
      aggregatorCopy(
        VI_D,
        "huggingnews",
        "openai-cuts-api-prices-50-in-new-gpt-6-model-launch-5e6f7a8b",
        "OpenAI Cuts API Prices 50% in New GPT-6 Model Launch",
        T + 2200
      ),
    ],
    "ghi789",
    T + 2300
  );

  const spec = "https://openai.example.test/index/agents-md-v2";
  await writeRun(
    target,
    [
      row(FOLD_A, "openai", {
        url: `${spec}/`,
        title: "Introducing AGENTS.md v2",
        publishedAt: T + 3000,
        sources: [],
      }),
    ],
    "jkl012",
    T + 3100
  );
  await writeRun(
    target,
    [
      row(FOLD_B, "hn", {
        url: spec,
        title: "A spec file for coding assistants",
        publishedAt: T + 3500,
        points: 25,
        sources: [],
      }),
    ],
    "mno345",
    T + 3600
  );
}

describe("unmerge of dangling merges: live copies under another form (#794)", () => {
  beforeEach(async () => {
    await writeMissedCopies(db);
  });

  const outcomesOf = (result: Awaited<ReturnType<typeof unmergeItems>>) => {
    if ("error" in result) throw new Error(result.error);
    return new Map(
      result.plan.canonicals.flatMap((c) =>
        c.pairs.map(({ pair, outcome }) => [pair.mergedId as string, outcome])
      )
    );
  };

  it("joins a story whose only live copy is merged into a published row, at that row", async () => {
    const outcome = outcomesOf(
      await checkedDangling(env, { dangling: true })
    ).get(COPY_D);
    expect(outcome).toEqual({
      action: "repoint",
      twinId: ROOT,
      rule: "aggregator-slug",
    });
    await checkedDangling(env, { dangling: true, dryRun: false });
    expect(statusOf(db, COPY_D)).toMatchObject({
      status: "merged",
      duplicate_of: ROOT,
    });
  });

  it("names the published row, not its merged copy, for a near-duplicate of the copy", async () => {
    const outcome = outcomesOf(
      await checkedDangling(env, { dangling: true })
    ).get(NEAR_D);
    expect(outcome).toMatchObject({ action: "skip", reason: "needs-decision" });
    expect(
      outcome?.action === "skip" && outcome.candidates?.map((c) => c.id)
    ).toEqual([ROOT]);
  });

  it("holds a story whose live copy is merged into an unrelated row, instead of hiding it there", async () => {
    const outcome = outcomesOf(
      await checkedDangling(env, { dangling: true })
    ).get(STRAY_D);
    expect(outcome).toMatchObject({ action: "skip", reason: "needs-decision" });
    expect(
      outcome?.action === "skip" && outcome.candidates?.map((c) => c.id)
    ).toEqual([STRAY_ROOT]);
  });

  it("holds a near-duplicate of a live story published a day past the merge lookback", async () => {
    expect(
      outcomesOf(await checkedDangling(env, { dangling: true })).get(LATE_D)
    ).toMatchObject({
      action: "skip",
      reason: "needs-decision",
      candidates: [expect.objectContaining({ id: LATE_LIVE })],
    });
  });

  it("holds a reworded headline that shares four evidence words with a live story", async () => {
    expect(
      outcomesOf(await checkedDangling(env, { dangling: true })).get(REWORD_D)
    ).toMatchObject({
      action: "skip",
      reason: "needs-decision",
      candidates: [expect.objectContaining({ id: REWORD_LIVE })],
    });
  });

  it("treats a URL with a trailing slash as the same page", async () => {
    expect(
      outcomesOf(await checkedDangling(env, { dangling: true })).get(SLASH_D)
    ).toEqual({ action: "repoint", twinId: SLASH_LIVE, rule: "url" });
  });

  it("holds an English story whose live copy is Vietnamese, matched through the stored English title", async () => {
    expect(
      outcomesOf(await checkedDangling(env, { dangling: true })).get(VI_D)
    ).toMatchObject({
      action: "skip",
      reason: "needs-decision",
      candidates: [expect.objectContaining({ id: VI_LIVE })],
    });
  });

  it("restores one story under two made-up ids once, with the other row merged into it", async () => {
    const outcomes = outcomesOf(await checkedDangling(env, { dangling: true }));
    expect(
      [FOLD_A, FOLD_B].map((rowId) => outcomes.get(rowId)?.action).sort()
    ).toEqual(["regroup", "restore"]);
    await checkedDangling(env, { dangling: true, dryRun: false });
    const published = [FOLD_A, FOLD_B].filter(
      (rowId) => statusOf(db, rowId).status === "published"
    );
    expect(published).toHaveLength(1);
    const other = published[0] === FOLD_A ? FOLD_B : FOLD_A;
    expect(statusOf(db, other)).toMatchObject({
      status: "merged",
      duplicate_of: published[0],
    });
  });
});

// #798: production 82cceca7 and 095c4690 are two dangling copies of
// DeepSeek's DSec launch, and e21b1a15 is its live row. Only the first
// copy's headline is close to the second's, so the second was held against
// the first. Once a sameAs re-pointed the first to e21b1a15, nothing held
// the second, and it published as a second copy of the story.
const DSEC_LIVE = id(0xe4);
const DSEC_A = id(0xe5);
const DSEC_B = id(0xe6);
const DSEC_DOCS = `https://api-docs.example.test/news/dsec`;
const DSEC_T = OLD - 12 * 86_400;

const dsecLive = () =>
  row(DSEC_LIVE, "lobsters", {
    url: DSEC_DOCS,
    title: "DeepSeek Elastic Compute (DSec): Sandbox Infrastructure for Agents",
    publishedAt: DSEC_T,
    points: 30,
    sources: [],
  });
const dsecA = () =>
  aggregatorCopy(
    DSEC_A,
    "huggingnews",
    "deepseeks-dsec-unit-supports-380000-concurrent-sandboxes-for-ai-1d1131cc",
    "DeepSeek’s DSec Unit Supports 380,000 Concurrent Sandboxes for AI",
    DSEC_T + 2 * HOUR
  );
const dsecB = () =>
  aggregatorCopy(
    DSEC_B,
    "marketbrief",
    "deepseek-launches-dsec-platform-for-380000-concurrent-agent-sandboxes-5c0ffee1",
    "DeepSeek Launches DSec Platform for 380,000 Concurrent Agent Sandboxes",
    DSEC_T + 3 * HOUR
  );

/** Writes the live row, then each copy under its own made-up id. With
 * `heldFirst`, B is written first, so it is planned first. */
async function writeDsec(target: DatabaseSync, a: NewRow, heldFirst: boolean) {
  await writeCanonical(target, dsecLive(), DSEC_T + 100);
  const runs: Array<[NewRow, string]> = [
    [a, "abc124"],
    [dsecB(), "abc125"],
  ];
  if (heldFirst) runs.reverse();
  for (const [i, [newRow, madeUpId]] of runs.entries()) {
    await writeRun(target, [newRow], madeUpId, DSEC_T + 4 * HOUR + i * 600);
  }
}

describe("unmerge: rows the request re-points still count as live (#798)", () => {
  const outcomesOf = (result: Awaited<ReturnType<typeof unmergeItems>>) => {
    if ("error" in result) throw new Error(result.error);
    return new Map(
      result.plan.canonicals.flatMap((c) =>
        c.pairs.map(({ pair, outcome }) => [pair.mergedId as string, outcome])
      )
    );
  };
  const candidateIds = (outcome: unknown) =>
    (outcome as { candidates?: { id: string }[] }).candidates?.map((c) => c.id);
  const orders = [
    ["the re-pointed story planned first", false],
    ["the held story planned first", true],
  ] as const;

  it("holds the second copy against the first while neither is decided", async () => {
    await writeDsec(db, dsecA(), false);
    const outcomes = outcomesOf(await checkedDangling(env, { dangling: true }));
    expect(outcomes.get(DSEC_A)).toMatchObject({
      action: "restore",
      status: "published",
    });
    expect(outcomes.get(DSEC_B)).toMatchObject({
      action: "skip",
      reason: "needs-decision",
    });
    expect(candidateIds(outcomes.get(DSEC_B))).toEqual([DSEC_A]);
  });

  it.each(orders)(
    "holds a near-duplicate of a story a sameAs re-points, against the row it joins (%s)",
    async (_, heldFirst) => {
      await writeDsec(db, dsecA(), heldFirst);
      const before = tables(db);
      const decisions = [{ mergedId: DSEC_A, sameAs: DSEC_LIVE }];
      const outcomes = outcomesOf(
        await checkedDangling(env, { dangling: true, decisions })
      );
      expect(outcomes.get(DSEC_A)).toEqual({
        action: "repoint",
        twinId: DSEC_LIVE,
        rule: "same-as",
      });
      expect(outcomes.get(DSEC_B)).toMatchObject({
        action: "skip",
        reason: "needs-decision",
      });
      expect(candidateIds(outcomes.get(DSEC_B))).toEqual([DSEC_LIVE]);

      await checkedDangling(env, { dangling: true, decisions, dryRun: false });
      expect(tables(db)).not.toEqual(before);
      expect(statusOf(db, DSEC_B)).toMatchObject({
        status: "merged",
        duplicate_of: "abc125",
      });
    }
  );

  it("holds it too when the row the sameAs names is days away, outside the live window", async () => {
    await writeCanonical(
      db,
      {
        ...dsecLive(),
        item: { ...dsecLive().item, publishedAt: DSEC_T - 6 * 86_400 },
      },
      DSEC_T - 6 * 86_400 + 100
    );
    await writeRun(db, [dsecA()], "abc124", DSEC_T + 4 * HOUR);
    await writeRun(db, [dsecB()], "abc125", DSEC_T + 4 * HOUR + 600);
    const outcomes = outcomesOf(
      await checkedDangling(env, {
        dangling: true,
        decisions: [{ mergedId: DSEC_A, sameAs: DSEC_LIVE }],
      })
    );
    expect(outcomes.get(DSEC_A)).toMatchObject({ action: "repoint" });
    expect(candidateIds(outcomes.get(DSEC_B))).toEqual([DSEC_LIVE]);
  });

  it("publishes that copy once a distinctFrom names the row it was held against", async () => {
    await writeDsec(db, dsecA(), false);
    const outcomes = outcomesOf(
      await checkedDangling(env, {
        dangling: true,
        decisions: [
          { mergedId: DSEC_A, sameAs: DSEC_LIVE },
          { mergedId: DSEC_B, distinctFrom: [DSEC_LIVE] },
        ],
      })
    );
    expect(outcomes.get(DSEC_B)).toMatchObject({
      action: "restore",
      status: "published",
    });
  });

  it.each(orders)(
    "holds a near-duplicate of a story that joins its live row by URL (%s)",
    async (_, heldFirst) => {
      const sameDoc = row(DSEC_A, "openai", {
        url: `${DSEC_DOCS}/`,
        title:
          "DeepSeek’s DSec Unit Supports 380,000 Concurrent Sandboxes for AI",
        publishedAt: DSEC_T + 2 * HOUR,
        sources: [],
      });
      await writeDsec(db, sameDoc, heldFirst);
      const outcomes = outcomesOf(
        await checkedDangling(env, { dangling: true })
      );
      expect(outcomes.get(DSEC_A)).toEqual({
        action: "repoint",
        twinId: DSEC_LIVE,
        rule: "url",
      });
      expect(outcomes.get(DSEC_B)).toMatchObject({
        action: "skip",
        reason: "needs-decision",
      });
      expect(candidateIds(outcomes.get(DSEC_B))).toEqual([DSEC_LIVE]);
    }
  );

  it.each(orders)(
    "holds the same way for a pairs file (%s)",
    async (_, heldFirst) => {
      const t = OLD + 5000;
      await writeCanonical(
        db,
        { ...dsecLive(), item: { ...dsecLive().item, publishedAt: t } },
        t + 100
      );
      const at = (newRow: NewRow, publishedAt: number): NewRow => ({
        ...newRow,
        item: { ...newRow.item, publishedAt },
      });
      await writeCluster(
        db,
        [at(dsecA(), t + 2 * HOUR), at(dsecB(), t + 3 * HOUR)],
        { id: C, row: canonical },
        OLD + 9600
      );
      const list = [
        { canonicalId: C, mergedId: DSEC_A, group: "a", sameAs: DSEC_LIVE },
        { canonicalId: C, mergedId: DSEC_B, group: "b" },
      ];
      if (heldFirst) list.reverse();
      const outcomes = outcomesOf(await unmergeItems(env, { pairs: list }));
      expect(outcomes.get(DSEC_A)).toEqual({
        action: "repoint",
        twinId: DSEC_LIVE,
        rule: "same-as",
      });
      expect(outcomes.get(DSEC_B)).toMatchObject({
        action: "skip",
        reason: "needs-decision",
      });
      expect(candidateIds(outcomes.get(DSEC_B))).toEqual([DSEC_LIVE]);
    }
  );
});
