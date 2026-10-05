import { describe, expect, it } from "vitest";
import { dayBoundsSec } from "../../src/lib/day-archive.js";
import { classifyStoryTrending, dayBounds } from "../notify/story-ranking.js";

const base = {
  rankScore: 12,
  importance: 8,
  bar: 10.5,
  publishedAtSec: 1_000_000,
  nowMs: 1_000_000_000 + 3600_000,
  localHour: 12,
  sentToday: 0,
  lastPostedAtMs: null,
  notification: null,
};
const reason = (o: object) => {
  const r = classifyStoryTrending({ ...base, ...o });
  return r.state === "not_posted" ? r.reason : r.state;
};

describe("classifyStoryTrending", () => {
  it("explains the Broadcom case: importance 8 but score under the bar", () => {
    expect(reason({ rankScore: 6.05 })).toBe("below_rank");
  });
  it("flags importance below 7 after the rank check passes", () => {
    expect(reason({ importance: 6.5 })).toBe("below_importance");
  });
  it("waits outside 09-23 local", () => {
    expect(reason({ localHour: 3 })).toBe("outside_hours");
  });
  it("reports a spent daily cap", () => {
    expect(reason({ sentToday: 3 })).toBe("budget_spent");
  });
  it("is pending when everything qualifies", () => {
    expect(reason({})).toBe("pending");
  });
  it("reports the stored post over any re-derivation", () => {
    expect(
      reason({
        rankScore: 1,
        notification: { status: "sent", attempts: 1, posted_at: 5 },
      })
    ).toBe("posted");
  });
  it("buckets 18:00 UTC into the Asia/Ho_Chi_Minh day that starts at 17:00 UTC", () => {
    const publishedAtSec = Date.parse("2026-10-05T18:00:00Z") / 1000;
    const { start, end } = dayBoundsSec("2026-10-06");
    expect(dayBounds(publishedAtSec)).toEqual([start, end]);
    expect(start).toBe(Date.parse("2026-10-05T17:00:00Z") / 1000);
  });
});
