/**
 * Reads the rows `planUnmerge` needs. The SQL is plain SELECT text with the
 * validated hex ids inlined, so the Worker binding and a local
 * `wrangler d1 execute --remote` (the CLI dry run) run the same statements.
 */
import { MERGE_LOOKBACK_SEC } from "../ingest/context.js";
import type {
  ItemId,
  StoredSource,
  UnmergeItemRow,
  UnmergePair,
  UnmergeSnapshot,
} from "./plan.js";
import { twinMatches } from "./twins.js";

export type SelectRows = (sql: string) => Promise<Record<string, unknown>[]>;

const ID_CHUNK = 100;

function idList(ids: readonly ItemId[]): string {
  return ids.map((id) => `'${id}'`).join(", ");
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size)
    out.push(values.slice(i, i + size));
  return out;
}

const ITEM_COLUMNS = `id, source_id, url, title, summary, status, duplicate_of,
  points, comments, tags, image_url, media_manifest, published_at, fetched_at,
  llm_relevance, llm_importance, llm_quality, rank_score, source_lang,
  (SELECT COALESCE(SUM(v.value), 0) FROM item_votes v WHERE v.item_id = items.id) AS vote_net,
  (SELECT COUNT(*) FROM notifications n WHERE n.item_id = items.id) AS notifications,
  EXISTS (SELECT 1 FROM translations t WHERE t.item_id = items.id AND t.lang = 'vi') AS has_vi`;

/** Canonicals, every item merged into them, and the paired ids themselves
 * (a restored or regrouped id no longer points at its old canonical). */
export function unmergeItemsSql(
  canonicalIds: readonly ItemId[],
  pairedIds: readonly ItemId[]
): string {
  return `SELECT ${ITEM_COLUMNS} FROM items
  WHERE id IN (${idList([...canonicalIds, ...pairedIds])})
     OR (status = 'merged' AND duplicate_of IN (${idList(canonicalIds)}))`;
}

export function unmergeSourcesSql(itemIds: readonly ItemId[]): string {
  return `SELECT item_id, position, kind, author, posted_at, quote, url
  FROM item_sources WHERE item_id IN (${idList(itemIds)})
  ORDER BY item_id, position`;
}

/** Published rows in `[from, to]` (epoch seconds), as story identities. */
export function publishedWindowSql(from: number, to: number): string {
  return `SELECT id, source_id, url, title, published_at FROM items
  WHERE status = 'published' AND published_at BETWEEN ${Math.floor(from)} AND ${Math.floor(to)}`;
}

export async function loadUnmergeSnapshot(
  select: SelectRows,
  pairs: readonly UnmergePair[]
): Promise<UnmergeSnapshot> {
  const items = new Map<string, UnmergeItemRow>();
  const sources = new Map<string, StoredSource[]>();
  const loadRows = async (
    canonicalIds: readonly ItemId[],
    pairedIds: readonly ItemId[]
  ) => {
    for (const row of await select(unmergeItemsSql(canonicalIds, pairedIds))) {
      const item = row as unknown as UnmergeItemRow;
      items.set(item.id, {
        ...item,
        vote_net: Number(item.vote_net ?? 0),
        notifications: Number(item.notifications ?? 0),
        has_vi: Number(item.has_vi ?? 0),
      });
    }
    for (const row of await select(
      unmergeSourcesSql([...canonicalIds, ...pairedIds])
    )) {
      const itemId = String(row.item_id);
      const list = sources.get(itemId) ?? [];
      list.push({
        kind: row.kind as StoredSource["kind"],
        author: (row.author as string | null) ?? null,
        posted_at: (row.posted_at as number | null) ?? null,
        quote: (row.quote as string | null) ?? null,
        url: (row.url as string | null) ?? null,
      });
      sources.set(itemId, list);
    }
  };

  const canonicalIds = [...new Set(pairs.map((p) => p.canonicalId))];
  for (const canonicals of chunks(canonicalIds, ID_CHUNK)) {
    const inChunk = new Set<string>(canonicals);
    await loadRows(
      canonicals,
      pairs.filter((p) => inChunk.has(p.canonicalId)).map((p) => p.mergedId)
    );
  }

  // Where a restored story could already be live: published rows within the
  // merge lookback of a paired row. Rows that match, and every `sameAs`,
  // load in full, as canonicals (their merged items and sources too).
  const paired = pairs
    .map((p) => items.get(p.mergedId))
    .filter((row): row is UnmergeItemRow => row !== undefined);
  if (paired.length === 0) return { items, sources, published: [] };
  const times = paired.map((row) => row.published_at);
  const published = (
    await select(
      publishedWindowSql(
        Math.min(...times) - MERGE_LOOKBACK_SEC,
        Math.max(...times) + MERGE_LOOKBACK_SEC
      )
    )
  ).map((row) => ({
    id: String(row.id),
    source_id: String(row.source_id),
    url: String(row.url),
    title: String(row.title),
    published_at: Number(row.published_at),
  }));
  const twinIds = new Set<ItemId>();
  for (const row of paired) {
    for (const { ref } of twinMatches([row], published)) {
      twinIds.add(ref.id as ItemId);
    }
  }
  for (const pair of pairs) {
    if (pair.decision?.kind === "same-as") twinIds.add(pair.decision.twinId);
  }
  const missing = [...twinIds].filter((id) => !items.has(id));
  for (const twins of chunks(missing, ID_CHUNK)) await loadRows(twins, []);
  return { items, sources, published };
}

/** The Worker's D1 binding as a `SelectRows`. */
export function d1Select(db: D1Database): SelectRows {
  return async (sql) =>
    (await db.prepare(sql).all<Record<string, unknown>>()).results ?? [];
}
