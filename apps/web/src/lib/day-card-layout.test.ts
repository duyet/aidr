import { describe, expect, it } from "vitest";
import {
  chooseDayCardLayout,
  type DayCardLayout,
  type DayCardStory,
  layoutStories,
} from "./day-card-layout";
import type { StoryOgImage } from "./story-og";

const PHOTO: StoryOgImage = {
  dataUri: "data:image/png;base64,AAAA",
  mimeType: "image/png",
  byteLength: 3,
  width: 400,
  height: 300,
};

/** One story per character: "P" has a photo that loaded, "-" does not. */
function stories(pattern: string): DayCardStory[] {
  return [...pattern].map((ch, i) => ({
    id: `s${i + 1}`,
    rank: i + 1,
    title: `Story ${i + 1}`,
    kicker: "",
    image: ch === "P" ? PHOTO : null,
  }));
}

/** Slot names to ranks, e.g. { lead: [1], tiles: [2, 3], rows: [4] }. */
function slots(layout: DayCardLayout): Record<string, number[] | boolean> {
  const ranks = (list: readonly DayCardStory[]) => list.map((s) => s.rank);
  switch (layout.variant) {
    case "empty":
      return { pending: layout.pending };
    case "single":
      return { lead: [layout.lead.rank] };
    case "split":
      return { pair: ranks(layout.pair) };
    case "mosaic":
      return {
        lead: [layout.lead.rank],
        tiles: ranks(layout.tiles),
        rows: ranks(layout.rows),
      };
    case "lead-list":
    case "headlines":
      return { lead: [layout.lead.rank], rows: ranks(layout.rows) };
  }
}

const fit = () => true;

describe("chooseDayCardLayout", () => {
  it.each([
    // A day with nothing: today waits for stories, a past day says so.
    ["", true, "empty", { pending: true }],
    ["", false, "empty", { pending: false }],
    // One story is a poster, with or without its photo.
    ["P", false, "single", { lead: [1] }],
    ["-", true, "single", { lead: [1] }],
    // Two photos side by side; two stories with one photo is a lead and a row.
    ["PP", false, "split", { pair: [1, 2] }],
    ["P-", false, "lead-list", { lead: [1], rows: [2] }],
    // Photos scarce: the lead keeps its photo, the rest is a ruled list.
    ["P--", false, "lead-list", { lead: [1], rows: [2, 3] }],
    ["PP----", false, "lead-list", { lead: [1], rows: [2, 3, 4, 5, 6] }],
    // Photo-rich: two tiles beside the lead, or a 2×2 block with four.
    ["PPP", false, "mosaic", { lead: [1], tiles: [2, 3], rows: [] }],
    ["PPPP", false, "mosaic", { lead: [1], tiles: [2, 3], rows: [4] }],
    ["PPPPP", false, "mosaic", { lead: [1], tiles: [2, 3, 4, 5], rows: [] }],
    ["PPPPPP", false, "mosaic", { lead: [1], tiles: [2, 3, 4, 5], rows: [6] }],
    ["PPP---", false, "mosaic", { lead: [1], tiles: [2, 3], rows: [4, 5, 6] }],
    // The lead's photo failed: a typographic poster, whatever loaded below.
    ["------", false, "headlines", { lead: [1], rows: [2, 3, 4, 5, 6] }],
    ["-PPPPP", false, "headlines", { lead: [1], rows: [2, 3, 4, 5, 6] }],
  ] as const)("%s (today=%s) → %s", (pattern, today, variant, expected) => {
    const layout = chooseDayCardLayout(stories(pattern), today, fit);
    expect(layout.variant).toBe(variant);
    expect(slots(layout)).toEqual(expected);
  });

  it("never moves a later photo above a story whose photo failed", () => {
    // Photo 3 failed: tiles take only the unbroken run, so 4–6 stay below 3
    // as rows (with their thumbnails) and the reading order is the digest's.
    const layout = chooseDayCardLayout(stories("PP-PPP"), false, fit);
    expect(layout.variant).toBe("lead-list");
    expect(layoutStories(layout).map((s) => s.rank)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("moves stories from the 2×2 block to rows when their headlines don't fit it", () => {
    // Fewer tiles, same stories: a six-story day still shows all six, in rank
    // order, rather than shrinking the tile type below the readable floor.
    const layout = chooseDayCardLayout(stories("PPPPPP"), false, () => false);
    expect(slots(layout)).toEqual({
      lead: [1],
      tiles: [2, 3],
      rows: [4, 5, 6],
    });
  });

  it("puts every story on the card exactly once, in digest order", () => {
    for (const pattern of ["P", "PP", "P-P", "PPPP-P", "-P-P-P", "PPPPPP"]) {
      const input = stories(pattern);
      const layout = chooseDayCardLayout(input, false, fit);
      expect(layoutStories(layout).map((s) => s.id)).toEqual(
        input.map((s) => s.id)
      );
    }
  });
});
