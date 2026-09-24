import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIEWPORT_META_CONTENT } from "./viewport";

const here = dirname(fileURLToPath(import.meta.url));

describe("viewport metadata", () => {
  it("opts into the safe-area viewport used by the app shell", () => {
    expect(VIEWPORT_META_CONTENT).toBe(
      "width=device-width, initial-scale=1, viewport-fit=cover"
    );
  });

  it("wires the root document head to the shared viewport value", () => {
    const root = readFileSync(join(here, "../routes/__root.tsx"), "utf8");
    expect(root).toContain("content: VIEWPORT_META_CONTENT");
  });

  it("applies shell/header insets once and leaves the portal dialog as the only bottom inset", () => {
    const styles = readFileSync(join(here, "../styles.css"), "utf8");
    expect(styles).toContain(".app-shell {");
    expect(styles).toContain("padding-left: env(safe-area-inset-left, 0px)");
    expect(styles).toContain("padding-right: env(safe-area-inset-right, 0px)");
    expect(styles).toContain(
      "padding-bottom: env(safe-area-inset-bottom, 0px)"
    );
    expect(styles).toContain(".news-content > header {");
    expect(styles).toContain("padding-top: env(safe-area-inset-top, 0px)");
    expect(styles).not.toContain(".news-mobile-menu-footer");
  });
});
