/**
 * Reads the rows `planUnmerge` and `planDanglingUnmerge` need. The SQL is
 * plain SELECT text with the validated hex ids inlined, so the Worker
 * binding and a local `wrangler d1 execute --remote` (the CLI dry run) run
 * the same statements.
 */
import { MERGE_LOOKBACK_SEC } from "../ingest/context.js";
import {
  type DanglingSnapshot,
  type ItemId,
  parseItemId,
  type StoredSource,
  type UnmergeItemRow,
  type UnmergePair,
  type UnmergeSnapshot,
} from "./plan.js";
import { type StoryRef, twinMatches } from "./twins.js";

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

/** Reads rows into one snapshot's maps. */
function snapshotReader(select: SelectRows) {
  const items = new Map<string, UnmergeItemRow>();
  const sources = new Map<string, StoredSource[]>();
  const addItems = (rows: readonly Record<string, unknown>[]) => {
    for (const row of rows) {
      const item = row as unknown as UnmergeItemRow;
      items.set(item.id, {
        ...item,
        vote_net: Number(item.vote_net ?? 0),
        notifications: Number(item.notifications ?? 0),
        has_vi: Number(item.has_vi ?? 0),
      });
    }
  };
  const addSources = (rows: readonly Record<string, unknown>[]) => {
    for (const row of rows) {
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
  const loadRows = async (
    canonicalIds: readonly ItemId[],
    pairedIds: readonly ItemId[]
  ) => {
    addItems(await select(unmergeItemsSql(canonicalIds, pairedIds)));
    addSources(
      await select(unmergeSourcesSql([...canonicalIds, ...pairedIds]))
    );
  };

  /** Where a restored story could already be live: published rows within
   * the merge lookback of a paired row. Rows that match, and `twinIds`,
   * load in full, as canonicals (their merged items and sources too). */
  const loadPublished = async (
    paired: readonly UnmergeItemRow[],
    twinIds: ReadonlySet<ItemId>
  ): Promise<StoryRef[]> => {
    if (paired.length === 0) return [];
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
    const load = new Set<ItemId>(twinIds);
    for (const row of paired) {
      for (const { ref } of twinMatches([row], published)) {
        load.add(ref.id as ItemId);
      }
    }
    const missing = [...load].filter((id) => !items.has(id));
    for (const twins of chunks(missing, ID_CHUNK)) await loadRows(twins, []);
    return published;
  };

  return { items, sources, addItems, addSources, loadRows, loadPublished };
}

export async function loadUnmergeSnapshot(
  select: SelectRows,
  pairs: readonly UnmergePair[]
): Promise<UnmergeSnapshot> {
  const reader = snapshotReader(select);
  const canonicalIds = [...new Set(pairs.map((p) => p.canonicalId))];
  for (const canonicals of chunks(canonicalIds, ID_CHUNK)) {
    const inChunk = new Set<string>(canonicals);
    await reader.loadRows(
      canonicals,
      pairs.filter((p) => inChunk.has(p.canonicalId)).map((p) => p.mergedId)
    );
  }
  const paired = pairs
    .map((p) => reader.items.get(p.mergedId))
    .filter((row): row is UnmergeItemRow => row !== undefined);
  const sameAs = new Set<ItemId>();
  for (const pair of pairs) {
    if (pair.decision?.kind === "same-as") sameAs.add(pair.decision.twinId);
  }
  const published = await reader.loadPublished(paired, sameAs);
  return { items: reader.items, sources: reader.sources, published };
}

/** Merged rows whose `duplicate_of` names no item (#791). */
const DANGLING_WHERE = `status = 'merged' AND duplicate_of IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM items c WHERE c.id = items.duplicate_of)`;

export const DANGLING_IDS_SQL = `SELECT id FROM items WHERE ${DANGLING_WHERE}
  ORDER BY fetched_at, id`;

/** The source union the merge wrote under each dangling id. */
export const DANGLING_SOURCES_SQL = `SELECT item_id, position, kind, author, posted_at, quote, url
  FROM item_sources
  WHERE item_id IN (SELECT duplicate_of FROM items WHERE ${DANGLING_WHERE})
  ORDER BY item_id, position`;

function itemsByIdSql(ids: readonly ItemId[]): string {
  return `SELECT ${ITEM_COLUMNS} FROM items WHERE id IN (${idList(ids)})`;
}

function publishedIdsSql(from: number, to: number): string {
  return `SELECT id FROM items
  WHERE status = 'published' AND published_at BETWEEN ${Math.floor(from)} AND ${Math.floor(to)}`;
}

/** Every dangling merged row, the sources under each dangling id, the
 * published rows a restored story could duplicate, and the published rows
 * of the same days with their members, which set the score scale. */
export async function loadDanglingSnapshot(
  select: SelectRows
): Promise<DanglingSnapshot> {
  const reader = snapshotReader(select);
  const dangling = (await select(DANGLING_IDS_SQL))
    .map((row) => parseItemId(row.id))
    .filter((id): id is ItemId => id !== null);
  for (const ids of chunks(dangling, ID_CHUNK)) {
    reader.addItems(await select(itemsByIdSql(ids)));
  }
  reader.addSources(await select(DANGLING_SOURCES_SQL));
  const rows = dangling
    .map((id) => reader.items.get(id))
    .filter((row): row is UnmergeItemRow => row !== undefined);
  const published = await reader.loadPublished(rows, new Set());
  const calibration: ItemId[] = [];
  if (rows.length > 0) {
    const times = rows.map((row) => row.published_at);
    for (const row of await select(
      publishedIdsSql(Math.min(...times), Math.max(...times))
    )) {
      const id = parseItemId(row.id);
      if (id) calibration.push(id);
    }
    for (const ids of chunks(calibration, ID_CHUNK)) {
      reader.addItems(await select(unmergeItemsSql(ids, [])));
    }
  }
  return {
    items: reader.items,
    sources: reader.sources,
    published,
    dangling,
    calibration,
  };
}

/** The Worker's D1 binding as a `SelectRows`. */
export function d1Select(db: D1Database): SelectRows {
  return async (sql) =>
    (await db.prepare(sql).all<Record<string, unknown>>()).results ?? [];
}
