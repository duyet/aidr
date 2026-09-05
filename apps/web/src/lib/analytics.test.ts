import {
  DEFAULT_GA_MEASUREMENT_ID,
  resolveMeasurementId,
  sanitizeTrackParams,
  track,
} from "@aidr/ui/track";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveMeasurementId", () => {
  it("defaults to the public GA4 client id when env is empty", () => {
    expect(DEFAULT_GA_MEASUREMENT_ID).toBe("G-HXJPPQVYQN");
    expect(resolveMeasurementId(undefined)).toBe("G-HXJPPQVYQN");
    expect(resolveMeasurementId(null)).toBe("G-HXJPPQVYQN");
    expect(resolveMeasurementId("")).toBe("G-HXJPPQVYQN");
    expect(resolveMeasurementId("   ")).toBe("G-HXJPPQVYQN");
  });

  it("uses a non-empty env override", () => {
    expect(resolveMeasurementId("G-OTHER")).toBe("G-OTHER");
  });
});

describe("sanitizeTrackParams", () => {
  it("always sets surface web and drops PII keys", () => {
    expect(
      sanitizeTrackParams({
        query_len: 4,
        query: "secret search",
        q: "also secret",
        email: "you@example.com",
        name: "Ada",
        token: "abc",
        item_id: "deadbeef",
      })
    ).toEqual({
      query_len: 4,
      item_id: "deadbeef",
      surface: "web",
    });
  });

  it("drops nested objects and nulls", () => {
    expect(
      sanitizeTrackParams({
        // @ts-expect-error — runtime guard
        nested: { email: "x@y.z" },
        lang: "vi",
        empty: null,
      })
    ).toEqual({ lang: "vi", surface: "web" });
  });
});

describe("track", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("noops when gtag is missing", () => {
    vi.stubGlobal("window", {});
    expect(() => track("page_view")).not.toThrow();
  });

  it("noops when window is undefined", () => {
    expect(() => track("page_view")).not.toThrow();
  });

  it("calls gtag event with surface web", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    track("search", { query_len: 3, query: "hid" });
    expect(gtag).toHaveBeenCalledWith("event", "search", {
      query_len: 3,
      surface: "web",
    });
  });

  it("ignores invalid event names", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    track("Not Valid");
    track("has space");
    track("");
    expect(gtag).not.toHaveBeenCalled();
  });
});
