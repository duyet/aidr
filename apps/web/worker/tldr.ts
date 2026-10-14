import { dayBoundsSec } from "../src/lib/day-archive.js";
import { stripTitleMarker } from "../src/lib/plain-text.js";
import { generateTldr, type TldrBullet } from "./llm.js";
import { pickDiverse } from "./source-diversity.js";
import { getLocalHourAndDate } from "./subscribe/send.js";
import { AUDIENCE_TIMEZONE, toEpochSeconds } from "./time.js";
import {
  isEnglishOnlyViTldr,
  itemsHaveTitleVi,
  needsViTitleFallback,
} from "./tldr-lang.js";
import { stripSourceBoilerplate } from "./translation-terms.js";
import type { Env } from "./types.js";

/** Re-run the daily snapshot this often so the homepage TL;DR tracks
 * stories that land after the first successful generate of the day. */
export const TLDR_REFRESH_MS = 3 * 60 * 60 * 1000;

/** Stories per TL;DR edition. */
export const TLDR_MAX_ITEMS = 16;
/** The whole 24h window is the candidate pool (~120 rows on a normal day):
 * mirrored aggregators can fill the top 50 alone, so a small over-fetch
 * would leave the source-family cap nothing else to pick. Bounded for
 * spike days. */
const TLDR_CANDIDATE_LIMIT = 300;

export interface ItemRow {
  id: string;
  source_id: string;
  title: string;
  summary: string | null;
  title_vi: string | null;
}

const TOP_ITEMS_SQL = `SELECT i.id, i.source_id, i.title, i.summary, tr.title AS title_vi
     FROM items i
     LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'
     WHERE i.status = 'published' AND i.published_at >= ? AND i.published_at < ?
     ORDER BY i.rank_score DESC
     LIMIT ${TLDR_CANDIDATE_LIMIT}`;

/**
 * Pure query builder for the top-items candidate pool, so the gating logic
 * (published, fresh, ranked) can be verified without a D1
 * binding. `nowMs` is epoch milliseconds; `items.published_at` is stored
 * as epoch seconds, so the bounds are normalized to seconds.
 *
 * The window `[since, until)` is the rolling 24h before the date's last
 * run: now for today, the date's last ICT instant for a closed date (so
 * that window is the ICT day). `until` is the date's ICT end either way.
 */
export function buildTopItemsQuery(
  nowMs: number,
  date: string = tldrSnapshotDate(nowMs)
): {
  sql: string;
  since: number;
  until: number;
} {
  const until = dayBoundsSec(date).end;
  return {
    sql: TOP_ITEMS_SQL,
    since: Math.min(toEpochSeconds(nowMs), until) - 24 * 60 * 60,
    until,
  };
}

/** The edition's stories: the top TLDR_MAX_ITEMS of the date's window by
 * rank, with no source family over its share (`pickDiverse`). Shared by the
 * hourly write, the dry-run preview and the admin regenerate so all pick
 * the same items. */
async function loadTopItems(
  env: Env,
  nowMs: number,
  date: string
): Promise<ItemRow[]> {
  const { sql, since, until } = buildTopItemsQuery(nowMs, date);
  const { results } = await env.DB.prepare(sql)
    .bind(since, until)
    .all<ItemRow>();
  return pickDiverse(results ?? [], { limit: TLDR_MAX_ITEMS });
}

/** Snapshot / digest calendar date: local day in Asia/Ho_Chi_Minh, not UTC. */
export function tldrSnapshotDate(nowMs: number = Date.now()): string {
  return getLocalHourAndDate(nowMs, AUDIENCE_TIMEZONE).date;
}

/** A TL;DR result is only worth persisting if it actually has bullets. */
export function shouldPersistTldr(result: {
  bullets_en: unknown[];
  bullets_vi: unknown[];
}): boolean {
  return result.bullets_en.length > 0 || result.bullets_vi.length > 0;
}

/** Useful digest size: min(8, itemCount), and at least 2 when itemCount >= 2. */
export function usefulTldrFloor(itemCount: number): number {
  if (itemCount < 2) return Math.max(0, itemCount);
  return Math.min(8, itemCount);
}

/** True when the LLM digest is too thin for the ranked window (e.g. 1
 * leftover bullet while last-24h has 16 items). */
export function isThinTldr(
  result: { bullets_en: unknown[]; bullets_vi: unknown[] },
  itemCount: number
): boolean {
  const count = Math.max(result.bullets_en.length, result.bullets_vi.length);
  return count < usefulTldrFloor(itemCount);
}

function parseStoredBullets(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Refresh immediately when the snapshot is missing or thin. A useful
 * snapshot still waits `TLDR_REFRESH_MS` so we do not call the LLM every hour.
 */
export function shouldRefreshExistingSnapshot(opts: {
  existing:
    | {
        created_at: number;
        bullets_en: unknown[];
        bullets_vi: unknown[];
      }
    | null
    | undefined;
  itemCount: number;
  nowMs: number;
  refreshMs?: number;
  /** True when last-24h ranked items now have Vietnamese title_vi. */
  hasTitleVi?: boolean;
}): boolean {
  if (!opts.existing) return true;
  if (snapshotNeedsRebuild(opts.existing, opts.itemCount, opts.hasTitleVi))
    return true;
  return (
    opts.nowMs - (opts.existing.created_at ?? 0) >=
    (opts.refreshMs ?? TLDR_REFRESH_MS)
  );
}

/** True when a stored snapshot must be rebuilt now, whatever its age. */
export function snapshotNeedsRebuild(
  existing: { bullets_en: unknown[]; bullets_vi: unknown[] },
  itemCount: number,
  hasTitleVi = false
): boolean {
  if (isThinTldr(existing, itemCount)) return true;
  // EN-only snapshot: bilingual generate timed out / fell back. Refresh
  // immediately so a healthier chain can fill bullets_vi (otherwise the
  // 3h useful-snapshot gate leaves English TL;DR on the VI homepage).
  if (existing.bullets_en.length > 0 && existing.bullets_vi.length === 0) {
    return true;
  }
  // Frozen EN copies in bullets_vi (title-fallback before title_vi, or
  // bilingual LLM that restated English). Rebuild as soon as translations
  // exist — do not wait out TLDR_REFRESH_MS.
  return hasTitleVi && isEnglishOnlyViTldr(existing.bullets_vi);
}

/**
 * Deterministic snapshot from already-stored item titles. EN uses the
 * item title; VI uses `title_vi` when present, otherwise the same title
 * (never invents Vietnamese prose). Used when the LLM returns no bullets
 * or a thin digest so the daily snapshot still ranks the last-24h window.
 */
export function fallbackTldrFromItems(
  items: Array<{ id: string; title: string; title_vi?: string | null }>
): { bullets_en: TldrBullet[]; bullets_vi: TldrBullet[] } {
  const bullets_en: TldrBullet[] = [];
  const bullets_vi: TldrBullet[] = [];
  for (const item of items) {
    const title = item.title.trim();
    if (!title) continue;
    bullets_en.push({ text: title, item_ids: [item.id] });
    const vi = item.title_vi?.trim() || title;
    bullets_vi.push({ text: vi, item_ids: [item.id] });
  }
  return { bullets_en, bullets_vi };
}

export interface TldrRunStats {
  generated: boolean;
  /** A degraded refresh left the stored model digest in place. */
  kept?: boolean;
  tokens: number;
  /** Why the snapshot was (or wasn't) generated this run. */
  reason: string;
}

interface StoredTldr {
  date: string;
  created_at: number;
  bullets_en: string | null;
  bullets_vi: string | null;
  fallback: number | null;
}

async function loadStoredTldr(
  env: Env,
  date: string
): Promise<StoredTldr | null> {
  return env.DB.prepare(
    "SELECT date, created_at, bullets_en, bullets_vi, fallback FROM tldr_snapshots WHERE date = ?"
  )
    .bind(date)
    .first<StoredTldr>();
}

/** True when a degraded refresh must leave the stored model digest alone.
 * Shared by the real write and the dry-run preview so they cannot disagree. */
function keepsModelDigest(
  composed: Extract<ComposedTldr, { ok: true }>,
  existing: StoredTldr | null,
  results: ItemRow[]
): boolean {
  if (!composed.degraded || existing?.fallback !== 0) return false;
  return !snapshotNeedsRebuild(
    {
      bullets_en: parseStoredBullets(existing.bullets_en),
      bullets_vi: parseStoredBullets(existing.bullets_vi),
    },
    results.length,
    itemsHaveTitleVi(results)
  );
}

/** Idempotent daily gate: generates today's snapshot if missing or thin,
 * or refreshes a useful one when the last write is older than `TLDR_REFRESH_MS`. */
export async function ensureDailyTldr(env: Env): Promise<TldrRunStats> {
  const nowMs = Date.now();
  const date = tldrSnapshotDate(nowMs);

  const existing = await loadStoredTldr(env, date);

  const results = await loadTopItems(env, nowMs, date);

  const existingParsed = existing
    ? {
        created_at: existing.created_at ?? 0,
        bullets_en: parseStoredBullets(existing.bullets_en),
        bullets_vi: parseStoredBullets(existing.bullets_vi),
      }
    : null;

  if (
    !shouldRefreshExistingSnapshot({
      existing: existingParsed,
      itemCount: results.length,
      nowMs,
      hasTitleVi: itemsHaveTitleVi(results),
    })
  ) {
    const age = nowMs - (existingParsed?.created_at ?? 0);
    return {
      generated: false,
      tokens: 0,
      reason: `snapshot for ${date} is ${Math.round(age / 60000)}m old`,
    };
  }

  if (results.length === 0)
    return {
      generated: false,
      tokens: 0,
      reason: "no published items in window",
    };

  const composed = await composeTldr(env, results);
  if (!composed.ok) return composed.stats;

  if (keepsModelDigest(composed, existing, results)) {
    await env.DB.prepare(
      "UPDATE tldr_snapshots SET created_at = ? WHERE date = ?"
    )
      .bind(Date.now(), date)
      .run();
    return {
      generated: false,
      kept: true,
      tokens: composed.tokens,
      reason: `kept model digest: ${composed.degraded}`,
    };
  }

  await writeSnapshot(env, date, composed);

  return {
    generated: true,
    tokens: composed.tokens,
    reason: composeReason(composed),
  };
}

/** Upserts the date's row; `sent_at` is left as it was. */
async function writeSnapshot(
  env: Env,
  date: string,
  composed: Extract<ComposedTldr, { ok: true }>
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at, fallback)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       bullets_en = excluded.bullets_en,
       bullets_vi = excluded.bullets_vi,
       created_at = excluded.created_at,
       fallback = excluded.fallback`
  )
    .bind(
      date,
      JSON.stringify(composed.bullets_en),
      JSON.stringify(composed.bullets_vi),
      Date.now(),
      composed.degraded ? 1 : 0
    )
    .run();
}

type ComposedTldr =
  | {
      ok: true;
      bullets_en: TldrBullet[];
      bullets_vi: TldrBullet[];
      tokens: number;
      persistReason?: string;
      /** EN fell back to headlines (and VI with it). */
      degraded?: string;
      /** Only VI fell back to `title_vi` headlines. */
      viFallback?: string;
    }
  | { ok: false; stats: TldrRunStats };

function composeReason(composed: Extract<ComposedTldr, { ok: true }>): string {
  return (
    composed.persistReason ??
    `generated ${composed.bullets_en.length + composed.bullets_vi.length} bullets`
  );
}

/** Stored rows may still carry a wire "UPDATE:" marker (bullets quote
 * titles) or, if stored before ingest stripped it, feed chrome at the start
 * of the summary: the model copied "← Back to live feed · …" into a bullet. */
export function cleanTldrRows<T extends ItemRow>(rows: T[]): T[] {
  return rows.map((row) => ({
    ...row,
    title: stripTitleMarker(row.title),
    title_vi:
      row.title_vi == null ? row.title_vi : stripTitleMarker(row.title_vi),
    summary:
      row.summary == null ? row.summary : stripSourceBoilerplate(row.summary),
  }));
}

/** LLM digest plus the thin / English-only-VI fallbacks, without touching
 * D1. These are the bullets before the keep rule: when `degraded` is set,
 * `ensureDailyTldr` may keep the stored model digest instead of writing them. */
async function composeTldr(env: Env, rows: ItemRow[]): Promise<ComposedTldr> {
  const results = cleanTldrRows(rows);
  const tldr = await generateTldr(
    env,
    results.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary ?? undefined,
      title_vi: row.title_vi ?? undefined,
    }))
  );

  let bullets_en = tldr.bullets_en;
  let bullets_vi = tldr.bullets_vi;
  let persistReason: string | undefined;
  let degraded: string | undefined;
  let viFallback: string | undefined;

  // Never write an empty or thin snapshot: a 1-bullet row would satisfy
  // the `existing` gate above and freeze a leftover line for TLDR_REFRESH_MS
  // even when last-24h has many ranked items. If the LLM produced nothing
  // (or too few bullets), persist title-based bullets — VI reuses the
  // English title when no translation exists, never invented prose.
  if (isThinTldr(tldr, results.length)) {
    const fallback = fallbackTldrFromItems(results);
    if (!shouldPersistTldr(fallback)) {
      const detail = tldr.error ?? "returned no bullets";
      console.error(`generateTldr produced no persistable bullets: ${detail}`);
      return {
        ok: false,
        stats: {
          generated: false,
          tokens: tldr.tokens,
          reason: `LLM failed: ${detail}`,
        },
      };
    }
    bullets_en = fallback.bullets_en;
    bullets_vi = fallback.bullets_vi;
    degraded = `LLM thin (${tldr.error ?? `${Math.max(tldr.bullets_en.length, tldr.bullets_vi.length)} bullets`})`;
    persistReason = `${degraded}; persisted ${fallback.bullets_en.length} title-fallback bullets`;
    console.error(persistReason);
  } else if (needsViTitleFallback(tldr.bullets_vi, results)) {
    // Keep a useful EN digest; never persist raw English as bullets_vi
    // once title_vi exists. Title-fallback uses title_vi || title.
    const fallback = fallbackTldrFromItems(results);
    bullets_vi = fallback.bullets_vi;
    viFallback = "LLM VI was English-only";
    persistReason = `${viFallback}; persisted ${fallback.bullets_vi.length} title_vi fallback bullets`;
    console.error(persistReason);
  }

  return {
    ok: true,
    bullets_en,
    bullets_vi,
    tokens: tldr.tokens,
    persistReason,
    degraded,
    viFallback,
  };
}

export interface TldrPreview extends TldrRunStats {
  date: string;
  itemCount: number;
  bullets_en: TldrBullet[];
  bullets_vi: TldrBullet[];
}

/** The edition a run would leave stored right now, ignoring the refresh
 * gate and applying the same keep rule as `ensureDailyTldr`. Reads D1 and
 * calls the LLM; never writes `tldr_snapshots`. Used by dry runs and the
 * admin preview. */
export async function previewDailyTldr(env: Env): Promise<TldrPreview> {
  const nowMs = Date.now();
  const date = tldrSnapshotDate(nowMs);
  const results = await loadTopItems(env, nowMs, date);
  const empty = {
    date,
    itemCount: results.length,
    bullets_en: [],
    bullets_vi: [],
  };
  if (results.length === 0) {
    return {
      ...empty,
      generated: false,
      tokens: 0,
      reason: "no published items in window",
    };
  }
  const composed = await composeTldr(env, results);
  if (!composed.ok) return { ...empty, ...composed.stats };
  const existing = await loadStoredTldr(env, date);
  if (existing && keepsModelDigest(composed, existing, results)) {
    return {
      ...empty,
      generated: false,
      kept: true,
      tokens: composed.tokens,
      reason: `preview: kept model digest: ${composed.degraded}`,
      bullets_en: parseStoredBullets(existing.bullets_en) as TldrBullet[],
      bullets_vi: parseStoredBullets(existing.bullets_vi) as TldrBullet[],
    };
  }
  return {
    ...empty,
    generated: true,
    tokens: composed.tokens,
    reason: `preview: ${composeReason(composed)}`,
    bullets_en: composed.bullets_en,
    bullets_vi: composed.bullets_vi,
  };
}

/** Why a composed edition is not a model digest in both languages, or
 * undefined when it is. Stricter than the ingest write: `isThinTldr` passes
 * on either column and the VI fallback needs `title_vi` to fire. */
function notModelDigest(
  composed: Extract<ComposedTldr, { ok: true }>,
  itemCount: number
): string | undefined {
  if (composed.degraded) return composed.degraded;
  if (composed.viFallback) return composed.viFallback;
  const floor = usefulTldrFloor(itemCount);
  if (composed.bullets_en.length < floor)
    return `EN has ${composed.bullets_en.length} bullets`;
  if (composed.bullets_vi.length < floor)
    return `VI has ${composed.bullets_vi.length} bullets`;
  if (isEnglishOnlyViTldr(composed.bullets_vi)) return "VI is English-only";
  return undefined;
}

export interface TldrRegenerateResult extends TldrPreview {
  /** The row now holds these bullets; false for a dry run or a refusal. */
  written: boolean;
}

/**
 * Rebuilds the edition stored for `date` (today or a closed date) from that
 * date's window, ignoring the refresh gate. It writes only a model digest in
 * both languages, as `fallback = 0`: when the model fails, is thin, or
 * leaves VI English-only, the stored row stays exactly as it was, whatever
 * it holds. `dryRun` composes and reports without writing. Reads D1 and
 * calls the LLM; sends nothing.
 */
export async function regenerateDailyTldr(
  env: Env,
  date: string,
  opts: { dryRun?: boolean } = {}
): Promise<TldrRegenerateResult> {
  const results = await loadTopItems(env, Date.now(), date);
  const empty = {
    date,
    itemCount: results.length,
    bullets_en: [],
    bullets_vi: [],
    written: false,
  };
  const unchanged = "stored row unchanged";
  if (results.length === 0) {
    return {
      ...empty,
      generated: false,
      tokens: 0,
      reason: `no published items in window; ${unchanged}`,
    };
  }
  const composed = await composeTldr(env, results);
  if (!composed.ok) {
    return {
      ...empty,
      ...composed.stats,
      reason: `${composed.stats.reason}; ${unchanged}`,
    };
  }
  const notModel = notModelDigest(composed, results.length);
  if (notModel) {
    return {
      ...empty,
      generated: false,
      tokens: composed.tokens,
      reason: `not a model digest: ${notModel}; ${unchanged}`,
    };
  }
  if (!opts.dryRun) await writeSnapshot(env, date, composed);
  return {
    ...empty,
    generated: true,
    written: !opts.dryRun,
    tokens: composed.tokens,
    reason: `${opts.dryRun ? "dry run: would write" : "wrote"} model digest, ${composeReason(composed)}`,
    bullets_en: composed.bullets_en,
    bullets_vi: composed.bullets_vi,
  };
}

const PREVIEW_BULLETS = 3;
const PREVIEW_TEXT = 160;

/** Bounded TL;DR preview for `workflow_runs.stats` (a dry run's edition). */
export function summarizeTldrPreview(preview: {
  bullets_en: TldrBullet[];
  bullets_vi: TldrBullet[];
}): { bullets: number; en: string[]; vi: string[] } {
  const head = (bullets: TldrBullet[]) =>
    bullets.slice(0, PREVIEW_BULLETS).map((b) => b.text.slice(0, PREVIEW_TEXT));
  return {
    bullets: Math.max(preview.bullets_en.length, preview.bullets_vi.length),
    en: head(preview.bullets_en),
    vi: head(preview.bullets_vi),
  };
}
