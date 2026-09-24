import { describe, expect, it } from "vitest";
import { localizePublicDigest } from "./public-api";
import type { PublicDigest } from "./public-queries";

const digest: PublicDigest = {
  tldr: null,
  stories: [
    {
      id: "abcdef1234567890",
      url: "https://example.com/story",
      title: "Story",
      title_vi: "Tin",
      category: "Research",
      image_url: null,
      published_at: 1_787_000_000,
    },
  ],
  updatedAt: 1,
};

describe("public API locale links", () => {
  it("returns exact Vietnamese and English story permalinks", () => {
    expect(localizePublicDigest(digest, "vi").stories[0].permalink).toBe(
      "https://aidr.today/abcdef12?lang=vi"
    );
    expect(localizePublicDigest(digest, "en").stories[0].permalink).toBe(
      "https://aidr.today/abcdef12?lang=en"
    );
    expect(localizePublicDigest(digest, "en").lang).toBe("en");
  });
});
