import { describe, expect, it } from "vitest";
import { pickDayCardItems, splitDayHighlights } from "./day-card-pick";

describe("pickDayCardItems", () => {
  it("keeps rank order inside the photo group, then the text tiles", () => {
    const items = [
      { id: "text-high", image_url: null },
      { id: "photo-a", image_url: "https://cdn.example/a.jpg" },
      {
        id: "headline",
        image_url: "https://huggingnews.com/og/story.png",
      },
      { id: "photo-b", image_url: "https://cdn.example/b.jpg" },
      { id: "photo-c", image_url: "https://cdn.example/c.jpg" },
      { id: "photo-d", image_url: "https://cdn.example/d.jpg" },
      { id: "photo-e", image_url: "https://cdn.example/e.jpg" },
      { id: "photo-f", image_url: "https://cdn.example/f.jpg" },
    ];
    expect(pickDayCardItems(items).map((item) => item.id)).toEqual([
      "photo-a",
      "photo-b",
      "photo-c",
      "photo-d",
      "photo-e",
      "photo-f",
    ]);
  });

  it("keeps the lead grid to six and gives the next four their own card", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      image_url: `https://cdn.example/${i}.jpg`,
    }));
    const split = splitDayHighlights(items);
    expect(split.lead.map((item) => item.id)).toEqual([
      "s0",
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
    ]);
    expect(split.more.map((item) => item.id)).toEqual(["s6", "s7", "s8", "s9"]);
    expect(split.moreIsCard).toBe(true);
  });

  it("keeps a three-story tail as text, since three tiles are not a 2×2", () => {
    // A threshold of `>= 3` would paint this tail as a second card. The
    // ten-story day above stays a card; this one must not.
    const items = Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`,
      image_url: `https://cdn.example/${i}.jpg`,
    }));
    const split = splitDayHighlights(items);
    expect(split.lead).toHaveLength(6);
    expect(split.more.map((item) => item.id)).toEqual(["s6", "s7", "s8"]);
    expect(split.moreIsCard).toBe(false);
  });

  it("does not make a card out of a one- or two-story tail", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      image_url: `https://cdn.example/${i}.jpg`,
    }));
    const split = splitDayHighlights(items);
    expect(split.lead).toHaveLength(6);
    expect(split.more.map((item) => item.id)).toEqual(["s6", "s7"]);
    expect(split.moreIsCard).toBe(false);
  });

  it("fills a short day with text tiles after the photos", () => {
    const items = [
      { id: "text", image_url: null },
      { id: "photo", image_url: "https://cdn.example/a.jpg" },
    ];
    expect(pickDayCardItems(items).map((item) => item.id)).toEqual([
      "photo",
      "text",
    ]);
  });
});
