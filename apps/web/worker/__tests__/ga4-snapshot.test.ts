import { describe, expect, it } from "vitest";
import { ga4Audience, parseGa4Snapshot } from "../ga4/snapshot.js";

const BASE = {
  version: 1 as const,
  propertyId: "123456",
  fetchedAt: 1_757_000_000,
  totals: { views: 420, users: 90, sessions: 150, newUsers: 12 },
  daily: [],
  topPages: [],
  sources: [],
};

describe("parseGa4Snapshot", () => {
  it("accepts a stored payload and parses it from its JSON form", () => {
    const snapshot = parseGa4Snapshot(JSON.stringify(BASE));
    expect(snapshot?.propertyId).toBe("123456");
    expect(snapshot?.totals.users).toBe(90);
  });

  it("keeps a real zero total", () => {
    const snapshot = parseGa4Snapshot({
      ...BASE,
      totals: { views: 0, users: 0, sessions: 0, newUsers: 0 },
    });
    expect(snapshot?.totals.views).toBe(0);
  });

  it("rejects a payload without intact totals rather than defaulting to zero", () => {
    // The whole point of the status split: an upstream failure must not
    // become a confident audience of zero.
    expect(parseGa4Snapshot({ ...BASE, totals: undefined })).toBeNull();
    expect(parseGa4Snapshot({ ...BASE, totals: { views: 10 } })).toBeNull();
    expect(
      parseGa4Snapshot({ ...BASE, totals: { ...BASE.totals, users: null } })
    ).toBeNull();
    expect(parseGa4Snapshot({ ...BASE, propertyId: "" })).toBeNull();
    expect(parseGa4Snapshot({ ...BASE, fetchedAt: "soon" })).toBeNull();
  });

  it("rejects a payload from a future schema version", () => {
    expect(parseGa4Snapshot({ ...BASE, version: 2 })).toBeNull();
    expect(parseGa4Snapshot("not json")).toBeNull();
    expect(parseGa4Snapshot(null)).toBeNull();
    expect(parseGa4Snapshot([])).toBeNull();
  });

  it("drops malformed daily points and named rows but keeps the rest", () => {
    const snapshot = parseGa4Snapshot({
      ...BASE,
      daily: [
        { date: "2026-09-01", views: 10, users: 4, sessions: 6 },
        { date: "not-a-date", views: 10, users: 4, sessions: 6 },
        { date: "2026-09-02", views: "many", users: 4, sessions: 6 },
        { date: "2026-09-03", views: 5, users: null, sessions: 6 },
      ],
      topPages: [
        { name: "/", views: 10, users: 4 },
        { name: "", views: 10, users: 4 },
        { name: "/news", views: 5 },
      ],
    });

    expect(snapshot?.daily).toEqual([
      { date: "2026-09-01", views: 10, users: 4, sessions: 6 },
    ]);
    expect(snapshot?.topPages).toEqual([{ name: "/", views: 10, users: 4 }]);
  });
});

describe("ga4Audience", () => {
  it("reads DAU from the latest day and MAU from the window total", () => {
    const audience = ga4Audience(
      parseGa4Snapshot({
        ...BASE,
        daily: [
          { date: "2026-09-01", views: 10, users: 4, sessions: 6 },
          { date: "2026-09-03", views: 30, users: 9, sessions: 12 },
          { date: "2026-09-02", views: 20, users: 6, sessions: 9 },
        ],
      })!
    );

    // Latest day, not the highest day and not an average.
    expect(audience.dau).toBe(9);
    // Distinct users over the window, not 4 + 6 + 9.
    expect(audience.mau).toBe(90);
    expect(audience.stickiness).toBe(10);
    expect(audience.views7d).toBe(60);
    expect(audience.avgDailyViews).toBe(20);
  });

  it("still reports the 28-day totals when the daily series is empty", () => {
    const audience = ga4Audience(parseGa4Snapshot(BASE)!);
    expect(audience.dau).toBeNull();
    expect(audience.stickiness).toBeNull();
    expect(audience.mau).toBe(90);
    expect(audience.views28d).toBe(420);
    expect(audience.avgDailyViews).toBe(0);
  });

  it("never divides by a zero DAU or MAU", () => {
    expect(
      ga4Audience(
        parseGa4Snapshot({
          ...BASE,
          daily: [{ date: "2026-09-01", views: 1, users: 0, sessions: 1 }],
        })!
      ).stickiness
    ).toBeNull();
    expect(
      ga4Audience(
        parseGa4Snapshot({
          ...BASE,
          totals: { views: 5, users: 0, sessions: 1, newUsers: 0 },
        })!
      ).stickiness
    ).toBeNull();
  });
});
