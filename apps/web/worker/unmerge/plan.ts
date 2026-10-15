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
import {
  buildMergePlan,
  type CanonicalUpdate,
  type MergePlan,
  unionSources,
} from "../dedupe.js";
import {
  RANK_RECOMPUTE_WINDOW_SEC,
  RELEVANCE_THRESHOLD,
} from "../ingest/context.js";
import { buildMergeCandidates, toExistingCandidates } from "../ingest/merge.js";
import type { ItemScore } from "../ingest/score.js";
import {
  parseTagsJson,
  planExistingCanonicalMedia,
  planNewItemWrite,
} from "../ingest/write-plan.js";
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
import {
  isLikelySameEvent,
  type StoryRef,
  sameStoryRule,
  type TwinRule,
  twinMatches,
} from "./twins.js";

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
 * merged id, so a lone pair comes back on its own.
 *
 * `decision` settles a group the plan holds as `needs-decision`: `sameAs`
 * re-points it to that published row, `distinct` publishes it on its own.
 * The pairs file spells them `"sameAs": "<id>"` and `"distinct": true`. */
export interface UnmergePair {
  canonicalId: ItemId;
  mergedId: ItemId;
  group: string;
  decision?: TwinDecision;
}

export type TwinDecision =
  | { kind: "same-as"; twinId: ItemId }
  | { kind: "distinct" };

function parseDecision(
  record: Record<string, unknown>
): TwinDecision | undefined | { error: string } {
  if (record.sameAs !== undefined && record.distinct !== undefined) {
    return { error: "sameAs and distinct are exclusive" };
  }
  if (record.sameAs !== undefined) {
    const twinId = parseItemId(record.sameAs);
    return twinId
      ? { kind: "same-as", twinId }
      : { error: "sameAs must be a 64-char hex item id" };
  }
  if (record.distinct !== undefined) {
    return record.distinct === true
      ? { kind: "distinct" }
      : { error: "distinct must be true" };
  }
  return undefined;
}

/** The request shape `parseUnmergePairs` reads, the inverse of
 * `parseDecision`. Post this, not an `UnmergePair`: the endpoint re-parses
 * and reads only `sameAs`/`distinct`, so a parsed `decision` is dropped. */
export function toWirePair(pair: UnmergePair): Record<string, unknown> {
  const { decision, ...rest } = pair;
  if (!decision) return rest;
  return decision.kind === "same-as"
    ? { ...rest, sameAs: decision.twinId }
    : { ...rest, distinct: true };
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
    const decision = parseDecision(record);
    if (decision && "error" in decision) {
      return { error: `pairs[${index}]: ${decision.error}` };
    }
    pairs.push({
      canonicalId,
      mergedId,
      group,
      ...(decision ? { decision } : {}),
    });
  }
  for (const pair of pairs) {
    if (seen.has(pair.canonicalId)) {
      return {
        error: `canonical ${pair.canonicalId} is also listed as a merged item`,
      };
    }
    const disagree = pairs.find(
      (other) =>
        other.group === pair.group &&
        other.decision !== undefined &&
        pair.decision !== undefined &&
        JSON.stringify(other.decision) !== JSON.stringify(pair.decision)
    );
    if (disagree) {
      return { error: `group ${pair.group} has two decisions` };
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
  /** `item_sources` in position order, for canonicals, paired ids and the
   * published rows a restored story matches. */
  sources: ReadonlyMap<string, readonly StoredSource[]>;
  /** Published rows within `MERGE_LOOKBACK_SEC` of a paired row: where a
   * restored story's live twin would be (`twinMatches`). Each one that
   * matches has its full row, its merged items and its sources above. */
  published: readonly StoryRef[];
}

/** The rows `planDanglingUnmerge` reads (#791). `sources` also holds the
 * source union the merge wrote under each dangling id. */
export interface DanglingSnapshot extends UnmergeSnapshot {
  /** Merged rows whose `duplicate_of` names no item, oldest fetch first. */
  dangling: readonly ItemId[];
  /** Published rows of the dangling rows' days, in `items` with their
   * merged members: their stored scores set the restored rows' scale. */
  calibration: readonly ItemId[];
}

/** A merged row whose `duplicate_of` names no item. `group` is the id of
 * the first row of its story, which also keys its batch. */
export interface DanglingPair {
  danglingOf: string;
  mergedId: ItemId;
  group: ItemId;
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
  /** The story is already live as `twinId`: the row stays merged, now into
   * it, as ingest would have merged it had the wrong canonical not existed. */
  | { action: "repoint"; twinId: ItemId; rule: TwinRule | "same-as" }
  | { action: "noop"; reason: "already-unmerged" }
  | {
      action: "skip";
      reason:
        | "missing-item"
        | "missing-canonical"
        | "canonical-not-published"
        | "merged-elsewhere"
        | "inside-quiet-window"
        | "demoted-canonical"
        /** A published row is likely the same event under another URL; set
         * `sameAs` or `distinct` on the pair. */
        | "needs-decision"
        /** The live twin is the wrong canonical itself: not a wrong merge. */
        | "twin-is-canonical"
        /** The live twin is written by another batch of this request (a
         * canonical, or another group's twin); a rerun picks it up. */
        | "twin-busy"
        /** Another group of this request restores the same story; a rerun
         * after that apply re-points this one to it. */
        | "twin-restores-first";
      detail: string;
      /** For `needs-decision`: the rows a `sameAs` can name, in full. */
      candidates?: StoryRef[];
    };

/** Pair actions that write. */
export const MOVED_ACTIONS: ReadonlySet<PairOutcome["action"]> = new Set([
  "restore",
  "regroup",
  "repoint",
]);

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
  /** `twin`: merged into a restored lead. `repointed`: merged into a live
   * twin. `live-twin`: the published row that absorbs a re-pointed story. */
  role: "canonical" | "lead" | "twin" | "repointed" | "live-twin";
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
  /** Null for a row kept under an id no item has (`attributeSources`). */
  owner: ItemId | null;
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
  pairs: { pair: UnmergePair | DanglingPair; outcome: PairOutcome }[];
  attribution: AttributedSource[];
  /** The lead image a reader sees (`displayLead`) on the canonical, each
   * restored row and each live twin, before and after. */
  leads: {
    id: ItemId;
    role: "canonical" | "lead" | "live-twin";
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
 *
 * A null canonical is an id no item has (#791): the merge still wrote its
 * source union under that id. It has no rows of its own, so a leading run
 * belongs to the member whose URL row ends it, and a row nobody owns is
 * kept with a null owner.
 */
export function attributeSources(
  canonical: UnmergeItemRow | null,
  members: readonly UnmergeItemRow[],
  rows: readonly StoredSource[],
  groupOf: ReadonlyMap<string, string>
): AttributedSource[] {
  const items = canonical ? [canonical, ...members] : [...members];
  const byUrl = new Map(items.map((item) => [urlKey(item.url), item]));
  const memberById = new Map(members.map((m) => [m.id as string, m]));
  const removed = (id: string | null | undefined) =>
    typeof id === "string" && groupOf.has(id);

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
  const first = canonical
    ? (boundaries.find((index) => index >= officialPrefix) ?? rows.length)
    : officialPrefix;
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
      owner: ItemId | null,
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
        canonical?.id ?? null,
        "kept-on-canonical",
        next === undefined ? removedCapped : removed(memberEntryAt(next)?.id)
      );
    }
    if (position > last) {
      return trailingOwner
        ? assign(trailingOwner.id, "trailing-capped")
        : assign(canonical?.id ?? null, "kept-on-canonical", removedCapped);
    }
    const entry = memberEntryAt(next);
    if (entry) return assign(entry.id, "run-before-member");
    const previous = boundaries.filter((index) => index < position).at(-1);
    return assign(
      canonical?.id ?? null,
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
  const restoredScale = medianScale(snapshot, [...byCanonical.keys()], nowMs);
  const state: PlanState = {
    snapshot,
    nowMs,
    restoredScale,
    canonicalIds: new Set(byCanonical.keys()),
    claimedTwins: new Set(),
    restored: [],
  };
  return {
    nowMs,
    restoredScale,
    canonicals: [...byCanonical].map(([canonicalId, list]) =>
      planCanonical(canonicalId, list, state)
    ),
  };
}

/** Median `storedScale` over `ids`; 1 when none has a usable score. */
function medianScale(
  snapshot: UnmergeSnapshot,
  ids: readonly ItemId[],
  nowMs: number
): number {
  const scales = ids
    .map((id) => storedScale(snapshot, id, nowMs))
    .filter((scale): scale is number => scale !== null)
    .sort((a, b) => a - b);
  return scales.length > 0 ? scales[Math.floor(scales.length / 2)] : 1;
}

/**
 * Plans the merged rows whose `duplicate_of` names no item (#791): before
 * 049e36df the cluster call could make up a canonical id (`abc123`, `22`)
 * and the merge wrote it. With no canonical to shrink, each story restores
 * as a `planUnmerge` group does, with the same live-twin check, quiet
 * window and score scale (here the median over published rows of the same
 * days), in a batch of its own keyed by its first row. Its sources are the
 * rows the merge wrote under the made-up id that `attributeSources` gives
 * to its rows.
 */
export function planDanglingUnmerge(
  snapshot: DanglingSnapshot,
  nowMs: number
): UnmergePlan {
  const rows = snapshot.dangling
    .map((id) => snapshot.items.get(id))
    .filter((row): row is UnmergeItemRow => row !== undefined)
    .sort((a, b) => a.fetched_at - b.fetched_at || a.id.localeCompare(b.id));
  const stories = danglingStories(rows);
  const restoredScale = medianScale(snapshot, snapshot.calibration, nowMs);
  const state: PlanState = {
    snapshot,
    nowMs,
    restoredScale,
    canonicalIds: new Set(),
    claimedTwins: new Set(),
    restored: [],
  };
  const groupOf = new Map<string, string>();
  for (const story of stories) {
    for (const row of story) groupOf.set(row.id, story[0].id);
  }
  const attribution = new Map<string, AttributedSource[]>();
  const attributionOf = (danglingOf: string) => {
    let list = attribution.get(danglingOf);
    if (!list) {
      list = attributeSources(
        null,
        rows.filter((row) => row.duplicate_of === danglingOf),
        snapshot.sources.get(danglingOf) ?? [],
        groupOf
      );
      attribution.set(danglingOf, list);
    }
    return list;
  };
  const danglingOf = (row: UnmergeItemRow) => row.duplicate_of as string;
  const owned = (row: UnmergeItemRow) =>
    attributionOf(danglingOf(row)).filter((a) => a.owner === row.id);
  const quietSince = Math.floor(nowMs / 1000) - UNMERGE_QUIET_SEC;

  const canonicals = stories.map((story): CanonicalPlan => {
    const key = story[0].id;
    const plan: CanonicalPlan = {
      canonicalId: key,
      pairs: [],
      rows: [],
      sources: [],
      translations: [],
      attribution: story.flatMap(owned),
      leads: [],
      lossy: [],
    };
    const outcomes = new Map<string, PairOutcome>();
    const ids = story.map((row) => row.id);
    const latest = Math.max(...story.map((row) => row.published_at));
    const route: GroupRoute =
      latest > quietSince
        ? {
            kind: "skip",
            reason: "inside-quiet-window",
            detail: `published inside the ${UNMERGE_QUIET_SEC / 86400}-day send window; eligible after ${new Date((latest + UNMERGE_QUIET_SEC) * 1000).toISOString()}`,
          }
        : routeGroup(state, null, story, undefined);
    if (route.kind === "skip") {
      for (const id of ids) {
        outcomes.set(id, {
          action: "skip",
          reason: route.reason,
          detail: route.detail,
          ...(route.candidates ? { candidates: route.candidates } : {}),
        });
      }
    } else {
      const ctx: GroupContext = {
        plan,
        members: story,
        sourcesOf: (row) =>
          attributedSources(
            attributionOf(danglingOf(row)),
            snapshot.sources.get(danglingOf(row)) ?? [],
            row
          ),
        nowMs,
        restoredScale,
        outcomes,
        snapshot,
      };
      if (route.kind === "repoint") {
        planRepointGroup(ctx, ids, route.twin, route.rule);
      } else {
        planRestoredGroup(ctx, ids);
      }
      const unsourced = story.filter((row) => owned(row).length === 0);
      if (unsourced.length > 0) {
        plan.lossy.push(
          `${unsourced.map((row) => short(row.id)).join(", ")}: no source row left under ${danglingOf(unsourced[0])} (8-row cap)`
        );
      }
    }
    plan.pairs = story.map((row) => ({
      pair: { danglingOf: danglingOf(row), mergedId: row.id, group: key },
      outcome: outcomes.get(row.id) as PairOutcome,
    }));
    return plan;
  });
  return { nowMs, restoredScale, canonicals };
}

/**
 * Splits dangling rows into stories, oldest first. Rows are one story when
 * `sameStoryRule` says so. Among rows one cluster call gave the same
 * made-up id, a near-duplicate title (`isLikelySameEvent`, the title
 * pass's rule) also joins two such stories: the call put them together and
 * ingest's title pass merges those titles. It joins each story once, so
 * similarity never chains unrelated headlines in a 28-row cluster.
 */
function danglingStories(rows: readonly UnmergeItemRow[]): UnmergeItemRow[][] {
  const parent = new Map<string, string>(rows.map((row) => [row.id, row.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  const refs = rows.map(storyRef);
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      if (sameStoryRule(refs[i], refs[j]) !== null) {
        parent.set(find(refs[j].id), find(refs[i].id));
      }
    }
  }
  const buckets = new Map<string, StoryRef[]>();
  rows.forEach((row, i) => {
    const key = `${row.duplicate_of}@${row.fetched_at}`;
    buckets.set(key, [...(buckets.get(key) ?? []), refs[i]]);
  });
  const joined = new Set<string>();
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = find(bucket[i].id);
        const b = find(bucket[j].id);
        if (a === b || joined.has(a) || joined.has(b)) continue;
        if (!isLikelySameEvent(bucket[i], bucket[j])) continue;
        parent.set(b, a);
        joined.add(a);
      }
    }
  }
  const stories = new Map<string, UnmergeItemRow[]>();
  for (const row of rows) {
    const root = find(row.id);
    stories.set(root, [...(stories.get(root) ?? []), row]);
  }
  return [...stories.values()];
}

/** What the plan's canonicals share, so one request never writes a live twin
 * from two batches or restores one story twice. */
interface PlanState {
  snapshot: UnmergeSnapshot;
  nowMs: number;
  restoredScale: number;
  canonicalIds: ReadonlySet<string>;
  /** Live twins an earlier group of this request re-points into. */
  claimedTwins: Set<string>;
  /** Rows of the groups this request publishes so far. */
  restored: StoryRef[];
}

const storyRef = (row: UnmergeItemRow): StoryRef => ({
  id: row.id,
  source_id: row.source_id,
  url: row.url,
  title: row.title,
  published_at: row.published_at,
});

const short = (id: string) => id.slice(0, 8);

const uniqueRefs = (matches: readonly { ref: StoryRef }[]): StoryRef[] => [
  ...new Map(matches.map((m) => [m.ref.id, m.ref])).values(),
];

type GroupRoute =
  | { kind: "restore" }
  | { kind: "repoint"; twin: UnmergeItemRow; rule: TwinRule | "same-as" }
  | {
      kind: "skip";
      reason: SkipReason;
      detail: string;
      candidates?: StoryRef[];
    };

/** Whether a group publishes, joins its live twin, or waits: identity with a
 * published row re-points it, likely the same event holds it for a human,
 * and the same story restored by an earlier group defers it to a rerun. */
function routeGroup(
  state: PlanState,
  canonicalId: ItemId | null,
  rows: readonly UnmergeItemRow[],
  decision: TwinDecision | undefined
): GroupRoute {
  const refs = rows.map(storyRef);
  if (decision?.kind === "same-as") {
    return repointRoute(state, canonicalId, rows, decision.twinId, "same-as");
  }
  if (decision?.kind !== "distinct") {
    const matches = twinMatches(refs, state.snapshot.published);
    const same = matches.filter((m) => m.rule !== null);
    const sameIds = [...new Set(same.map((m) => m.ref.id))];
    if (sameIds.length > 1) {
      return {
        kind: "skip",
        reason: "needs-decision",
        detail: `the same story as several live rows (${sameIds.map(short).join(", ")}); set sameAs`,
        candidates: uniqueRefs(same),
      };
    }
    if (same.length > 0) {
      return repointRoute(
        state,
        canonicalId,
        rows,
        same[0].ref.id as ItemId,
        same[0].rule as TwinRule
      );
    }
    const restoredSame = twinMatches(refs, state.restored).find(
      (m) => m.rule !== null
    );
    if (restoredSame) {
      return {
        kind: "skip",
        reason: "twin-restores-first",
        detail: `the same story (${restoredSame.rule}) as ${short(restoredSame.ref.id)}, which this request restores; rerun after the apply to re-point it`,
      };
    }
    // A row under the relevance bar restores as rejected and is never shown.
    const publishes = rows.some(
      (row) => asNumber(row.llm_relevance, 0.5) >= RELEVANCE_THRESHOLD
    );
    const likely = [
      ...matches.filter((m) => m.ref.id !== canonicalId),
      ...twinMatches(refs, state.restored),
    ];
    if (publishes && likely.length > 0) {
      return {
        kind: "skip",
        reason: "needs-decision",
        detail: `likely the same event as ${likely
          .map(
            (m) => `${short(m.ref.id)} [${m.ref.source_id}] "${m.ref.title}"`
          )
          .join("; ")}; set sameAs or distinct on the pair`,
        candidates: uniqueRefs(likely),
      };
    }
  }
  state.restored.push(...refs);
  return { kind: "restore" };
}

function repointRoute(
  state: PlanState,
  canonicalId: ItemId | null,
  rows: readonly UnmergeItemRow[],
  twinId: ItemId,
  rule: TwinRule | "same-as"
): GroupRoute {
  const skip = (reason: SkipReason, detail: string): GroupRoute => ({
    kind: "skip",
    reason,
    detail,
  });
  if (twinId === canonicalId) {
    return skip(
      "twin-is-canonical",
      `the same story (${rule}) as its canonical: the merge was right; drop the pair`
    );
  }
  const twin = state.snapshot.items.get(twinId);
  if (!twin) return skip("missing-item", `no items row for twin ${twinId}`);
  if (twin.status !== "published") {
    return skip(
      "needs-decision",
      `twin ${short(twinId)} is ${twin.status}, not published`
    );
  }
  if (state.canonicalIds.has(twinId) || state.claimedTwins.has(twinId)) {
    return skip(
      "twin-busy",
      `twin ${short(twinId)} is written by another batch of this request; rerun after the apply`
    );
  }
  const quietSince = Math.floor(state.nowMs / 1000) - UNMERGE_QUIET_SEC;
  if (twin.published_at > quietSince) {
    return skip(
      "inside-quiet-window",
      `twin ${short(twinId)} is inside the send window; eligible after ${new Date((twin.published_at + UNMERGE_QUIET_SEC) * 1000).toISOString()}`
    );
  }
  if (ingestMergeInto(twin, rows, () => []).demoted.size > 0) {
    return skip(
      "needs-decision",
      `an official row would take over live twin ${short(twinId)}`
    );
  }
  state.claimedTwins.add(twinId);
  return { kind: "repoint", twin, rule };
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

/** What restoring or re-pointing one group is built from. */
interface GroupContext {
  plan: CanonicalPlan;
  /** Every item merged into the canonical, oldest first. */
  members: readonly UnmergeItemRow[];
  /** The sources the item's adapter fetched, as far as the stored rows
   * attribute them to it. */
  sourcesOf: (item: UnmergeItemRow) => FetchedItemSource[];
  nowMs: number;
  /** Median `storedScale` over the plan's canonicals, for restored rows,
   * so one canonical's odd stored score does not lift its restored rows. */
  restoredScale: number;
  outcomes: Map<string, PairOutcome>;
  snapshot: UnmergeSnapshot;
}

/** What one canonical's plan is built from. */
interface CanonicalContext extends GroupContext {
  canonical: UnmergeItemRow;
  removed: readonly UnmergeItemRow[];
  remaining: readonly UnmergeItemRow[];
  canonicalSources: readonly StoredSource[];
  /** Restorable merged ids per pair group. */
  groups: ReadonlyMap<string, ItemId[]>;
  /** `storedScale` of this canonical: its new score keeps its own scale. */
  canonicalScale: number;
}

type SkipReason = Extract<PairOutcome, { action: "skip" }>["reason"];

function planCanonical(
  canonicalId: ItemId,
  pairs: readonly UnmergePair[],
  state: PlanState
): CanonicalPlan {
  const { snapshot, nowMs, restoredScale } = state;
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
  const routes = new Map<string, GroupRoute>();
  for (const [group, ids] of groups) {
    const route = routeGroup(
      state,
      canonical.id,
      ids.map((id) => snapshot.items.get(id) as UnmergeItemRow),
      pairs.find((p) => p.group === group && p.decision)?.decision
    );
    if (route.kind === "skip") {
      for (const id of ids) {
        outcomes.set(id, {
          action: "skip",
          reason: route.reason,
          detail: route.detail,
          ...(route.candidates ? { candidates: route.candidates } : {}),
        });
      }
      groups.delete(group);
    } else {
      routes.set(group, route);
    }
  }
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
      sourcesOf: (row) =>
        attributedSources(plan.attribution, canonicalSources, row),
      groups,
      nowMs,
      canonicalScale: storedScale(snapshot, canonicalId, nowMs) ?? 1,
      restoredScale,
      outcomes,
      snapshot,
    };
    for (const [group, ids] of groups) {
      const route = routes.get(group);
      if (route?.kind === "repoint") {
        planRepointGroup(ctx, ids, route.twin, route.rule);
      } else {
        planRestoredGroup(ctx, ids);
      }
    }
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
      ) ||
      mergedIntoLiveTwin(item, pairs, pair.group, snapshot)
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

/** An earlier apply re-pointed `item` to its live twin. */
function mergedIntoLiveTwin(
  item: UnmergeItemRow,
  pairs: readonly UnmergePair[],
  group: string,
  snapshot: UnmergeSnapshot
): boolean {
  const decision = pairs.find((p) => p.group === group && p.decision)?.decision;
  if (decision?.kind === "same-as")
    return item.duplicate_of === decision.twinId;
  const twin = snapshot.published.find((ref) => ref.id === item.duplicate_of);
  return twin !== undefined && sameStoryRule(storyRef(item), twin) !== null;
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

/** The group's rows as merge candidates, as the ingest run that fetched them
 * saw them. */
function replayRows(
  rows: readonly UnmergeItemRow[],
  sourcesOf: (row: UnmergeItemRow) => FetchedItemSource[]
) {
  const newRows = rows.map((row) => ({
    id: row.id,
    source: { id: row.source_id, type: "", config: "{}", enabled: 1 },
    item: fetchedItem(row, sourcesOf(row)),
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
  return {
    newRows,
    scored,
    tags,
    candidates: buildMergeCandidates(newRows, scored, tags, replayNow),
  };
}

/** Ingest's merge plan for the group clustered with its live twin. */
function ingestMergeInto(
  twin: UnmergeItemRow,
  rows: readonly UnmergeItemRow[],
  sourcesOf: (row: UnmergeItemRow) => FetchedItemSource[]
): MergePlan {
  const { candidates } = replayRows(rows, sourcesOf);
  return buildMergePlan(
    [{ new: candidates.map((c) => c.i), existing: [twin.id] }],
    candidates,
    toExistingCandidates([
      {
        ...twin,
        points: asNumber(twin.points),
        comments: asNumber(twin.comments),
      },
    ]),
    MAX_SOURCES_PER_ITEM,
    MAX_MERGED_TOPICS
  );
}

/** A planned number that equals the stored one keeps the stored value, so
 * NULL does not become 0. */
const settled = (before: number | null, value: number) =>
  asNumber(before) === value ? before : value;

/** Merges the group into its live twin as ingest's merge into a published
 * canonical (`existingCanonicalStatements`) would have: the twin takes the
 * group's sources, topics, reader engagement and corroboration, and the
 * rows stay merged, now into it. Like a restored lead, a twin with a
 * picture of its own keeps it. */
function planRepointGroup(
  ctx: GroupContext,
  ids: readonly ItemId[],
  twin: UnmergeItemRow,
  rule: TwinRule | "same-as"
): void {
  const { plan, nowMs, outcomes, snapshot } = ctx;
  const rows = ids.map(
    (id) => ctx.members.find((m) => m.id === id) as UnmergeItemRow
  );
  const update = withoutTwinPictures(
    ingestMergeInto(twin, rows, ctx.sourcesOf).canonicalUpdates.get(twin.id),
    parseMediaManifest(twin.media_manifest, twin.image_url, twin.url)
  );
  if (update) {
    const media = planExistingCanonicalMedia(twin, update);
    const after =
      update.extraMedia?.length || update.extraImageUrls?.length
        ? {
            media_manifest: serializeMediaManifest(media.manifest),
            image_url: media.imageUrl,
            url: twin.url,
          }
        : twin;
    const tags =
      JSON.stringify(media.topics) === JSON.stringify(parseTagsJson(twin.tags))
        ? twin.tags
        : JSON.stringify(media.topics);
    const twinSources = [...(snapshot.sources.get(twin.id) ?? [])];
    const sourcesAfter = unionSources(
      twinSources.map(toFetchedSource),
      update.extraSources,
      MAX_SOURCES_PER_ITEM,
      twin.url
    ).map(toStoredSource);
    if (!sameSources(sourcesAfter, twinSources)) {
      plan.sources.push({
        itemId: twin.id,
        before: twinSources,
        after: sourcesAfter,
      });
    }
    const rank =
      clusterScore(
        twin,
        [...membersOf(snapshot, twin.id), ...rows],
        update.maxPoints,
        update.maxComments,
        nowMs
      ) * (storedScale(snapshot, twin.id, nowMs) ?? ctx.restoredScale);
    plan.rows.push({
      id: twin.id,
      role: "live-twin",
      guard: rowState(twin),
      changes: [
        ...change(
          "points",
          twin.points,
          settled(twin.points, update.maxPoints)
        ),
        ...change(
          "comments",
          twin.comments,
          settled(twin.comments, update.maxComments)
        ),
        ...change("tags", twin.tags, tags),
        ...change("image_url", twin.image_url, after.image_url),
        ...change("media_manifest", twin.media_manifest, after.media_manifest),
        ...change("rank_score", twin.rank_score, rank),
      ],
    });
    plan.leads.push({
      id: twin.id,
      role: "live-twin",
      before: displayLead(twin),
      after: displayLead(after),
    });
  }
  for (const row of rows) {
    if (row.notifications > 0) {
      plan.lossy.push(
        `${short(row.id)} already has ${row.notifications} notifications row(s)`
      );
    }
    plan.rows.push({
      id: row.id,
      role: "repointed",
      guard: rowState(row),
      changes: change("duplicate_of", row.duplicate_of, twin.id),
    });
    outcomes.set(row.id, { action: "repoint", twinId: twin.id, rule });
  }
}

/** Replays the group as the ingest run would have written it with no
 * canonical to join: the merge planner picks the lead among the group and
 * folds the rest in; `planNewItemWrite` writes the lead's row. */
function planRestoredGroup(ctx: GroupContext, ids: readonly ItemId[]): void {
  const { plan, nowMs, outcomes } = ctx;
  const rows = ids.map(
    (id) => ctx.members.find((m) => m.id === id) as UnmergeItemRow
  );
  const { newRows, scored, tags, candidates } = replayRows(rows, ctx.sourcesOf);
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
  // A merged row has no `item_sources` rows of its own (the merge wrote its
  // sources onto the canonical); whatever it holds is still the before.
  const leadBefore = [...(ctx.snapshot.sources.get(lead.id) ?? [])];
  if (leadSources.length > 0 && !sameSources(leadBefore, leadSources)) {
    plan.sources.push({
      itemId: lead.id,
      before: leadBefore,
      after: leadSources,
    });
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

/** The stored rows attributed to `item`, minus the URL row the merge
 * appended for it: those are the sources its adapter fetched. */
function attributedSources(
  attribution: readonly AttributedSource[],
  rows: readonly StoredSource[],
  item: UnmergeItemRow
): FetchedItemSource[] {
  return attribution
    .filter((a) => a.owner === item.id)
    .map((a) => rows[a.position])
    .filter((row) => !isMemberEntry(row, item))
    .map(toFetchedSource);
}

/** The canonical keeps every source, asset, tag and point not attributable
 * to a removed item, and its score loses the removed corroboration. */
function planShrunkCanonical(ctx: CanonicalContext): void {
  const { plan, canonical, removed, remaining, canonicalSources, nowMs } = ctx;
  const removedIds = new Set<string | null>(removed.map((m) => m.id));
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
