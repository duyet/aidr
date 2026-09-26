/**
 * Aggregate AIDR signup count from the D1 `clerk_users` mirror.
 *
 * This is intentionally separate from the D1 `subscribers` count: an email
 * subscription is not an account, and a session/request/run is not a user.
 * The count is one COUNT(*) over accounts synced by a verified Clerk webhook
 * (or an explicit admin backfill) — the public /data read no longer live-calls
 * the Clerk Admin API, so it can never be flaky and never has to render
 * "Unavailable" because an upstream request timed out.
 *
 * States stay explicit: an unmirrored database is `unconfigured`, an empty
 * mirror is `unconfigured` too (an empty table cannot prove that Clerk has no
 * accounts), and a read failure is `error`. None of them invent a number.
 */

import {
  countClerkUsers,
  hasClerkUsersTable,
  isMissingClerkUsersTable,
} from "./clerk-users.js";

export type AccountCountStatus = "available" | "unconfigured" | "error";

export interface AccountCount {
  total: number | null;
  source: "d1";
  status: AccountCountStatus;
}

export function accountCount(
  total: number | null,
  status: AccountCountStatus
): AccountCount {
  return { total, source: "d1", status };
}

/** Read-side handle: the raw D1 binding, a session, or nothing at all. */
export interface AccountCountDb {
  prepare: D1Database["prepare"];
}

/**
 * Count live mirrored Clerk accounts. A missing D1 binding or a database that
 * has not applied the 0026 migration is `unconfigured` — never zero.
 *
 * An empty mirror is also `unconfigured`, not a real `0`. An empty table cannot
 * distinguish "Clerk has no accounts" from "the webhook has not delivered
 * yet", and /data is public: a confident `0` is indistinguishable from a true
 * count and silently wrong the moment a signup exists. Reporting
 * `unconfigured` until the first row lands is the honest failure — the
 * dashboard shows "Unavailable" instead of inventing a number. Once one
 * account syncs the count becomes available and stays available.
 */
export async function loadClerkAccountCount(
  db: AccountCountDb | undefined | null
): Promise<AccountCount> {
  if (!db) return accountCount(null, "unconfigured");

  try {
    if (!(await hasClerkUsersTable(db))) {
      return accountCount(null, "unconfigured");
    }
    const total = await countClerkUsers(db);
    return total > 0
      ? accountCount(total, "available")
      : accountCount(null, "unconfigured");
  } catch (error) {
    if (isMissingClerkUsersTable(error)) {
      return accountCount(null, "unconfigured");
    }
    console.error("account count unavailable:", error);
    return accountCount(null, "error");
  }
}
