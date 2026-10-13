import { describe, expect, it } from "vitest";
import { pickDayCardItems } from "./day-card-pick";

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
