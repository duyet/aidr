import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const row = readFileSync(join(here, "../components/StoryRow.tsx"), "utf8");
const detail = readFileSync(
  join(here, "../components/StoryDetail.tsx"),
  "utf8"
);
const thumb = readFileSync(join(here, "../components/StoryThumb.tsx"), "utf8");

describe("expanded story panel chrome", () => {
  it("sits flush under the row: flat top, no extra margin or shadow", () => {
    expect(row).toContain(
      'className="overflow-hidden rounded-b-2xl border border-border/70 bg-card px-5 py-5 md:px-6 md:py-6"'
    );
    expect(row).not.toContain("mb-3 overflow-hidden rounded-2xl");
    expect(row).not.toContain("shadow-sm");
    expect(row).not.toContain("md:mx-4");
  });
});

describe("topics column", () => {
  it("uses a large rounded card thumb above an uppercase Topics heading", () => {
    expect(detail).toContain('variant="card"');
    expect(detail).toContain("space-y-5");
    expect(detail).toContain("Chủ đề");
    expect(detail).toContain("Topics");
    expect(detail).toContain("uppercase tracking-wider");
    expect(detail).toContain("rounded-full border border-border");
    expect(thumb).toContain("rounded-3xl");
  });
});

describe("thumb zoom affordance", () => {
  it("shows overlay + icon on hover/focus for zoomable thumbs only", () => {
    expect(thumb).toContain("cursor-zoom-in");
    expect(thumb).toContain("Maximize2");
    expect(thumb).toContain("group-hover:bg-black/40");
    expect(thumb).toContain("group-focus-visible:bg-black/40");
    expect(thumb).toContain("if (!zoomSrc) return img");
  });
});
