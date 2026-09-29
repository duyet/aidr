/**
 * GA4 Data API `properties.runReport` request/response plumbing.
 *
 * Kept free of `cloudflare:workers` and of D1 so the parsing can be tested in
 * node. Two rules the whole audience feature depends on:
 *
 * 1. **A metric is a number or it is nothing.** GA4 returns every metric value
 *    as a *string*, and a value can be non-numeric or absent. Everything is
 *    coerced through one finite-number guard, so a malformed upstream payload
 *    renders as "no data" rather than `NaN` on a public dashboard.
 * 2. **The date dimension is `YYYYMMDD`.** It is normalised once, here, into
 *    the `YYYY-MM-DD` shape the rest of /data already uses.
 */

const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
export const GA4_REPORT_TIMEOUT_MS = 15_000;

export interface Ga4DateRange {
  startDate: string;
  endDate: string;
}

export interface RunReportRequest {
  dateRanges: Ga4DateRange[];
  dimensions: { name: string }[];
  metrics: { name: string }[];
  orderBys?: {
    dimension?: { dimensionName: string };
    metric?: { metricName: string };
    desc?: boolean;
  }[];
  limit?: string;
  keepEmptyRows?: boolean;
}

/** One row as strings + finite numbers, in the order requested. */
export interface Ga4TableRow {
  dimensions: string[];
  metrics: (number | null)[];
}

export interface Ga4Table {
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: Ga4TableRow[];
}

export function ga4RunReportUrl(propertyId: string): string {
  return `${GA4_API_BASE}/properties/${propertyId}:runReport`;
}

export class Ga4ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Ga4ReportError";
  }
}

/** Only finite, non-negative integers survive; anything else is "missing". */
function metricNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function headerNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const name = (entry as { name?: unknown }).name;
    if (typeof name === "string" && name) names.push(name);
  }
  return names;
}

/**
 * Parse a `runReport` body. A non-object, a missing `rows` array, or a row
 * whose values are not arrays all yield an empty table — the caller then
 * reports an upstream failure instead of an audience of zero.
 */
export function parseGa4Report(payload: unknown): Ga4Table {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { dimensionHeaders: [], metricHeaders: [], rows: [] };
  }
  const record = payload as Record<string, unknown>;
  const rawRows = Array.isArray(record.rows) ? record.rows : [];

  const rows: Ga4TableRow[] = [];
  for (const raw of rawRows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const dimensions = Array.isArray(row.dimensionValues)
      ? row.dimensionValues
      : [];
    const metrics = Array.isArray(row.metricValues) ? row.metricValues : [];

    const dimValues = dimensions.map((entry) =>
      entry &&
      typeof entry === "object" &&
      typeof (entry as { value?: unknown }).value === "string"
        ? (entry as { value: string }).value
        : ""
    );
    rows.push({
      dimensions: dimValues,
      metrics: metrics.map((entry) =>
        metricNumber(
          entry && typeof entry === "object"
            ? (entry as { value?: unknown }).value
            : null
        )
      ),
    });
  }

  return {
    dimensionHeaders: headerNames(record.dimensionHeaders),
    metricHeaders: headerNames(record.metricHeaders),
    rows,
  };
}

/**
 * `20260901` → `2026-09-01`. Anything else (including `(other)` and blanks)
 * returns null so the row is dropped instead of becoming a bogus axis label.
 */
export function ga4DateFromCompact(value: string): string | null {
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/** POST one report. Non-2xx throws with the status only — never the body,
 *  which can echo the property and the request. */
export async function runGa4Report(
  propertyId: string,
  accessToken: string,
  request: RunReportRequest,
  fetcher: typeof fetch = fetch
): Promise<Ga4Table> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GA4_REPORT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(ga4RunReportUrl(propertyId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Ga4ReportError(
      error instanceof Error && error.name === "AbortError"
        ? "report request timed out"
        : "report request failed"
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Ga4ReportError(`report request rejected (${response.status})`);
  }
  return parseGa4Report(await response.json().catch(() => null));
}
