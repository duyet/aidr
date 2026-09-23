/**
 * sessionStorage-backed stale-while-revalidate cache for the app's public
 * JSON GET endpoints. A repeat visit renders the cached body instantly
 * while a background fetch refreshes it — the caller's `ttlMs` mirrors the
 * endpoint's Cache-Control max-age (see system-api.ts, api/feed.ts).
 *
 * Guardrails: only `public` responses are persisted (never errors or
 * private/no-store data), every storage touch is try/catch (private-mode
 * quota, corrupt JSON, SSR where sessionStorage doesn't exist), and
 * concurrent callers share one in-flight request.
 */

const PREFIX = "aidr:json:";
const inflight = new Map<string, Promise<unknown | null>>();

interface StoredJson {
  t: number;
  data: unknown;
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Fresh-enough cached body for `url`, else null. `ttlMs` is the staleness
 * budget the caller accepts for instant paint — match it to the endpoint's
 * advertised max-age. */
export function getCachedJson<T>(url: string, ttlMs: number): T | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + url);
    if (!raw) return null;
    const entry = JSON.parse(raw) as StoredJson;
    if (typeof entry.t !== "number" || Date.now() - entry.t > ttlMs) {
      return null;
    }
    return entry.data as T;
  } catch {
    return null;
  }
}

/** GET `url` as JSON. Concurrent callers share the request; a successful
 * `public` response is persisted for getCachedJson. Resolves null on any
 * network/HTTP/parse failure — failures are never cached. */
export function fetchJson<T>(url: string): Promise<T | null> {
  let p = inflight.get(url) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(url)
      .then((res) => {
        if (!res.ok) return null;
        return (res.json() as Promise<T>).then((data) => {
          const cc = res.headers.get("cache-control") ?? "";
          if (/\bpublic\b/.test(cc)) writeJson(url, data);
          return data;
        });
      })
      .catch(() => null)
      .then((res) => {
        // Keep resolved values so remounts reuse them; evict failures so a
        // remount retries instead of pinning the error.
        if (res === null) inflight.delete(url);
        return res;
      });
    inflight.set(url, p);
  }
  return p;
}

function writeJson(url: string, data: unknown): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PREFIX + url, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // Quota / serialization failure — skip caching, the fetch still stands.
  }
}
