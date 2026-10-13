/**
 * The stories a channel has already put in front of its readers in the last
 * 48 hours: its own trending posts, and the stories its digest carried on
 * the current and previous local dates. `post-quality.ts` compares a
 * trending candidate against these.
 */

import type { Lang } from "../../src/lib/types.js";
import type { Env } from "../types.js";
import { loadDayCard } from "./day-card.js";
import { eventKey, type PostedEvent } from "./post-quality.js";

export const POSTED_WINDOW_MS = 48 * 60 * 60 * 1000;

/** A claim whose outcome was never recorded may be posted, so it counts. */
const POSTED_STATUSES = "('sent', 'ambiguous', 'sending')";

/** `duplicate_of` hops followed to a story's root. Merge points straight at
 *  the root, so one hop is normal; the cap only bounds a bad cycle. */
const MAX_CANONICAL_HOPS = 3;

interface ItemRow {
  id: string;
  title: string;
  duplicate_of: string | null;
}

/** Story ids the digest for `date` shows: the day card's stories, which is
 *  what the channel posts when the day has any, else the snapshot's cited
 *  stories. Read before the send so the record matches what goes out. */
export async function digestItemIds(
  env: Pick<Env, "DB">,
  date: string,
  lang: Lang,
  snapshotIds: readonly string[]
): Promise<string[]> {
  const card = await loadDayCard(env, date, lang).catch(() => null);
  const ids = card ? card.itemIds : [...snapshotIds];
  return [...new Set(ids)];
}

/** Records the stories a digest carried. A failed write is logged, never
 *  thrown: the digest is already out and must not read as failed. The cost
 *  is a trending repeat of one of these stories until the next digest. */
export async function recordDigestItems(
  env: Pick<Env, "DB">,
  channel: string,
  date: string,
  itemIds: readonly string[]
): Promise<void> {
  if (itemIds.length === 0) return;
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO notify_digest_items (channel, date, item_id)
       SELECT ?, ?, value FROM json_each(?)`
    )
      .bind(channel, date, JSON.stringify(itemIds))
      .run();
  } catch (error) {
    console.error(
      `notify(${channel}) digest items not recorded for ${date}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function loadItems(
  env: Pick<Env, "DB">,
  ids: readonly string[]
): Promise<Map<string, ItemRow>> {
  const items = new Map<string, ItemRow>();
  let frontier = [...new Set(ids)];
  for (let hop = 0; hop <= MAX_CANONICAL_HOPS && frontier.length > 0; hop++) {
    const { results } = await env.DB.prepare(
      `SELECT id, title, duplicate_of FROM items
       WHERE id IN (SELECT value FROM json_each(?))`
    )
      .bind(JSON.stringify(frontier))
      .all<ItemRow>();
    for (const row of results ?? []) items.set(row.id, row);
    frontier = [
      ...new Set(
        (results ?? [])
          .map((row) => row.duplicate_of)
          .filter((id): id is string => Boolean(id) && !items.has(id as string))
      ),
    ];
  }
  return items;
}

/** The root of a `duplicate_of` chain; the id itself when it has none. */
export function canonicalOf(
  id: string,
  duplicateOf: ReadonlyMap<string, string | null>
): string {
  let current = id;
  for (let hop = 0; hop < MAX_CANONICAL_HOPS; hop++) {
    const next = duplicateOf.get(current);
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

/**
 * Everything `channel` posted since `now - 48h`, with each story's root id
 * and event key. `digestDates` are the current and previous local dates.
 * Source titles key the events on both sides, so the channel's language does
 * not change what matches.
 */
export async function loadPostedEvents(
  env: Pick<Env, "DB">,
  channel: string,
  now: number,
  digestDates: readonly string[]
): Promise<PostedEvent[]> {
  const { results: trending } = await env.DB.prepare(
    `SELECT item_id, posted_at FROM notifications
     WHERE channel = ? AND status IN ${POSTED_STATUSES}
       AND item_id NOT LIKE 'digest:%' AND posted_at >= ?`
  )
    .bind(channel, now - POSTED_WINDOW_MS)
    .all<{ item_id: string; posted_at: number }>();

  let digest: Array<{ item_id: string; posted_at: number }> = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT d.item_id AS item_id, n.posted_at AS posted_at
       FROM notify_digest_items d
       JOIN notifications n
         ON n.channel = d.channel AND n.item_id = 'digest:' || d.date
       WHERE d.channel = ? AND n.status IN ${POSTED_STATUSES}
         AND d.date IN (SELECT value FROM json_each(?))`
    )
      .bind(channel, JSON.stringify(digestDates))
      .all<{ item_id: string; posted_at: number }>();
    digest = results ?? [];
  } catch (error) {
    // Migration 0057 not applied yet: trending-to-trending dedup still runs.
    console.error(
      `notify(${channel}) digest items unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const posted = [
    ...(trending ?? []).map((row) => ({ ...row, kind: "trending" as const })),
    ...digest.map((row) => ({ ...row, kind: "digest" as const })),
  ];
  if (posted.length === 0) return [];

  const items = await loadItems(
    env,
    posted.map((row) => row.item_id)
  );
  const duplicateOf = new Map(
    [...items.values()].map((row) => [row.id, row.duplicate_of])
  );
  return posted.flatMap((row) => {
    const item = items.get(row.item_id);
    // A story deleted since the post cannot be compared by title.
    if (!item) return [];
    return [
      {
        channelGroup: channel,
        itemId: row.item_id,
        canonicalId: canonicalOf(row.item_id, duplicateOf),
        eventKey: eventKey(item.title),
        postedAt: row.posted_at,
        kind: row.kind,
      },
    ];
  });
}
