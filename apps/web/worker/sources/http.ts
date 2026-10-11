import { fetchWithSafeRedirects } from "../enrich.js";
import { SourceFetchError } from "./rss.js";

const SOURCE_USER_AGENT = "Mozilla/5.0 (compatible; duyet-news-bot/1.0)";

/**
 * GET a JSON API for a source adapter. A transport error or non-2xx is a
 * `fetch_failed`, a body that is not JSON is a `parse_failed`, so the run
 * records why it delivered nothing instead of a bare empty list. The
 * User-Agent is not optional: api.github.com rejects requests without one.
 */
export async function fetchSourceJson(
  url: string,
  label: string,
  headers: Record<string, string> = {}
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchWithSafeRedirects(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "application/json",
        "User-Agent": SOURCE_USER_AGENT,
        ...headers,
      },
    });
  } catch (error) {
    throw new SourceFetchError(
      "fetch_failed",
      error instanceof Error ? error.message : `${label} fetch failed`
    );
  }
  if (!res.ok) {
    throw new SourceFetchError(
      "fetch_failed",
      `${label} returned ${res.status}`
    );
  }
  try {
    return await res.json();
  } catch {
    throw new SourceFetchError(
      "parse_failed",
      `${label} returned a body that is not JSON`
    );
  }
}

/** `config.maxItems` as a positive integer, or no cap. */
export function configuredMaxItems(config: Record<string, unknown>): number {
  const raw = config.maxItems;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : Number.POSITIVE_INFINITY;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
