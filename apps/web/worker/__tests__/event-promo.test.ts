import { describe, expect, it, vi } from "vitest";

const tc = (slug: string) => `https://techcrunch.com/2026/10/09/${slug}/`;

const promo = (title: string) => ({
  url: tc("promo"),
  title,
  publishedAt: 1_000,
  points: 0,
  comments: 0,
});

vi.mock("../sources/rss.js", async (orig) => ({
  ...(await orig<typeof import("../sources/rss.js")>()),
  rssAdapter: {
    type: "rss",
    fetchItems: async () => [
      promo("Save 50% on your TechCrunch Disrupt 2026 ticket"),
      promo("Anthropic is letting METR researchers look under the hood"),
    ],
  },
}));

import { isEventPromo } from "../sources/event-promo.js";
import { adapters } from "../sources/registry.js";

describe("isEventPromo", () => {
  it.each([
    "Save 50% on your TechCrunch Disrupt 2026 ticket and join the last two days in San Francisco’s Moscone West",
    "TechCrunch Disrupt 2026 starts tomorrow: Your final chance to secure up to $100 ticket savings",
    "TechCrunch Disrupt 2026 starts in 4 days — lock in your pass savings of up to $100 before prices rise",
    "Affected by layoffs? Don’t miss this $75 deal for your TechCrunch Disrupt 2026 Expo+ Pass",
    "6 days to TechCrunch Disrupt 2026: Save on your pass before doors open",
    "5 days to TechCrunch Disrupt 2026: Don’t pay more at the door for your pass",
    "48 hours to TechCrunch Disrupt 2026 — hear directly from the people building what’s next",
    "Last 24 hours: Exhibit at TechCrunch Disrupt 2026 and reach 10,000+ tech leaders",
    "Last chance to save up to $200 on your TechCrunch Founder Summit pass: Early booking ends October 16",
  ])("drops the production promo %s", (title) => {
    expect(isEventPromo({ title, url: tc("x") })).toBe(true);
  });

  it("drops anything under techcrunch.com/events/", () => {
    expect(
      isEventPromo({
        title: "Disrupt 2026",
        url: "https://techcrunch.com/events/tc-disrupt-2026/",
      })
    ).toBe(true);
  });

  it.each([
    "OpenAI’s Alexander Embiricos is coming to TechCrunch Disrupt 2026 — days after the launch of Dots",
    "Open or closed AI? How founders are choosing what to build on at TechCrunch Disrupt 2026",
    "TechCrunch Disrupt 2026: Day 1",
    "TechCrunch Disrupt 2026: Clay’s Kareem Amin on the rise of the GTM engineer",
    "Taylor Swift ticket resale bots are an AI arms race",
    "Anthropic says the pass rate on its new eval doubled",
  ])("keeps the TechCrunch story %s", (title) => {
    expect(isEventPromo({ title, url: tc("x") })).toBe(false);
  });

  it.each([
    [
      "Arrested OpenAI Bugging Suspect Had One Way Tickets to Saudi Arabia",
      "https://huggingnews.com/cybersecurity/arrested-one-way-tickets",
    ],
    ["Save 50% on Claude API tickets", "https://example.com/save-50"],
    [
      "Tesla Registers 43 Cybercabs in 18 Hours to Expand Texas Fleet",
      "https://huggingnews.com/tech/tesla-registers",
    ],
  ])("keeps %s from outside techcrunch.com", (title, url) => {
    expect(isEventPromo({ title, url })).toBe(false);
  });

  it("does not match a lookalike host", () => {
    expect(
      isEventPromo({
        title: "Save 50% on your Disrupt ticket",
        url: "https://nottechcrunch.com/a",
      })
    ).toBe(false);
  });
});

describe("rss adapter output", () => {
  it("never hands a promo to dedupe or the scorer", async () => {
    const out = await adapters.rss.fetchItems({}, 0);
    expect(out.map((i) => i.title)).toEqual([
      "Anthropic is letting METR researchers look under the hood",
    ]);
  });
});
