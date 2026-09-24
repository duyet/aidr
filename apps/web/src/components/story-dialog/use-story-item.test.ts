import { describe, expect, it } from "vitest";
import { storyApiUrl } from "./use-story-item";

describe("story dialog locale requests", () => {
  it("passes the selected language explicitly for EN and VI", () => {
    expect(storyApiUrl("abcdef12", "en")).toBe("/api/story/abcdef12?lang=en");
    expect(storyApiUrl("abcdef12", "vi")).toBe("/api/story/abcdef12?lang=vi");
  });
});
