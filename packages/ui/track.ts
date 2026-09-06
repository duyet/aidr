/** Public GA4 measurement ID (client id, not a secret). */
export const DEFAULT_GA_MEASUREMENT_ID = "G-HXJPPQVYQN";

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;

const DROP_KEYS = new Set([
  "email",
  "name",
  "query",
  "q",
  "token",
  "password",
  "title",
  "text",
  "summary",
  "authorization",
]);

export type TrackParamValue = string | number | boolean;
export type TrackParams = Record<string, TrackParamValue | null | undefined>;

export function resolveMeasurementId(envId?: string | null): string {
  const trimmed = typeof envId === "string" ? envId.trim() : "";
  return trimmed || DEFAULT_GA_MEASUREMENT_ID;
}

export function sanitizeTrackParams(
  params?: TrackParams
): Record<string, TrackParamValue> {
  const out: Record<string, TrackParamValue> = {};
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (DROP_KEYS.has(key.toLowerCase())) continue;
      if (value == null) continue;
      const t = typeof value;
      if (t === "string" || t === "number" || t === "boolean") {
        out[key] = value as TrackParamValue;
      }
    }
  }
  out.surface = "web";
  return out;
}

function getGtag(): ((...args: unknown[]) => void) | undefined {
  if (typeof window === "undefined") return undefined;
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void })
    .gtag;
  return typeof gtag === "function" ? gtag : undefined;
}

/** Best-effort GA4 event. Noops when gtag is missing; never throws. */
export function track(name: string, params?: TrackParams): void {
  try {
    if (!EVENT_NAME_RE.test(name)) return;
    const gtag = getGtag();
    if (!gtag) return;
    gtag("event", name, sanitizeTrackParams(params));
  } catch {
    // never break UI
  }
}
