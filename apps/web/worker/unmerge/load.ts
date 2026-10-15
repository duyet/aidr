/**
 * Reads the rows `planUnmerge` and `planDanglingUnmerge` need. The SQL is
 * plain SELECT text with the validated hex ids inlined, so the Worker
 * binding and a local `wrangler d1 execute --remote` (the CLI dry run) run
 * the same statements.
 */
import {
  CHECKS_SQL,
  type CheckBatch,
  type CheckCandidate,
  type CheckWork,
  checkCandidate,
  checkWindowSql,
  checkWork,
  parseChecks,
  parseLiveRows,
  planCheckBatches,
} from "./check.js";
import {
  type DanglingDecision,
  type DanglingSnapshot,
  type ItemId,
  parseItemId,
  planDanglingUnmerge,
  type StoredSource,
  type UnmergeItemRow,
  type UnmergePair,
  type UnmergeSnapshot,
} from "./plan.js";
import { type LiveRef, TWIN_WINDOW_SEC, twinMatches } from "./twins.js";

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
  (SELECT t.title FROM translations t WHERE t.item_id = items.id AND t.lang = 'en') AS title_en,
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

/** Published and merged rows in `[from, to]` (epoch seconds), as story
 * identities with the link a merged row's root is found by. */
export function liveWindowSql(from: number, to: number): string {
  return `SELECT id, source_id, url, title, published_at, source_lang, status, duplicate_of,
  CASE WHEN source_lang = 'vi' THEN (SELECT t.title FROM translations t
    WHERE t.item_id = items.id AND t.lang = 'en') END AS title_en
  FROM items
  WHERE status IN ('published', 'merged')
    AND published_at BETWEEN ${Math.floor(from)} AND ${Math.floor(to)}`;
}

function itemLinksSql(ids: readonly ItemId[]): string {
  return `SELECT id, status, duplicate_of FROM items WHERE id IN (${idList(ids)})`;
}

/** Merge chains are short (a canonical later merged into another story);
 * a longer one is treated as having no published root. */
const MAX_ROOT_HOPS = 4;

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
   * `TWIN_WINDOW_SEC` of a `restoring` row, and the merged rows there
   * whose `duplicate_of` chain ends at a published row (their root).
   * `restoring` itself is left out: those rows move. The roots of rows that
   * match, and `twinIds`, load in full, as canonicals (their merged items
   * and sources too). */
  const loadLive = async (
    restoring: readonly UnmergeItemRow[],
    twinIds: ReadonlySet<ItemId>
  ): Promise<LiveRef[]> => {
    if (restoring.length === 0) return [];
    const times = restoring.map((row) => row.published_at);
    const window = await select(
      liveWindowSql(
        Math.min(...times) - TWIN_WINDOW_SEC,
        Math.max(...times) + TWIN_WINDOW_SEC
      )
    );
    const link = new Map<string, { status: string; next: string | null }>();
    const addLinks = (rows: readonly Record<string, unknown>[]) => {
      for (const row of rows) {
        link.set(String(row.id), {
          status: String(row.status),
          next: (row.duplicate_of as string | null) ?? null,
        });
      }
    };
    addLinks(window);
    for (let hop = 0; hop < MAX_ROOT_HOPS; hop++) {
      const unknown = [
        ...new Set(
          [...link.values()]
            .filter((l) => l.status === "merged")
            .map((l) => parseItemId(l.next))
            .filter((id): id is ItemId => id !== null && !link.has(id))
        ),
      ];
      if (unknown.length === 0) break;
      for (const ids of chunks(unknown, ID_CHUNK)) {
        addLinks(await select(itemLinksSql(ids)));
      }
    }
    const rootOf = (id: string): string | null => {
      let current: string | null = id;
      for (let hop = 0; hop <= MAX_ROOT_HOPS && current !== null; hop++) {
        const l = link.get(current);
        if (!l) return null;
        if (l.status === "published") return current;
        if (l.status !== "merged") return null;
        current = l.next;
      }
      return null;
    };
    const moving = new Set<string>(restoring.map((row) => row.id));
    const live: LiveRef[] = [];
    for (const row of window) {
      const id = String(row.id);
      const root = moving.has(id) ? null : rootOf(id);
      if (root === null) continue;
      live.push({
        id,
        source_id: String(row.source_id),
        url: String(row.url),
        title: String(row.title),
        published_at: Number(row.published_at),
        source_lang: (row.source_lang as string | null) ?? null,
        title_en: (row.title_en as string | null) ?? null,
        root,
      });
    }
    const load = new Set<ItemId>(twinIds);
    for (const row of restoring) {
      for (const { ref } of twinMatches([row], live)) {
        load.add(ref.root as ItemId);
      }
    }
    const missing = [...load].filter((id) => !items.has(id));
    for (const twins of chunks(missing, ID_CHUNK)) await loadRows(twins, []);
    return live;
  };

  return { items, sources, addItems, addSources, loadRows, loadLive };
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
  const live = await reader.loadLive(paired, sameAs);
  return { items: reader.items, sources: reader.sources, live };
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

/** Every dangling merged row, the sources under each dangling id, the live
 * rows a restored story could duplicate, the published rows of the same
 * days with their members, which set the score scale, the rows the
 * decisions name, and the stored model verdicts (#797). */
export async function loadDanglingSnapshot(
  select: SelectRows,
  decisions: readonly DanglingDecision[] = []
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
  const named = decisions
    .map((d) => d.mergedId)
    .filter((id) => !reader.items.has(id));
  for (const ids of chunks(named, ID_CHUNK)) {
    reader.addItems(await select(itemsByIdSql(ids)));
  }
  const sameAs = new Set<ItemId>();
  for (const { decision } of decisions) {
    if (decision.kind === "same-as") sameAs.add(decision.twinId);
  }
  const live = await reader.loadLive(rows, sameAs);
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
    live,
    dangling,
    calibration,
    checks: parseChecks(await select(CHECKS_SQL)),
  };
}

/** The stories the plan holds only for a verdict. */
export function pendingCandidates(
  snapshot: DanglingSnapshot,
  decisions: readonly DanglingDecision[],
  nowMs: number
): CheckCandidate[] {
  const plan = planDanglingUnmerge(snapshot, nowMs, decisions);
  return plan.canonicals.flatMap((canonical) => {
    const outcome = canonical.pairs[0]?.outcome;
    if (outcome?.action !== "skip" || outcome.reason !== "needs-model-check")
      return [];
    return [
      checkCandidate(
        canonical.pairs.flatMap(({ pair }) => {
          const row = snapshot.items.get(pair.mergedId);
          return row ? [row] : [];
        })
      ),
    ];
  });
}

/** Pending stories, the live rows each backs, and the calls they need
 * (`check.ts`). */
export interface CheckPlan {
  work: CheckWork[];
  batches: CheckBatch[];
  /** Model calls the batches make. */
  calls: number;
}

export async function loadCheckPlan(
  select: SelectRows,
  snapshot: DanglingSnapshot,
  decisions: readonly DanglingDecision[],
  nowMs: number
): Promise<CheckPlan> {
  const candidates = pendingCandidates(snapshot, decisions, nowMs);
  if (candidates.length === 0) return { work: [], batches: [], calls: 0 };
  const live = parseLiveRows(
    await select(
      checkWindowSql(
        Math.min(...candidates.map((c) => c.from)),
        Math.max(...candidates.map((c) => c.to))
      )
    )
  );
  const work = checkWork(candidates, live);
  const batches = planCheckBatches(work);
  return {
    work,
    batches,
    calls: batches.reduce((n, batch) => n + batch.chunks.length, 0),
  };
}

/** The Worker's D1 binding as a `SelectRows`. */
export function d1Select(db: D1Database): SelectRows {
  return async (sql) =>
    (await db.prepare(sql).all<Record<string, unknown>>()).results ?? [];
}
