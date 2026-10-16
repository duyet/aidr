import type { Metric } from "web-vitals";
import type { EventParams } from "./events";
import { parseSlug } from "./schema";
import { track } from "./track";

type VitalsParams = EventParams<"web_vitals">;
type EdgeCache = VitalsParams["edge_cache"];

const CACHE_STATES = ["HIT", "STALE", "KV", "MISS"] as const;

/**
 * Edge-cache outcome of the document request, read from the Worker's
 * `Server-Timing: aidr-cache;desc=HIT|STALE|KV|MISS`. "none" when the response was
 * not cache-eligible (or the browser hides server timing).
 */
export function documentCacheStatus(): EdgeCache {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | (PerformanceNavigationTiming & {
          serverTiming?: { name: string; description: string }[];
        })
      | undefined;
    const entry = nav?.serverTiming?.find((t) => t.name === "aidr-cache");
    const desc = entry?.description;
    return CACHE_STATES.find((state) => state === desc) ?? "none";
  } catch {
    return "none";
  }
}

/** One metric → GA4 event + PostHog event, same name and dimensions. */
export function metricParams(
  metric: Metric,
  cache: EdgeCache,
  pagePath: string
): VitalsParams {
  return {
    metric_name: metric.name,
    // GA4 sums `value`; CLS is unitless, so scale it to keep precision.
    value: Math.round(
      metric.name === "CLS" ? metric.value * 1000 : metric.value
    ),
    metric_value: metric.value,
    metric_rating: metric.rating,
    metric_id: parseSlug(metric.id),
    navigation_type: metric.navigationType,
    edge_cache: cache,
    page_path: pagePath,
  };
}

/**
 * The library reports LCP, CLS and INP late (first input, page hide), often
 * after an SPA navigation. The path is recorded each time a value changes,
 * so the report names the page the value was observed on.
 */
const observedPath = new Map<Metric["name"], string>();

function observe(metric: Metric): void {
  observedPath.set(metric.name, location.pathname);
}

function report(metric: Metric): void {
  track(
    "web_vitals",
    metricParams(
      metric,
      documentCacheStatus(),
      observedPath.get(metric.name) ?? location.pathname
    )
  );
}

/**
 * Report Core Web Vitals once each. Loaded after LCP with the rest of
 * analytics; the library reads buffered performance entries, so LCP, FCP and
 * TTFB that happened before it loaded are still captured.
 */
export async function reportWebVitals(): Promise<void> {
  try {
    const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import("web-vitals");
    for (const on of [onLCP, onCLS, onINP, onFCP, onTTFB]) {
      on(observe, { reportAllChanges: true });
      on(report);
    }
  } catch {
    // never break UI
  }
}
