/**
 * Clerk account mirror in D1 (`clerk_users`, migration 0026).
 *
 * This table is the only source the /data signup metric reads. Rows enter it
 * from exactly two places, both explicit:
 *
 * 1. a signature-verified Clerk webhook (see worker/clerk-webhook.ts), and
 * 2. the admin-gated Clerk Backend API backfill below, so historical accounts
 *    are present before the first webhook lands.
 *
 * Nothing is inferred: a request-scoped page of Clerk users is never counted,
 * a subscriber is never an account, and a failed read is never reported as a
 * smaller (or zero) total.
 */

import { toEpochSeconds } from "./time.js";

export const CLERK_USERS_MIGRATION = "0026_clerk_users.sql";
export const CLERK_USERS_TABLE = "clerk_users";

/** Read-side handle: the raw binding or a `withSession()` handle. */
type DbLike = Pick<D1Database, "prepare" | "batch">;

/** Non-deleted Clerk accounts. A soft-deleted row is excluded, not dropped. */
export const CLERK_USERS_COUNT_SQL = `SELECT COUNT(*) AS c
  FROM ${CLERK_USERS_TABLE}
  WHERE deleted_at IS NULL`;

/**
 * Replay-safe upsert: the primary key means a redelivered `user.created` /
 * `user.updated` webhook updates one row instead of counting twice.
 * `created_at` is only written on insert — a later event must never rewrite
 * when the account was created, and the webhook's own timestamp is used when
 * Clerk omits the field.
 */
export const CLERK_USER_UPSERT_SQL = `INSERT INTO ${CLERK_USERS_TABLE} (
  id, email, created_at, updated_at, deleted_at
)
VALUES (?, ?, ?, ?, NULL)
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  updated_at = excluded.updated_at,
  deleted_at = NULL`;

/** Soft delete. Keeps the account row for audit; the count reads it out. */
export const CLERK_USER_DELETE_SQL = `UPDATE ${CLERK_USERS_TABLE}
   SET deleted_at = ?, updated_at = ?
 WHERE id = ?`;

/** One Clerk account as D1 stores it. Timestamps are epoch seconds. */
export interface ClerkUserSyncRow {
  id: string;
  email: string | null;
  /** Clerk's `created_at`; the verified receipt time when Clerk omits it. */
  createdAt: number;
  /** When D1 last saw this account (webhook receipt / backfill run). */
  updatedAt: number;
}

function bindArgs(row: ClerkUserSyncRow): unknown[] {
  return [row.id, row.email, row.createdAt, row.updatedAt];
}

export function prepareClerkUserUpsert(
  db: Pick<D1Database, "prepare">,
  row: ClerkUserSyncRow
): D1PreparedStatement {
  return db.prepare(CLERK_USER_UPSERT_SQL).bind(...bindArgs(row));
}

export async function upsertClerkUser(
  db: Pick<D1Database, "prepare">,
  row: ClerkUserSyncRow
): Promise<void> {
  await prepareClerkUserUpsert(db, row).run();
}

/** One page of accounts in a single D1 round-trip. */
export async function upsertClerkUsers(
  db: DbLike,
  rows: readonly ClerkUserSyncRow[]
): Promise<void> {
  if (rows.length === 0) return;
  await db.batch(rows.map((row) => prepareClerkUserUpsert(db, row)));
}

export async function softDeleteClerkUser(
  db: Pick<D1Database, "prepare">,
  id: string,
  at: number
): Promise<void> {
  await db.prepare(CLERK_USER_DELETE_SQL).bind(at, at, id).run();
}

/** D1 reports an unmigrated table as "no such table"; never treat that as 0. */
export function isMissingClerkUsersTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table|has no table|unknown table/i.test(message);
}

/** Schema probe: cheapest statement that proves 0026 has been applied. */
export const CLERK_USERS_PROBE_SQL = `SELECT id FROM ${CLERK_USERS_TABLE} LIMIT 1`;

let clerkUsersTableSupported: boolean | null = null;

/** Test seam: the probe result is cached per isolate, like the other probes. */
export function resetClerkUsersTableProbe(): void {
  clerkUsersTableSupported = null;
}

/**
 * Has migration 0026 been applied? D1 migration application is an operator
 * step, so this probe reports the state instead of applying anything, and a
 * missing table stays `unconfigured` rather than an empty count.
 */
export async function hasClerkUsersTable(
  db: Pick<D1Database, "prepare">
): Promise<boolean> {
  if (clerkUsersTableSupported != null) return clerkUsersTableSupported;
  try {
    await db.prepare(CLERK_USERS_PROBE_SQL).all();
    clerkUsersTableSupported = true;
  } catch (error) {
    if (!isMissingClerkUsersTable(error)) {
      // A transient D1 failure is not a schema answer; let the caller read and
      // surface the error instead of caching "unsupported" forever.
      clerkUsersTableSupported = null;
      throw error;
    }
    clerkUsersTableSupported = false;
  }
  return clerkUsersTableSupported;
}

/** COUNT of live (non-deleted) mirrored accounts. Never infers from a page. */
export async function countClerkUsers(
  db: Pick<D1Database, "prepare">
): Promise<number> {
  const row = await db.prepare(CLERK_USERS_COUNT_SQL).first<{ c: number }>();
  const total = Number(row?.c ?? 0);
  return Number.isSafeInteger(total) && total >= 0 ? total : 0;
}

/* -------------------------------------------------------------------------- */
/* Clerk Backend API (admin-gated backfill)                                   */
/* -------------------------------------------------------------------------- */

const CLERK_USERS_API = "https://api.clerk.com/v1/users";
const BACKFILL_PAGE_LIMIT = 100;
/** Bounded work per request: 20 pages x 100 users = 2000 accounts. */
const BACKFILL_MAX_PAGES = 20;
const CLERK_TIMEOUT_MS = 10_000;
const MAX_EMAIL_LENGTH = 320;

export interface ClerkBackfillEnv {
  DB?: D1Database;
  CLERK_SECRET_KEY?: string;
}

export interface ClerkBackfillResult {
  status: "ok" | "unconfigured" | "error";
  /** Accounts written to D1 by this run. */
  synced: number;
  /** Clerk list pages read. */
  pages: number;
  /** Clerk's own aggregate total, when the API reported one. */
  total: number | null;
  /** Short, non-sensitive reason; absent on success. */
  error?: string;
}

/** Parse only Clerk's aggregate field; never fall back to data.length. */
export function parseClerkUserTotal(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const raw = (payload as { total_count?: unknown }).total_count;
  const total =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN;

  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function isClerkUserId(value: unknown): value is string {
  return typeof value === "string" && /^user_[A-Za-z0-9_-]{1,64}$/.test(value);
}

/** Primary email address, else the first plausible address. Never invented. */
export function clerkUserEmail(data: Record<string, unknown>): string | null {
  const addresses = Array.isArray(data.email_addresses)
    ? data.email_addresses
    : [];
  const primaryId =
    typeof data.primary_email_address_id === "string"
      ? data.primary_email_address_id
      : null;

  const candidates: string[] = [];
  for (const entry of addresses) {
    if (!entry || typeof entry !== "object") continue;
    const value = (entry as { email_address?: unknown }).email_address;
    if (typeof value !== "string") continue;
    if (primaryId && (entry as { id?: unknown }).id === primaryId) {
      candidates.unshift(value);
    } else {
      candidates.push(value);
    }
  }
  if (typeof data.email_address === "string")
    candidates.push(data.email_address);

  for (const candidate of candidates) {
    const email = candidate.trim();
    if (!email || email.length > MAX_EMAIL_LENGTH) continue;
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) continue;
    return email;
  }
  return null;
}

function epochSecondsOrNull(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0
    ? toEpochSeconds(numeric)
    : null;
}

/**
 * One Clerk list page → sync rows. `nowSec` (the verified webhook receipt or
 * the backfill run) is the only fallback for an omitted `created_at`: it
 * records when D1 first saw the account, never a guessed creation date.
 */
export function parseClerkUserList(
  payload: unknown,
  nowSec: number
): ClerkUserSyncRow[] {
  const data =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data ?? [])
      : [];

  const rows: ClerkUserSyncRow[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const user = entry as Record<string, unknown>;
    if (!isClerkUserId(user.id)) continue;
    rows.push({
      id: user.id,
      email: clerkUserEmail(user),
      createdAt: epochSecondsOrNull(user.created_at) ?? nowSec,
      updatedAt: nowSec,
    });
  }
  return rows;
}

/**
 * One-shot backfill so the signup total is real before the first webhook.
 * Admin-gated at the route; read-only against Clerk, write-only into D1.
 */
export async function backfillClerkUsers(
  env: ClerkBackfillEnv,
  fetcher: typeof fetch = fetch
): Promise<ClerkBackfillResult> {
  const secret = env.CLERK_SECRET_KEY?.trim();
  if (!secret) {
    return { status: "unconfigured", synced: 0, pages: 0, total: null };
  }
  if (!env.DB) {
    return {
      status: "error",
      synced: 0,
      pages: 0,
      total: null,
      error: "D1 binding DB not configured",
    };
  }

  let synced = 0;
  let pages = 0;
  let total: number | null = null;

  try {
    for (let page = 0; page < BACKFILL_MAX_PAGES; page += 1) {
      const url = `${CLERK_USERS_API}?limit=${BACKFILL_PAGE_LIMIT}&offset=${
        page * BACKFILL_PAGE_LIMIT
      }&order_by=-created_at`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CLERK_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetcher(url, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${secret}`,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return {
          status: "error",
          synced,
          pages,
          total,
          error: `clerk responded ${response.status}`,
        };
      }

      const payload: unknown = await response.json().catch(() => null);
      if (page === 0) total = parseClerkUserTotal(payload);
      const nowSec = toEpochSeconds(Date.now());
      const rows = parseClerkUserList(payload, nowSec);
      pages += 1;
      if (rows.length === 0) return { status: "ok", synced, pages, total };

      await upsertClerkUsers(env.DB, rows);
      synced += rows.length;
      if (rows.length < BACKFILL_PAGE_LIMIT) break;
    }
  } catch (error) {
    return {
      status: "error",
      synced,
      pages,
      total,
      error: error instanceof Error ? error.name : "clerk request failed",
    };
  }

  return { status: "ok", synced, pages, total };
}
