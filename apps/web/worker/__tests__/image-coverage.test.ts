import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  evaluateImageCoverage,
  IMAGE_COVERAGE_MIN_ITEMS,
  IMAGE_COVERAGE_SQL,
  type ImageCoverageRow,
  imageCoverageKey,
} from "../image-coverage.js";

const row = (over: Partial<ImageCoverageRow>): ImageCoverageRow => ({
  source: "marketbrief",
  items24h: 20,
  usable24h: 20,
  items7d: 140,
  usable7d: 140,
  ...over,
});

describe("evaluateImageCoverage", () => {
  it("alerts when an image-heavy source loses its images", () => {
    const issues = evaluateImageCoverage(
      [row({ usable24h: 2, usable7d: 130 })],
      new Set()
    );
    expect(issues.map((i) => i.key)).toEqual([imageCoverageKey("marketbrief")]);
    expect(issues[0].evidence?.[0]).toContain("2/20");
  });

  it("stays quiet for a source with naturally low coverage", () => {
    const issues = evaluateImageCoverage(
      [
        row({
          source: "hf-papers",
          items24h: 8,
          usable24h: 0,
          items7d: 32,
          usable7d: 17,
        }),
        row({
          source: "arxiv-research",
          items24h: 6,
          usable24h: 0,
          items7d: 24,
          usable7d: 9,
        }),
      ],
      new Set()
    );
    expect(issues).toEqual([]);
  });

  it("ignores a small 24h sample however bad it looks", () => {
    const issues = evaluateImageCoverage(
      [
        row({
          items24h: IMAGE_COVERAGE_MIN_ITEMS - 1,
          usable24h: 0,
          usable7d: 140,
        }),
      ],
      new Set()
    );
    expect(issues).toEqual([]);
  });

  it("ignores a source with too few items in 7 days to have a baseline", () => {
    const issues = evaluateImageCoverage(
      [row({ items24h: 5, usable24h: 0, items7d: 10, usable7d: 10 })],
      new Set()
    );
    expect(issues).toEqual([]);
  });

  it("does not alert on a dip that is still above half the baseline", () => {
    const issues = evaluateImageCoverage(
      [row({ items24h: 20, usable24h: 11, usable7d: 140 })],
      new Set()
    );
    expect(issues).toEqual([]);
  });

  it("does not alert again while the key is in the last 24h of alerts", () => {
    const collapsed = row({ usable24h: 0, usable7d: 130 });
    expect(evaluateImageCoverage([collapsed], new Set())).toHaveLength(1);
    expect(
      evaluateImageCoverage(
        [collapsed],
        new Set([imageCoverageKey("marketbrief")])
      )
    ).toEqual([]);
  });
});

describe("IMAGE_COVERAGE_SQL", () => {
  it("counts image_url, manifest images and video posters, not bare videos", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE items (
        source_id TEXT, status TEXT, published_at INTEGER,
        image_url TEXT, media_manifest TEXT NOT NULL DEFAULT '[]')`);
      const insert = db.prepare(
        "INSERT INTO items VALUES ('s', ?, unixepoch('now', ?), ?, ?)"
      );
      const manifest = (asset: object) =>
        JSON.stringify({ version: 1, assets: [asset] });
      insert.run("published", "-1 hours", "https://x/a.jpg", "[]");
      insert.run(
        "published",
        "-2 hours",
        null,
        manifest({ type: "image", url: "https://x/b.jpg" })
      );
      insert.run(
        "published",
        "-3 hours",
        null,
        manifest({
          type: "video",
          url: "https://x/v",
          poster_url: "https://x/p.jpg",
        })
      );
      insert.run(
        "published",
        "-4 hours",
        null,
        manifest({ type: "video", url: "https://x/v2" })
      );
      insert.run("published", "-5 hours", "", "[]");
      insert.run("published", "-3 days", null, "not json");
      insert.run("merged", "-1 hours", "https://x/c.jpg", "[]");
      insert.run("published", "-9 days", "https://x/d.jpg", "[]");

      const rows = db.prepare(IMAGE_COVERAGE_SQL).all();
      expect(rows).toEqual([
        { source: "s", items24h: 5, usable24h: 3, items7d: 6, usable7d: 3 },
      ]);
    } finally {
      db.close();
    }
  });
});
