/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import type { Metric } from "web-vitals";
import { metricParams } from "./web-vitals";

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
    const p = metricParams(metric("LCP", 1234.6), "HIT");
    expect(p).toMatchObject({
      metric_name: "LCP",
      value: 1235,
      edge_cache: "HIT",
    });
  });
  it("scales CLS so GA4's integer value keeps its precision", () => {
    expect(metricParams(metric("CLS", 0.042), "MISS").value).toBe(42);
  });
});
