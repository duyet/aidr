/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metric } from "web-vitals";
import { track } from "./track";
import { metricParams, reportWebVitals } from "./web-vitals";

vi.mock("./track", () => ({ track: vi.fn() }));

type Registration = { name: string; fn: (m: Metric) => void; opts?: unknown };
const registered = vi.hoisted(() => [] as Registration[]);
vi.mock("web-vitals", () => {
  const on = (name: string) => (fn: Registration["fn"], opts?: unknown) => {
    registered.push({ name, fn, opts });
  };
  return {
    onCLS: on("CLS"),
    onFCP: on("FCP"),
    onINP: on("INP"),
    onLCP: on("LCP"),
    onTTFB: on("TTFB"),
  };
});

const metric = (
  name: Metric["name"],
  value: number,
  navigationType: Metric["navigationType"] = "navigate"
) =>
  ({
    name,
    value,
    rating: "good",
    id: "v5-1",
    navigationType,
  }) as Metric;

describe("metricParams", () => {
  it("tags each vital with the edge-cache outcome so HIT vs MISS load times can be compared", () => {
    const p = metricParams(metric("LCP", 1234.6), "HIT", "/");
    expect(p).toMatchObject({
      metric_name: "LCP",
      value: 1235,
      edge_cache: "HIT",
    });
  });
  it("scales CLS so GA4's integer value keeps its precision", () => {
    expect(metricParams(metric("CLS", 0.042), "MISS", "/").value).toBe(42);
  });
});

describe("reportWebVitals path attribution", () => {
  beforeEach(() => {
    registered.length = 0;
    vi.mocked(track).mockClear();
  });

  it("attributes a vital to the page it was observed on, not the page open when it is reported", async () => {
    history.replaceState(null, "", "/subscribe?settings=abc");
    await reportWebVitals();
    const lcp = registered.filter((r) => r.name === "LCP");
    const observe = lcp.find(
      (r) => (r.opts as { reportAllChanges?: boolean })?.reportAllChanges
    );
    const report = lcp.find((r) => !r.opts);
    expect(observe, "an every-change observer for LCP").toBeDefined();
    expect(report, "a final report callback for LCP").toBeDefined();

    observe?.fn(metric("LCP", 1200));
    history.pushState(null, "", "/");
    report?.fn(metric("LCP", 1200));

    expect(track).toHaveBeenCalledExactlyOnceWith(
      "web_vitals",
      expect.objectContaining({ page_path: "/subscribe" })
    );
  });
});
