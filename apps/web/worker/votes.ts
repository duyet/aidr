import {
  RANK_SIGNAL_COLUMNS,
  RANK_SIGNAL_JOIN,
  type RankSignalRow,
  rankScore,
  rowRankSignals,
} from "./ranking.js";

/** Story ids are the sha256 hex of the canonical URL. */
export function isStoryId(id: string): boolean {
  return /^[0-9a-f]{8,64}$/.test(id);
}

function isUserId(id: string): boolean {
  if (id.length === 0 || id.length > 128) return false;
  for (let i = 0; i < id.length; i++) {
    if (id.charCodeAt(i) <= 0x1f) return false;
  }
  return true;
}

export type VoteValue = 1 | -1;
export type StoredVote = VoteValue | 0;

export type VoteResult =
  | { ok: true; myVote: StoredVote; voteNet: number; rankScore: number }
  | { ok: false; error: string };

interface RankRow extends RankSignalRow {
  id: string;
  status: string;
  published_at: number;
  llm_importance: number | null;
  llm_quality: number | null;
}

const RANK_ROW_SQL = `SELECT id, status, published_at, llm_importance, llm_quality,
            ${RANK_SIGNAL_COLUMNS}
     FROM items ${RANK_SIGNAL_JOIN}
     WHERE items.id = ?`;

async function loadRankRow(
  db: D1Database,
  itemId: string
): Promise<RankRow | null> {
  return db.prepare(RANK_ROW_SQL).bind(itemId).first<RankRow>();
}

function scoreOf(row: RankRow, nowMs: number): number {
  return rankScore({
    importance: row.llm_importance ?? 5,
    quality: row.llm_quality ?? 5,
    publishedAt: row.published_at * 1000,
    now: nowMs,
    ...rowRankSignals(row),
  });
}

/** Clicking the current vote clears it. Clicking the other one replaces it. */
export function nextVote(
  current: VoteValue | null,
  clicked: VoteValue
): VoteValue | null {
  return current === clicked ? null : clicked;
}

/** Save one signed-in reader's vote and recompute that item's rank_score.
 * `published_at` is epoch seconds, matching the items table. */
export async function applyVote(
  db: D1Database,
  input: { itemId: string; userId: string; value: VoteValue; nowMs?: number }
): Promise<VoteResult> {
  if (!isStoryId(input.itemId)) return { ok: false, error: "Story not found" };
  if (!isUserId(input.userId)) return { ok: false, error: "Sign in required" };
  if (input.value !== 1 && input.value !== -1) {
    return { ok: false, error: "Invalid vote" };
  }

  const before = await loadRankRow(db, input.itemId);
  if (before?.status !== "published") {
    return { ok: false, error: "Story not found" };
  }

  const existing = await db
    .prepare("SELECT value FROM item_votes WHERE item_id = ? AND user_id = ?")
    .bind(input.itemId, input.userId)
    .first<{ value: number }>();
  const raw = existing?.value;
  const current: VoteValue | null = raw === 1 || raw === -1 ? raw : null;
  const next = nextVote(current, input.value);
  const nowMs = input.nowMs ?? Date.now();
  const updatedAt = Math.floor(nowMs / 1000);

  if (next === null) {
    await db
      .prepare("DELETE FROM item_votes WHERE item_id = ? AND user_id = ?")
      .bind(input.itemId, input.userId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO item_votes (item_id, user_id, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(item_id, user_id) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .bind(input.itemId, input.userId, next, updatedAt)
      .run();
  }

  const after = await loadRankRow(db, input.itemId);
  if (!after) return { ok: false, error: "Story not found" };
  const rank = scoreOf(after, nowMs);
  await db
    .prepare("UPDATE items SET rank_score = ? WHERE id = ?")
    .bind(rank, input.itemId)
    .run();

  return {
    ok: true,
    myVote: next ?? 0,
    voteNet: rowRankSignals(after).voteNet,
    rankScore: rank,
  };
}

export interface ReaderVoteView {
  votes: Record<string, VoteValue>;
  nets: Record<string, number>;
}

const MAX_VOTE_LOOKUP = 90;

/** The signed-in user's own votes, plus the public net, for a page of ids. */
export async function listReaderVotes(
  db: D1Database,
  userId: string,
  itemIds: readonly string[]
): Promise<ReaderVoteView> {
  const votes: Record<string, VoteValue> = {};
  const nets: Record<string, number> = {};
  if (!isUserId(userId)) return { votes, nets };
  const ids = [...new Set(itemIds.filter(isStoryId))].slice(0, MAX_VOTE_LOOKUP);
  if (ids.length === 0) return { votes, nets };
  const marks = ids.map(() => "?").join(",");
  const mine = await db
    .prepare(
      `SELECT item_id, value FROM item_votes
       WHERE user_id = ? AND item_id IN (${marks})`
    )
    .bind(userId, ...ids)
    .all<{ item_id: string; value: number }>();
  for (const row of mine.results ?? []) {
    if (row.value === 1 || row.value === -1) votes[row.item_id] = row.value;
  }
  const sums = await db
    .prepare(
      `SELECT item_id, SUM(value) AS vote_net FROM item_votes
       WHERE item_id IN (${marks}) GROUP BY item_id`
    )
    .bind(...ids)
    .all<{ item_id: string; vote_net: number }>();
  for (const row of sums.results ?? []) {
    nets[row.item_id] = row.vote_net ?? 0;
  }
  return { votes, nets };
}

let votesTableReady: boolean | null = null;

/** Feed and story reads skip the join until the migration is applied.
 * A successful probe stays true for the life of the isolate. */
export async function itemVotesTableReady(db: {
  prepare(sql: string): { all(): Promise<unknown> };
}): Promise<boolean> {
  if (votesTableReady !== null) return votesTableReady;
  try {
    await db.prepare("SELECT item_id FROM item_votes LIMIT 1").all();
    votesTableReady = true;
  } catch {
    votesTableReady = false;
  }
  return votesTableReady;
}
