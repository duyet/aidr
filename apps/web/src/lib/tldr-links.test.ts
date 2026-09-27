import { describe, expect, it } from "vitest";
import { storyPath } from "./slug";
import {
  tldrAnchorStoryPaths,
  tldrCountOptions,
  tldrShownCount,
} from "./tldr-links";
import type { TldrBullet } from "./types";

const bullet = (id: string): TldrBullet => ({
  text: `Digest line for ${id}`,
  item_ids: [id],
});

describe("tldrCountOptions", () => {
  it("hides the selector at or below eight bullets", () => {
    for (const count of [0, 1, 8]) {
      expect(tldrCountOptions(count)).toEqual([]);
    }
  });

  it("caps each higher option at the number of bullets that exist", () => {
    expect(tldrCountOptions(10).map((o) => o.effective)).toEqual([8, 10]);
    expect(tldrCountOptions(16).map((o) => o.effective)).toEqual([8, 12, 16]);
  });
});

describe("tldrShownCount", () => {
  it("shows every bullet when the selector is hidden", () => {
    expect(tldrShownCount(5, 8)).toBe(5);
  });

  it("uses the stored preference when it is on offer", () => {
    expect(tldrShownCount(16, 8)).toBe(8);
    expect(tldrShownCount(16, 12)).toBe(12);
    expect(tldrShownCount(16, 16)).toBe(16);
  });

  it("falls back to the highest offered count for an off-list preference", () => {
    expect(tldrShownCount(10, 16)).toBe(10);
  });
});

describe("tldrAnchorStoryPaths", () => {
  it("returns the canonical permalink of each bullet's primary story", () => {
    const paths = tldrAnchorStoryPaths(
      [bullet("0031a3a8"), bullet("071a284c")],
      "vi"
    );
    expect(paths).toEqual([
      storyPath({ id: "0031a3a8" }, "vi"),
      storyPath({ id: "071a284c" }, "vi"),
    ]);
  });

  it("drops bullets with no primary id, the way the paint drops the anchor", () => {
    const paths = tldrAnchorStoryPaths(
      [
        { text: "No story attached", item_ids: [] },
        { text: "No ids at all" },
        bullet("bbbbbbbb"),
      ],
      "en"
    );
    expect(paths).toEqual([storyPath({ id: "bbbbbbbb" }, "en")]);
  });

  it("uses only the first id of a multi-story bullet", () => {
    const paths = tldrAnchorStoryPaths(
      [{ text: "Merged", item_ids: ["aaaaaaaa", "bbbbbbbb"] }],
      "en"
    );
    expect(paths).toEqual([storyPath({ id: "aaaaaaaa" }, "en")]);
  });
});
