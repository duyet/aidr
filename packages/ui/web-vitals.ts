import type { Metric } from "web-vitals";
import { track } from "./track";

/**
 * Edge-cache outcome of the document request, read from the Worker's
 * `Server-Timing: aidr-cache;desc=HIT|MISS`. "none" when the response was
 * not cache-eligible (or the browser hides server timing).
 */
export function documentCacheStatus(): string {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | (PerformanceNavigationTiming & {
          serverTiming?: { name: string; description: string }[];
        })
      | undefined;
    const entry = nav?.serverTiming?.find((t) => t.name === "aidr-cache");
    return entry?.description || "none";
  } catch {
    return "none";
  }
}

/** One metric → GA4 event + PostHog event, same name and dimensions. */
export function metricParams(metric: Metric, cache: string) {
  return {
    metric_name: metric.name,
    // GA4 sums `value`; CLS is unitless, so scale it to keep precision.
    value: Math.round(
      metric.name === "CLS" ? metric.value * 1000 : metric.value
    ),
    metric_value: metric.value,
    metric_rating: metric.rating,
    metric_id: metric.id,
    navigation_type: metric.navigationType,
    edge_cache: cache,
    page_path: location.pathname,
  };
}

function report(metric: Metric): void {
  const params = metricParams(metric, documentCacheStatus());
  // track() fans out to GA4 and PostHog.
  track("web_vitals", params);
}

/**
 * Report Core Web Vitals once each. Loaded after LCP with the rest of
 * analytics; the library reads buffered performance entries, so LCP, FCP and
 * TTFB that happened before it loaded are still captured.
 */
export async function reportWebVitals(): Promise<void> {
  try {
    const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import("web-vitals");
    onLCP(report);
    onCLS(report);
    onINP(report);
    onFCP(report);
    onTTFB(report);
  } catch {
    // never break UI
  }
}
