import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const row = readFileSync(join(here, "../components/StoryRow.tsx"), "utf8");
const aside = readFileSync(
  join(here, "../components/story/StoryMetaAside.tsx"),
  "utf8"
);
const thumb = readFileSync(join(here, "../components/StoryThumb.tsx"), "utf8");
const gallery = readFileSync(
  join(here, "../components/story/MediaGallery.tsx"),
  "utf8"
);

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
    // The card thumb is rendered by MediaGallery (#204), which the aside
    // mounts in the same slot above Topics. Assert the guarantee at its
    // current home: the aside owns the mount point, the gallery owns the
    // card-variant thumb.
    expect(aside).toContain("<MediaGallery");
    expect(aside).toContain("space-y-5");
    expect(aside).toContain("Chủ đề");
    expect(aside).toContain("Topics");
    expect(aside).toContain("uppercase tracking-wider");
    expect(aside).toContain("rounded-full border border-border");
    expect(gallery).toContain('variant="card"');
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
