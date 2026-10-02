import { describe, expect, it } from "vitest";
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
  it("splits UTC days like the homepage grouping", () => {
    expect(dayBounds(86400 + 5)).toEqual([86400, 172800]);
  });
});
