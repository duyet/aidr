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
export type TrackChannel = "chrome" | "telegram" | "email";

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

function getPosthog():
  | { capture: (event: string, props: object) => void }
  | undefined {
  if (typeof window === "undefined") return undefined;
  const ph = (window as Window & { posthog?: { capture?: unknown } }).posthog;
  return typeof ph?.capture === "function"
    ? (ph as { capture: (event: string, props: object) => void })
    : undefined;
}

/** Best-effort GA4 + PostHog event, same name and sanitized params.
 * Noops for a sink that is not loaded; never throws. */
export function track(name: string, params?: TrackParams): void {
  try {
    if (!EVENT_NAME_RE.test(name)) return;
    const clean = sanitizeTrackParams(params);
    getGtag()?.("event", name, clean);
    getPosthog()?.capture(name, clean);
  } catch {
    // never break UI
  }
}

export function trackChannelClick(
  channel: TrackChannel,
  params: TrackParams = {}
): void {
  track("channel_click", { ...params, channel });
}
