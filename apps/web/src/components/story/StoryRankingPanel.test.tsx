import { describe, expect, it } from "vitest";
import { rankingRequestPath } from "./StoryRankingPanel";

// storyPath already returns /{id}?lang=. Concatenating "?ranking=1" puts the
// second "?" inside the lang value, so the route never sees ranking=1 and the
// panel stays on "Could not load ranking details."
describe("rankingRequestPath", () => {
  const item = { id: "abcdef12deadbeef" };

  it("keeps lang=vi and ranking=1 as separate parameters", () => {
    const path = rankingRequestPath(item, "vi");
    const url = new URL(path, "https://aidr.today");
    expect(url.pathname).toBe("/api/story/abcdef12");
    expect(url.searchParams.get("lang")).toBe("vi");
    expect(url.searchParams.get("ranking")).toBe("1");
    expect(path).not.toContain("?lang=vi?");
    expect(path.split("?").length).toBe(2);
  });

  it("keeps lang=en and ranking=1 as separate parameters", () => {
    const path = rankingRequestPath(item, "en");
    const url = new URL(path, "https://aidr.today");
    expect(url.pathname).toBe("/api/story/abcdef12");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("ranking")).toBe("1");
    expect(path).not.toContain("?lang=vi?");
    expect(path.split("?").length).toBe(2);
  });
});
