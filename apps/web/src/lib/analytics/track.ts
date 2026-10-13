import {
  type BrowserEventName,
  EVENTS,
  type EventParams,
  isEventName,
  SINKS,
} from "./events";
import { normalizeParams } from "./schema";

type Gtag = (...args: unknown[]) => void;
type Posthog = { capture: (event: string, props: object) => void };

function getGtag(): Gtag | undefined {
  if (typeof window === "undefined") return undefined;
  const gtag = (window as Window & { gtag?: unknown }).gtag;
  return typeof gtag === "function" ? (gtag as Gtag) : undefined;
}

function getPosthog(): Posthog | undefined {
  if (typeof window === "undefined") return undefined;
  const ph = (window as Window & { posthog?: { capture?: unknown } }).posthog;
  return typeof ph?.capture === "function" ? (ph as Posthog) : undefined;
}

/**
 * Sends a registry event to GA4 and PostHog (or the sinks its row names).
 * Params outside the row, and values that fail their kind, are dropped. The
 * vendor queue stubs are installed at module init, so a call before the
 * scripts load is queued, not lost. Never throws.
 */
export function track<N extends BrowserEventName>(
  name: N,
  params: EventParams<N>
): void {
  try {
    if (!isEventName(name)) return;
    const spec = EVENTS[name];
    const clean = normalizeParams(
      spec.params,
      params as Record<string, unknown>
    );
    const sinks: readonly string[] = "sinks" in spec ? spec.sinks : SINKS;
    if (sinks.includes("ga4")) getGtag()?.("event", name, clean);
    // `surface` tells browser events apart from future Worker events; GA4
    // only ever sees browser events, so only PostHog gets it.
    if (sinks.includes("posthog")) {
      getPosthog()?.capture(name, { ...clean, surface: "web" });
    }
  } catch {
    // never break UI
  }
}
