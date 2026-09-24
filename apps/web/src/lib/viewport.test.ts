import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIEWPORT_META_CONTENT } from "./viewport";

const here = dirname(fileURLToPath(import.meta.url));

describe("viewport metadata", () => {
  it("keeps the document in the browser's default safe viewport", () => {
    expect(VIEWPORT_META_CONTENT).toBe("width=device-width, initial-scale=1.0");
    expect(VIEWPORT_META_CONTENT).not.toContain("viewport-fit=cover");
  });

  it("wires the root document head to the shared viewport value", () => {
    const root = readFileSync(join(here, "../routes/__root.tsx"), "utf8");
    expect(root).toContain("content: VIEWPORT_META_CONTENT");
  });

  it("does not add cover-mode insets that would bypass existing fixed portals", () => {
    const styles = readFileSync(join(here, "../styles.css"), "utf8");
    expect(styles).not.toContain("viewport-fit=cover");
    expect(styles).not.toContain("safe-area-inset");
  });
});
