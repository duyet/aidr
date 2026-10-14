/**
 * Pure planning for the admin unmerge (#733): given the stored rows of a
 * wrongly merged canonical and the merged items to take back out, decide what
 * every touched row and `item_sources` list becomes. No I/O; `apply.ts`
 * turns a plan into D1 statements and `load.ts` reads the snapshot.
 *
 * A merge into an existing canonical (ingest `write-d1`) writes:
 * - the loser's own `items` row with `status = 'merged'`, `duplicate_of`,
 *   its own points, tags, media and an insert-time `rank_score`; no
 *   `item_sources` rows and no `translations` row;
 * - on the canonical: `points`/`comments` (max with reader-engagement
 *   members), `tags` (union), `image_url`/`media_manifest` (union), a new
 *   `rank_score`, and `item_sources` replaced by the union capped at 8.
 *
 * The plan reverses that. Restored stories are replayed through the ingest
 * planners (`buildMergeCandidates`, `buildMergePlan`, `planNewItemWrite`) as
 * if the wrong canonical had never existed; the canonical keeps what is not
 * attributable to a removed item.
 */
import { MAX_SOURCES_PER_ITEM } from "../d1-bind.js";
import { buildMergePlan, type CanonicalUpdate } from "../dedupe.js";
import {
  RANK_RECOMPUTE_WINDOW_SEC,
  RELEVANCE_THRESHOLD,
} from "../ingest/context.js";
import { buildMergeCandidates } from "../ingest/merge.js";
import type { ItemScore } from "../ingest/score.js";
import { parseTagsJson, planNewItemWrite } from "../ingest/write-plan.js";
import {
  buildMediaManifest,
  canonicalizeMediaUrl,
  MEDIA_MANIFEST_VERSION,
  type MediaAsset,
  type MediaManifest,
  mediaIdentityKey,
  parseMediaManifest,
  primaryThumbnailUrl,
  serializeMediaManifest,
} from "../media.js";
import { TRENDING_ELIGIBLE_WINDOW_SEC } from "../notify/story-ranking.js";
import {
  hasReaderEngagement,
  type RankMember,
  rankScore,
  rankSignals,
} from "../ranking.js";
import { officialSourceFor } from "../sources/catalog.js";
import type {
  FetchedItem,
  FetchedItemSource,
  SourceLanguage,
} from "../sources/types.js";
import { MAX_MERGED_TOPICS } from "../topics.js";
import { DIGEST_WINDOW_DAYS } from "../weekly-digest.js";

export type ItemId = string & { readonly __itemId: unique symbol };

const ITEM_ID = /^[0-9a-f]{64}$/;

export function parseItemId(value: unknown): ItemId | null {
  return typeof value === "string" && ITEM_ID.test(value)
    ? (value as ItemId)
    : null;
}

/** One wrong merge to reverse. Pairs that share `group` under one canonical
 * are one story (huggingnews/marketbrief twins) and come back as one
 * published row with the rest merged into it; `group` defaults to the
 * merged id, so a lone pair comes back on its own. */
export interface UnmergePair {
  canonicalId: ItemId;
  mergedId: ItemId;
  group: string;
}

export const MAX_UNMERGE_PAIRS = 500;

export function parseUnmergePairs(
  raw: unknown
): { pairs: UnmergePair[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "pairs must be a non-empty array" };
  }
  if (raw.length > MAX_UNMERGE_PAIRS) {
    return { error: `at most ${MAX_UNMERGE_PAIRS} pairs per call` };
  }
  const pairs: UnmergePair[] = [];
  const seen = new Set<string>();
  const groupCanonical = new Map<string, string>();
  for (const [index, entry] of raw.entries()) {
    const record =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    const canonicalId = parseItemId(record.canonicalId);
    const mergedId = parseItemId(record.mergedId);
    if (!canonicalId || !mergedId) {
      return {
        error: `pairs[${index}]: canonicalId and mergedId must be 64-char hex item ids`,
      };
    }
    if (canonicalId === mergedId) {
      return { error: `pairs[${index}]: canonicalId equals mergedId` };
    }
    if (seen.has(mergedId)) {
      return { error: `pairs[${index}]: mergedId ${mergedId} listed twice` };
    }
    seen.add(mergedId);
    const group = record.group === undefined ? mergedId : record.group;
    if (typeof group !== "string" || !group || group.length > 128) {
      return { error: `pairs[${index}]: group must be a 1-128 char string` };
    }
    const owner = groupCanonical.get(group);
    if (owner !== undefined && owner !== canonicalId) {
      return {
        error: `pairs[${index}]: group ${group} spans two canonicals`,
      };
    }
    groupCanonical.set(group, canonicalId);
    pairs.push({ canonicalId, mergedId, group });
  }
  for (const pair of pairs) {
    if (seen.has(pair.canonicalId)) {
      return {
        error: `canonical ${pair.canonicalId} is also listed as a merged item`,
      };
    }
  }
  return { pairs };
}

/** The `items` columns the plan reads. */
export interface UnmergeItemRow {
  id: ItemId;
  source_id: string;
  url: string;
  title: string;
  summary: string | null;
  status: string;
  duplicate_of: string | null;
  points: number | null;
  comments: number | null;
  tags: string | null;
  image_url: string | null;
  media_manifest: string | null;
  published_at: number;
  fetched_at: number;
  llm_relevance: number | null;
  llm_importance: number | null;
  llm_quality: number | null;
  rank_score: number | null;
  source_lang: string | null;
  /** Net reader votes on this id (`item_votes`). */
  vote_net: number;
  /** `notifications` rows keyed by this id, any channel or status. */
  notifications: number;
  /** A `translations` row with `lang = 'vi'` exists. */
  has_vi: number;
}

export interface StoredSource {
  kind: "source" | "support" | "discussion";
  author: string | null;
  posted_at: number | null;
  quote: string | null;
  url: string | null;
}

export interface UnmergeSnapshot {
  /** Canonicals, every item merged into them, and every paired id. */
  items: ReadonlyMap<string, UnmergeItemRow>;
  /** `item_sources` in position order, for canonicals and paired ids. */
  sources: ReadonlyMap<string, readonly StoredSource[]>;
}

/** Restored rows and canonicals inside this window are left alone: every
 * channel that could pick a story up as news reads `published_at` inside it.
 * The rolling weekly mail on date D lists D-7..D-1 (`DIGEST_WINDOW_DAYS`),
 * one more day covers today; trending, Facebook and the posted-events check
 * read 24-48h. Outside it, a restored row reaches only its day and week
 * pages, never a send. */
export const UNMERGE_QUIET_SEC = Math.max(
  TRENDING_ELIGIBLE_WINDOW_SEC,
  (DIGEST_WINDOW_DAYS + 1) * 24 * 60 * 60
);

export type PairOutcome =
  | { action: "restore"; leadId: ItemId; status: "published" | "rejected" }
  | { action: "regroup"; leadId: ItemId }
  | { action: "noop"; reason: "already-unmerged" }
  | {
      action: "skip";
      reason:
        | "missing-item"
        | "missing-canonical"
        | "canonical-not-published"
        | "merged-elsewhere"
        | "inside-quiet-window"
        | "demoted-canonical";
      detail: string;
    };

export interface ColumnChange {
  column: string;
  before: unknown;
  after: unknown;
}

/** The `items` columns an unmerge reads to plan a row and may write. */
export const ROW_STATE_COLUMNS = [
  "status",
  "duplicate_of",
  "points",
  "comments",
  "tags",
  "image_url",
  "media_manifest",
  "rank_score",
] as const;

export type RowState = Pick<UnmergeItemRow, (typeof ROW_STATE_COLUMNS)[number]>;

export function rowState(row: UnmergeItemRow): RowState {
  return Object.fromEntries(
    ROW_STATE_COLUMNS.map((column) => [column, row[column]])
  ) as RowState;
}

export interface RowTarget {
  id: ItemId;
  role: "canonical" | "lead" | "twin";
  /** The row is written only while it still holds every one of these
   * values: the plan derived its writes from all of them. */
  guard: RowState;
  changes: ColumnChange[];
}

export type SourceRule =
  | "url"
  | "discussion"
  | "run-before-member"
  | "trailing-capped"
  | "kept-on-canonical";

export interface AttributedSource {
  position: number;
  url: string | null;
  owner: ItemId;
  rule: SourceRule;
  /** Kept on the canonical though a removed item may own it. */
  ambiguous: boolean;
}

export interface SourcesTarget {
  itemId: ItemId;
  before: StoredSource[];
  after: StoredSource[];
}

export interface TranslationText {
  title: string | null;
  summary: string | null;
}

/** A `translations` row with `lang = 'vi'`; null is no row. */
export interface TranslationTarget {
  itemId: ItemId;
  before: TranslationText | null;
  after: TranslationText | null;
}

/** Every write of one canonical's batch, each with its before and after.
 * `apply.ts` guards on the befores, audits the whole set, and undo writes
 * the befores back. */
export interface ChangeSet {
  canonicalId: ItemId;
  rows: RowTarget[];
  sources: SourcesTarget[];
  /** VI-source restored rows get the native `translations` row ingest
   * writes for a published VI item. */
  translations: TranslationTarget[];
}

export interface CanonicalPlan extends ChangeSet {
  pairs: { pair: UnmergePair; outcome: PairOutcome }[];
  attribution: AttributedSource[];
  /** The lead image a reader sees (`displayLead`) on the canonical and on
   * each restored row, before and after. */
  leads: {
    id: ItemId;
    role: "canonical" | "lead";
    before: string | null;
    after: string | null;
  }[];
  /** Values the merge overwrote that the plan cannot recover exactly. */
  lossy: string[];
}

export interface UnmergePlan {
  nowMs: number;
  /** Multiplier from a fresh 72h score to stored scores for restored rows
   * (see `storedScale`). */
  restoredScale: number;
  canonicals: CanonicalPlan[];
}

const asNumber = (value: number | null | undefined, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const urlKey = (url: string) => canonicalizeMediaUrl(url) ?? url;

/** The 72h re-rank never touches older rows, so a stored score is frozen at
 * the end of that window. Restored and shrunken rows are scored at the same
 * point so they sort among their day as if the merge never happened. */
export function freezeNowMs(publishedAtSec: number, nowMs: number): number {
  return Math.min(nowMs, (publishedAtSec + RANK_RECOMPUTE_WINDOW_SEC) * 1000);
}

function toFetchedSource(row: StoredSource): FetchedItemSource {
  return {
    kind: row.kind,
    author: row.author ?? undefined,
    postedAt: row.posted_at ?? undefined,
    quote: row.quote ?? undefined,
    url: row.url ?? undefined,
  };
}

function toStoredSource(source: FetchedItemSource): StoredSource {
  return {
    kind: source.kind,
    author: source.author ?? null,
    posted_at: source.postedAt ?? null,
    quote: source.quote ?? null,
    url: source.url ?? null,
  };
}

/** The `{ source, url, author: sourceId }` row the merge appends for each
 * merged item. A self-source with `posted_at` is the item's own fetched row
 * instead (RSS, marketbrief), which the union kept first. */
function isMemberEntry(row: StoredSource, member: UnmergeItemRow): boolean {
  return (
    row.kind === "source" &&
    row.posted_at === null &&
    row.author === member.source_id &&
    row.url !== null &&
    urlKey(row.url) === urlKey(member.url)
  );
}

/**
 * Who each of the canonical's `item_sources` rows came from. The merge
 * appends, per merged item, its fetched sources and then its own URL, after
 * the canonical's own rows; official links move to the front; the list is
 * capped at 8. So:
 * - `url`: the row is the canonical's or a member's URL;
 * - `discussion`: an HN/Lobsters discussion row whose `posted_at` is one
 *   item's `published_at` (those adapters emit exactly that row);
 * - `run-before-member`: rows between two attributed rows belong to the
 *   member whose appended URL row ends the run (a tweet-sourced aggregator);
 * - `trailing-capped`: rows after the last attributed row belong to a member
 *   whose URL row the cap dropped, when those members are one restore group.
 * Anything else stays on the canonical (`kept-on-canonical`), flagged
 * ambiguous when a removed item might own it.
 */
export function attributeSources(
  canonical: UnmergeItemRow,
  members: readonly UnmergeItemRow[],
  rows: readonly StoredSource[],
  groupOf: ReadonlyMap<string, string>
): AttributedSource[] {
  const items = [canonical, ...members];
  const byUrl = new Map(items.map((item) => [urlKey(item.url), item]));
  const memberById = new Map(members.map((m) => [m.id as string, m]));
  const removed = (id: string | undefined) =>
    id !== undefined && groupOf.has(id);

  const direct = rows.map((row, position): AttributedSource | null => {
    const byLink = row.url ? byUrl.get(urlKey(row.url)) : undefined;
    if (byLink) {
      return {
        position,
        url: row.url,
        owner: byLink.id,
        rule: "url",
        ambiguous: false,
      };
    }
    if (row.kind === "discussion" && row.posted_at !== null) {
      const posted = items.filter(
        (item) => item.published_at === row.posted_at
      );
      if (posted.length === 1) {
        return {
          position,
          url: row.url,
          owner: posted[0].id,
          rule: "discussion",
          ambiguous: false,
        };
      }
    }
    return null;
  });
  const boundaries = direct.flatMap((owner, index) => (owner ? [index] : []));
  // `unionSources` moves official links to the front, ahead of the
  // canonical's own rows; the leading run starts after them.
  let officialPrefix = 0;
  while (officialPrefix < rows.length && isOfficialRow(rows[officialPrefix])) {
    officialPrefix++;
  }
  const first =
    boundaries.find((index) => index >= officialPrefix) ?? rows.length;
  const last = boundaries.at(-1) ?? -1;
  const attributed = new Set(
    boundaries.map((index) => direct[index]?.owner as string)
  );
  const capped = members.filter((m) => !attributed.has(m.id));
  const cappedGroups = new Set(
    capped.map((m) => groupOf.get(m.id) ?? `stay:${m.id}`)
  );
  const trailingOwner =
    capped.length > 0 && cappedGroups.size === 1 && removed(capped[0].id)
      ? capped[0]
      : null;
  const removedCapped = capped.some((m) => removed(m.id));
  const memberEntryAt = (boundary: number | undefined) => {
    if (boundary === undefined) return undefined;
    const member = memberById.get(direct[boundary]?.owner ?? "");
    return member && isMemberEntry(rows[boundary], member) ? member : undefined;
  };

  return rows.map((row, position) => {
    const own = direct[position];
    if (own) return own;
    const assign = (
      owner: ItemId,
      rule: SourceRule,
      ambiguous = false
    ): AttributedSource => ({
      position,
      url: row.url,
      owner,
      rule,
      ambiguous,
    });
    const next = boundaries.find((index) => index > position);
    // The canonical's own fetched rows come first. A leading run may be its
    // own tweets, so it never moves.
    if (position < first) {
      return assign(
        canonical.id,
        "kept-on-canonical",
        next === undefined ? removedCapped : removed(memberEntryAt(next)?.id)
      );
    }
    if (position > last) {
      return trailingOwner
        ? assign(trailingOwner.id, "trailing-capped")
        : assign(canonical.id, "kept-on-canonical", removedCapped);
    }
    const entry = memberEntryAt(next);
    if (entry) return assign(entry.id, "run-before-member");
    const previous = boundaries.filter((index) => index < position).at(-1);
    return assign(
      canonical.id,
      "kept-on-canonical",
      removed(direct[previous ?? -1]?.owner) ||
        removed(direct[next ?? -1]?.owner)
    );
  });
}

function mediaOf(row: UnmergeItemRow): MediaAsset[] {
  return parseMediaManifest(row.media_manifest, row.image_url, row.url).assets;
}

const hasPicture = (asset: MediaAsset) =>
  asset.type === "image" || Boolean(asset.poster_url);

/** Same test `unionSources` uses to move a link to the front. */
function isOfficialRow(row: StoredSource): boolean {
  return (
    row.kind === "source" &&
    officialSourceFor(row.author ?? "", row.url ?? undefined) !== undefined
  );
}

/** Identity keys of a row's stored assets as written, its `image_url`, and
 * each video's poster as an image, since a poster can become the canonical's
 * `image_url`. Read raw like the canonical's manifest: the parsed form drops
 * share cards next to a photo and avatars, which the merge still copied. */
function assetKeys(row: UnmergeItemRow): Set<string> {
  const keys = new Set<string>();
  const assets: MediaAsset[] = [
    ...storedAssets(row.media_manifest),
    ...(row.image_url ? [{ type: "image" as const, url: row.image_url }] : []),
  ];
  for (const asset of assets) {
    const key = assetKey(asset);
    if (key) keys.add(key);
    const poster =
      asset.type === "video" && asset.poster_url
        ? mediaIdentityKey("image", asset.poster_url)
        : null;
    if (poster) keys.add(poster);
  }
  return keys;
}

function assetKey(asset: MediaAsset): string | null {
  return mediaIdentityKey(asset.type, asset.url);
}

function itemScore(row: UnmergeItemRow): ItemScore | undefined {
  if (
    row.llm_relevance === null &&
    row.llm_importance === null &&
    row.llm_quality === null
  ) {
    return undefined;
  }
  return {
    i: 0,
    relevance: asNumber(row.llm_relevance, 0.5),
    importance: asNumber(row.llm_importance, 5),
    quality: asNumber(row.llm_quality, 5),
    category: "",
    tags: parseTagsJson(row.tags),
    tokens: 0,
  };
}

function fetchedItem(
  row: UnmergeItemRow,
  sources: FetchedItemSource[]
): FetchedItem {
  return {
    url: row.url,
    title: row.title,
    summary: row.summary ?? undefined,
    publishedAt: row.published_at,
    points: asNumber(row.points),
    comments: asNumber(row.comments),
    sources,
    imageUrl: row.image_url ?? undefined,
    sourceLang: (row.source_lang as SourceLanguage | null) ?? undefined,
    mediaManifest: parseMediaManifest(
      row.media_manifest,
      row.image_url,
      row.url
    ),
  };
}

function change(
  column: string,
  before: unknown,
  after: unknown
): ColumnChange[] {
  return before === after ? [] : [{ column, before, after }];
}

function sameSources(
  a: readonly StoredSource[],
  b: readonly StoredSource[]
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The lead image a reader sees, derived as the feed and story queries do. */
export function displayLead(row: {
  media_manifest: string | null;
  image_url: string | null;
  url: string;
}): string | null {
  return primaryThumbnailUrl(
    parseMediaManifest(row.media_manifest, row.image_url, row.url),
    row.image_url,
    row.url
  );
}

/** A stored manifest's assets as written, without re-normalizing, so
 * dropping one asset never reorders or prunes the rest. */
function storedAssets(raw: string | null): MediaAsset[] {
  try {
    const value = JSON.parse(raw ?? "") as { assets?: unknown };
    if (Array.isArray(value?.assets)) return value.assets as MediaAsset[];
  } catch {
    // malformed: fall back to the parsed form
  }
  return parseMediaManifest(raw).assets;
}

/** Plans every canonical in `pairs`. Pairs are grouped by canonical; one
 * canonical's whole change lands in one batch. */
export function planUnmerge(
  pairs: readonly UnmergePair[],
  snapshot: UnmergeSnapshot,
  nowMs: number
): UnmergePlan {
  const byCanonical = new Map<ItemId, UnmergePair[]>();
  for (const pair of pairs) {
    const list = byCanonical.get(pair.canonicalId) ?? [];
    list.push(pair);
    byCanonical.set(pair.canonicalId, list);
  }
  const scales = [...byCanonical.keys()]
    .map((id) => storedScale(snapshot, id, nowMs))
    .filter((scale): scale is number => scale !== null)
    .sort((a, b) => a - b);
  const restoredScale =
    scales.length > 0 ? scales[Math.floor(scales.length / 2)] : 1;
  return {
    nowMs,
    restoredScale,
    canonicals: [...byCanonical].map(([canonicalId, list]) =>
      planCanonical(canonicalId, list, snapshot, nowMs, restoredScale)
    ),
  };
}

function membersOf(
  snapshot: UnmergeSnapshot,
  canonicalId: string
): UnmergeItemRow[] {
  return [...snapshot.items.values()]
    .filter(
      (row) => row.status === "merged" && row.duplicate_of === canonicalId
    )
    .sort((a, b) => a.fetched_at - b.fetched_at || a.id.localeCompare(b.id));
}

/**
 * Stored scores of old rows were frozen by earlier ranking formulas and
 * runs, so a fresh `rankScore` at the 72h point lands on another scale than
 * the row's day. This is the canonical's stored score over its current
 * cluster's fresh score; null without a usable stored score.
 */
function storedScale(
  snapshot: UnmergeSnapshot,
  canonicalId: string,
  nowMs: number
): number | null {
  const canonical = snapshot.items.get(canonicalId);
  if (!canonical?.rank_score || canonical.status !== "published") return null;
  const fresh = clusterScore(
    canonical,
    membersOf(snapshot, canonicalId),
    asNumber(canonical.points),
    asNumber(canonical.comments),
    nowMs
  );
  return fresh > 0 ? canonical.rank_score / fresh : null;
}

/** What one canonical's plan is built from. */
interface CanonicalContext {
  plan: CanonicalPlan;
  canonical: UnmergeItemRow;
  /** Every item merged into the canonical, oldest first. */
  members: readonly UnmergeItemRow[];
  removed: readonly UnmergeItemRow[];
  remaining: readonly UnmergeItemRow[];
  canonicalSources: readonly StoredSource[];
  /** Restorable merged ids per pair group. */
  groups: ReadonlyMap<string, ItemId[]>;
  nowMs: number;
  /** `storedScale` of this canonical: its new score keeps its own scale. */
  canonicalScale: number;
  /** Median `storedScale` over the plan's canonicals, for restored rows,
   * so one canonical's odd stored score does not lift its restored rows. */
  restoredScale: number;
  outcomes: Map<string, PairOutcome>;
}

type SkipReason = Extract<PairOutcome, { action: "skip" }>["reason"];

function planCanonical(
  canonicalId: ItemId,
  pairs: readonly UnmergePair[],
  snapshot: UnmergeSnapshot,
  nowMs: number,
  restoredScale: number
): CanonicalPlan {
  const plan: CanonicalPlan = {
    canonicalId,
    pairs: [],
    rows: [],
    sources: [],
    translations: [],
    attribution: [],
    leads: [],
    lossy: [],
  };
  const canonical = snapshot.items.get(canonicalId);
  const skipAll = (reason: SkipReason, detail: string) => {
    plan.pairs = pairs.map((pair) => ({
      pair,
      outcome: { action: "skip", reason, detail },
    }));
    return plan;
  };
  if (!canonical)
    return skipAll("missing-canonical", `no items row ${canonicalId}`);
  if (canonical.status !== "published") {
    return skipAll(
      "canonical-not-published",
      `canonical status is ${canonical.status}`
    );
  }

  const outcomes = new Map<string, PairOutcome>();
  const groups = restorableGroups(canonical, pairs, snapshot, nowMs, outcomes);
  const members = membersOf(snapshot, canonicalId);
  const groupOf = new Map<string, string>();
  for (const [group, ids] of groups)
    for (const id of ids) groupOf.set(id, group);

  if (groupOf.size > 0) {
    const canonicalSources = [...(snapshot.sources.get(canonicalId) ?? [])];
    plan.attribution = attributeSources(
      canonical,
      members,
      canonicalSources,
      groupOf
    );
    const ctx: CanonicalContext = {
      plan,
      canonical,
      members,
      removed: members.filter((m) => groupOf.has(m.id)),
      remaining: members.filter((m) => !groupOf.has(m.id)),
      canonicalSources,
      groups,
      nowMs,
      canonicalScale: storedScale(snapshot, canonicalId, nowMs) ?? 1,
      restoredScale,
      outcomes,
    };
    for (const ids of groups.values()) planRestoredGroup(ctx, ids);
    planShrunkCanonical(ctx);
  }

  plan.pairs = pairs.map((pair) => ({
    pair,
    outcome: outcomes.get(pair.mergedId) ?? {
      action: "noop",
      reason: "already-unmerged",
    },
  }));
  return plan;
}

/** Sorts each pair into skip / noop outcomes or a restorable group. A group
 * restores only when the canonical and all its members are outside the
 * quiet window. */
function restorableGroups(
  canonical: UnmergeItemRow,
  pairs: readonly UnmergePair[],
  snapshot: UnmergeSnapshot,
  nowMs: number,
  outcomes: Map<string, PairOutcome>
): Map<string, ItemId[]> {
  const groups = new Map<string, ItemId[]>();
  for (const pair of pairs) {
    const item = snapshot.items.get(pair.mergedId);
    if (!item) {
      outcomes.set(pair.mergedId, {
        action: "skip",
        reason: "missing-item",
        detail: `no items row ${pair.mergedId}`,
      });
    } else if (
      item.status === "merged" &&
      item.duplicate_of === canonical.id &&
      item.fetched_at < canonical.fetched_at
    ) {
      // Older than its canonical: an official takeover demoted it, which
      // also moved its notifications and votes. Not a merge to reverse here.
      outcomes.set(pair.mergedId, {
        action: "skip",
        reason: "demoted-canonical",
        detail: `fetched before its canonical (${item.fetched_at} < ${canonical.fetched_at})`,
      });
    } else if (item.status === "merged" && item.duplicate_of === canonical.id) {
      groups.set(pair.group, [...(groups.get(pair.group) ?? []), item.id]);
    } else if (
      item.status !== "merged" ||
      pairs.some(
        (o) => o.group === pair.group && o.mergedId === item.duplicate_of
      )
    ) {
      outcomes.set(pair.mergedId, {
        action: "noop",
        reason: "already-unmerged",
      });
    } else {
      outcomes.set(pair.mergedId, {
        action: "skip",
        reason: "merged-elsewhere",
        detail: `merged into ${item.duplicate_of}`,
      });
    }
  }
  const quietSince = Math.floor(nowMs / 1000) - UNMERGE_QUIET_SEC;
  for (const [group, ids] of groups) {
    const rows = [
      canonical,
      ...ids.map((id) => snapshot.items.get(id) as UnmergeItemRow),
    ];
    const latest = Math.max(...rows.map((row) => row.published_at));
    if (latest <= quietSince) continue;
    const eligible = new Date(
      (latest + UNMERGE_QUIET_SEC) * 1000
    ).toISOString();
    for (const id of ids) {
      outcomes.set(id, {
        action: "skip",
        reason: "inside-quiet-window",
        detail: `published inside the ${UNMERGE_QUIET_SEC / 86400}-day send window; eligible after ${eligible}`,
      });
    }
    groups.delete(group);
  }
  return groups;
}

/** `rankScore` of a row and its merged members at the 72h point. */
function clusterScore(
  row: UnmergeItemRow,
  members: readonly UnmergeItemRow[],
  points: number,
  comments: number,
  nowMs: number
): number {
  const cluster: RankMember[] = [
    { sourceId: row.source_id, points, comments, url: row.url },
    ...members.map((m) => ({
      sourceId: m.source_id,
      points: asNumber(m.points),
      comments: asNumber(m.comments),
      url: m.url,
    })),
  ];
  return rankScore({
    importance: asNumber(row.llm_importance, 5),
    quality: asNumber(row.llm_quality, 5),
    publishedAt: row.published_at * 1000,
    now: freezeNowMs(row.published_at, nowMs),
    ...rankSignals(cluster),
    voteNet: row.vote_net,
  });
}

/** Replays the group as the ingest run would have written it with no
 * canonical to join: the merge planner picks the lead among the group and
 * folds the rest in; `planNewItemWrite` writes the lead's row. */
function planRestoredGroup(
  ctx: CanonicalContext,
  ids: readonly ItemId[]
): void {
  const { plan, nowMs, outcomes } = ctx;
  const rows = ids.map(
    (id) => ctx.members.find((m) => m.id === id) as UnmergeItemRow
  );
  const newRows = rows.map((row) => ({
    id: row.id,
    source: { id: row.source_id, type: "", config: "{}", enabled: 1 },
    item: fetchedItem(row, ownFetchedSources(ctx, row)),
  }));
  const scored = new Map<string, ItemScore>();
  for (const row of rows) {
    const score = itemScore(row);
    if (score) scored.set(row.id, score);
  }
  const tags = new Map(
    rows.map((row) => [row.id as string, parseTagsJson(row.tags)])
  );
  const replayNow = Math.max(...rows.map((row) => row.fetched_at)) * 1000;
  const candidates = buildMergeCandidates(newRows, scored, tags, replayNow);
  const mergePlan =
    rows.length > 1
      ? buildMergePlan(
          [{ new: candidates.map((c) => c.i), existing: [] }],
          candidates,
          new Map(),
          MAX_SOURCES_PER_ITEM,
          MAX_MERGED_TOPICS
        )
      : null;
  const leadIndex = Math.max(
    0,
    rows.findIndex((row) => !mergePlan?.merged.has(row.id))
  );
  const lead = rows[leadIndex];

  const write = planNewItemWrite({
    sourceId: lead.source_id,
    item: newRows[leadIndex].item,
    score: scored.get(lead.id),
    translation: undefined,
    mergeEntry: undefined,
    canonicalUpdate: withoutTwinPictures(
      mergePlan?.canonicalUpdates.get(lead.id),
      newRows[leadIndex].item.mediaManifest
    ),
    canonicalTags: tags.get(lead.id),
    now: freezeNowMs(lead.published_at, nowMs),
    voteNet: lead.vote_net,
  });
  const manifest = buildMediaManifest(write.item.mediaManifest?.assets ?? [], {
    articleUrls: [lead.url],
  });
  const after = {
    media_manifest: serializeMediaManifest(manifest),
    image_url: primaryThumbnailUrl(manifest, write.item.imageUrl, lead.url),
    url: lead.url,
  };
  const status = write.status === "rejected" ? "rejected" : "published";
  plan.rows.push({
    id: lead.id,
    role: "lead",
    guard: rowState(lead),
    changes: [
      ...change("status", lead.status, status),
      ...change("duplicate_of", lead.duplicate_of, null),
      ...change("points", lead.points, write.item.points ?? 0),
      ...change("comments", lead.comments, write.item.comments ?? 0),
      ...change(
        "tags",
        lead.tags,
        JSON.stringify(write.score?.tags ?? parseTagsJson(lead.tags))
      ),
      ...change("image_url", lead.image_url, after.image_url),
      ...change("media_manifest", lead.media_manifest, after.media_manifest),
      ...change("rank_score", lead.rank_score, write.rank * ctx.restoredScale),
    ],
  });
  plan.leads.push({
    id: lead.id,
    role: "lead",
    before: null,
    after: displayLead(after),
  });
  const leadSources = (write.writeSources ? (write.item.sources ?? []) : [])
    .slice(0, MAX_SOURCES_PER_ITEM)
    .map(toStoredSource);
  if (leadSources.length > 0) {
    plan.sources.push({ itemId: lead.id, before: [], after: leadSources });
  }
  if (write.translation && lead.has_vi === 0) {
    plan.translations.push({
      itemId: lead.id,
      before: null,
      after: {
        title: write.translation.title,
        summary: write.translation.summary,
      },
    });
  }
  outcomes.set(lead.id, { action: "restore", leadId: lead.id, status });
  if (status === "rejected") {
    plan.lossy.push(
      `${lead.id.slice(0, 8)} restores as rejected: llm_relevance ${lead.llm_relevance} < ${RELEVANCE_THRESHOLD}`
    );
  }

  for (const row of rows) {
    if (row.notifications > 0) {
      plan.lossy.push(
        `${row.id.slice(0, 8)} already has ${row.notifications} notifications row(s)`
      );
    }
    if (row.id === lead.id) continue;
    plan.rows.push({
      id: row.id,
      role: "twin",
      guard: rowState(row),
      changes: change("duplicate_of", row.duplicate_of, lead.id),
    });
    outcomes.set(row.id, { action: "regroup", leadId: lead.id });
  }
}

/** A row with a picture of its own keeps it: twins' pictures are not merged
 * in, so a twin's better-tier image (an expiring `pbs.twimg.com/card_img`)
 * cannot replace the row's working card. This is stricter than ingest, whose
 * tier rule would take the twin's photo. Videos without a poster still join. */
function withoutTwinPictures(
  update: CanonicalUpdate | undefined,
  own: MediaManifest | null | undefined
): CanonicalUpdate | undefined {
  if (!update || !own?.assets.some(hasPicture)) return update;
  return {
    ...update,
    extraMedia: update.extraMedia?.filter((asset) => !hasPicture(asset)),
    extraImageUrls: [],
  };
}

/** The canonical rows attributed to `item`, minus the URL row the merge
 * appended for it: those are the sources its adapter fetched. */
function ownFetchedSources(
  ctx: CanonicalContext,
  item: UnmergeItemRow
): FetchedItemSource[] {
  return ctx.plan.attribution
    .filter((a) => a.owner === item.id)
    .map((a) => ctx.canonicalSources[a.position])
    .filter((row) => !isMemberEntry(row, item))
    .map(toFetchedSource);
}

/** The canonical keeps every source, asset, tag and point not attributable
 * to a removed item, and its score loses the removed corroboration. */
function planShrunkCanonical(ctx: CanonicalContext): void {
  const { plan, canonical, removed, remaining, canonicalSources, nowMs } = ctx;
  const removedIds = new Set<string>(removed.map((m) => m.id));
  const keptSources = plan.attribution
    .filter((a) => !removedIds.has(a.owner))
    .map((a) => canonicalSources[a.position]);
  if (!sameSources(keptSources, canonicalSources)) {
    plan.sources.push({
      itemId: canonical.id,
      before: [...canonicalSources],
      after: keptSources,
    });
  }
  const ambiguous = plan.attribution.filter((a) => a.ambiguous).length;
  if (ambiguous > 0) {
    plan.lossy.push(
      `${ambiguous} source row(s) kept on the canonical; a removed item may own them`
    );
  }
  const unsourced = removed.filter(
    (m) => !plan.attribution.some((a) => a.owner === m.id)
  );
  if (unsourced.length > 0) {
    plan.lossy.push(
      `${unsourced.map((m) => m.id.slice(0, 8)).join(", ")}: no source row left on the canonical (8-row cap)`
    );
  }

  // Media: drop assets only removed items carried. Only the columns that
  // held such an asset change; an own lead image stays.
  const remainingKeys = new Set(remaining.flatMap((m) => [...assetKeys(m)]));
  const foreign = new Set(
    removed
      .flatMap((m) => [...assetKeys(m)])
      .filter((key) => !remainingKeys.has(key))
  );
  const isForeign = (asset: MediaAsset) => foreign.has(assetKey(asset) ?? "");
  const stored = storedAssets(canonical.media_manifest);
  let kept = stored.filter((asset) => !isForeign(asset));
  const dropsAsset = kept.length < stored.length;
  // A merge keeps only the best picture tier, so a removed item's photo can
  // have pruned the canonical's own share card. That card is gone; the
  // remaining members' media is what the correct merges alone would show.
  if (dropsAsset && !kept.some(hasPicture)) {
    const refill = buildMediaManifest(
      [...kept, ...remaining.flatMap((m) => mediaOf(m))],
      { articleUrls: [canonical.url] }
    ).assets;
    if (refill.some(hasPicture)) {
      kept = refill;
      plan.lossy.push(
        "the merge pruned the canonical's own image; its remaining members' media stands in"
      );
    }
  }
  const after = {
    media_manifest: dropsAsset
      ? JSON.stringify({ version: MEDIA_MANIFEST_VERSION, assets: kept })
      : canonical.media_manifest,
    image_url:
      canonical.image_url !== null &&
      isForeign({ type: "image", url: canonical.image_url })
        ? primaryThumbnailUrl(
            buildMediaManifest(kept, { articleUrls: [canonical.url] }),
            null,
            canonical.url
          )
        : canonical.image_url,
    url: canonical.url,
  };
  plan.leads.unshift({
    id: canonical.id,
    role: "canonical",
    before: displayLead(canonical),
    after: displayLead(after),
  });

  // Tags: `unionTopics` appends merged tags after the canonical's own, so a
  // tag before the last tag no member has is the canonical's own. Later
  // tags only removed items carry are dropped.
  const memberTags = new Set(ctx.members.flatMap((m) => parseTagsJson(m.tags)));
  const remainingTags = new Set(
    remaining.flatMap((m) => parseTagsJson(m.tags))
  );
  const removedTags = new Set(removed.flatMap((m) => parseTagsJson(m.tags)));
  const currentTags = parseTagsJson(canonical.tags);
  const lastOwn = currentTags.reduce(
    (last, t, i) => (memberTags.has(t) ? last : i),
    -1
  );
  const dropped = currentTags.filter(
    (t, i) => i > lastOwn && removedTags.has(t) && !remainingTags.has(t)
  );
  const tags = currentTags.filter((t) => !dropped.includes(t));
  if (dropped.length > 0) {
    plan.lossy.push(
      `canonical tags drop ${dropped.join(", ")} (after its last own tag; one it also had on its own would drop too)`
    );
  }

  // Points: the merge kept the max; only a removed reader-engagement item
  // can have set it.
  const engagedMax = (
    rows: readonly UnmergeItemRow[],
    field: "points" | "comments"
  ) =>
    Math.max(
      0,
      ...rows
        .filter((m) => hasReaderEngagement(m.source_id))
        .map((m) => asNumber(m[field]))
    );
  const settle = (field: "points" | "comments") => {
    const value = asNumber(canonical[field]);
    const setByRemoved =
      engagedMax(removed, field) === value &&
      value > engagedMax(remaining, field);
    if (!setByRemoved || value === 0) return value;
    const next = engagedMax(remaining, field);
    plan.lossy.push(
      `canonical ${field} ${value} came from a removed item; set to ${next} (its own count is unknown)`
    );
    return next;
  };
  const points = settle("points");
  const comments = settle("comments");
  const rank =
    clusterScore(canonical, remaining, points, comments, nowMs) *
    ctx.canonicalScale;

  plan.rows.unshift({
    id: canonical.id,
    role: "canonical",
    guard: rowState(canonical),
    changes: [
      ...change("points", canonical.points, points),
      ...change("comments", canonical.comments, comments),
      ...change("tags", canonical.tags, JSON.stringify(tags)),
      ...change("image_url", canonical.image_url, after.image_url),
      ...change(
        "media_manifest",
        canonical.media_manifest,
        after.media_manifest
      ),
      ...change("rank_score", canonical.rank_score, rank),
    ],
  });
}
