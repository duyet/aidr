/**
 * Aggregate AIDR account count from Clerk's authoritative user directory.
 *
 * This is intentionally separate from the D1 `subscribers` count: an email
 * subscription is not an account, and a session/request/run is not a user.
 * The API only returns `total_count`; we never infer a count from a page of
 * users or from operational traffic.
 */

export type AccountCountStatus = "available" | "unconfigured" | "error";

export interface AccountCount {
  total: number | null;
  source: "clerk";
  status: AccountCountStatus;
}

const CLERK_USERS_URL = "https://api.clerk.com/v1/users?limit=1&offset=0";
const CLERK_TIMEOUT_MS = 3_000;

export type AccountCountFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

function result(
  total: number | null,
  status: AccountCountStatus
): AccountCount {
  return { total, source: "clerk", status };
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

/**
 * Read the aggregate account count with a short timeout. Missing config and
 * upstream failures are represented as explicit states, never as zero.
 */
export async function loadClerkAccountCount(
  env: { CLERK_SECRET_KEY?: string },
  fetcher: AccountCountFetch = fetch
): Promise<AccountCount> {
  const secret = env.CLERK_SECRET_KEY?.trim();
  if (!secret) return result(null, "unconfigured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLERK_TIMEOUT_MS);

  try {
    const response = await fetcher(CLERK_USERS_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secret}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return result(null, "error");

    const total = parseClerkUserTotal(await response.json());
    return total === null ? result(null, "error") : result(total, "available");
  } catch {
    return result(null, "error");
  } finally {
    clearTimeout(timeout);
  }
}
