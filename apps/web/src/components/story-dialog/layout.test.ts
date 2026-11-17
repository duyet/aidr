import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIEWPORT_META_CONTENT } from "../../lib/viewport";
import {
  isBilingualDialog,
  STORY_DIALOG_BODY_CLASS,
  STORY_DIALOG_CLOSE_BUTTON_CLASS,
  STORY_DIALOG_HEADER_CLASS,
  STORY_DIALOG_LIGHTBOX_OVERLAY_CLASS,
  storyDialogPanelClass,
} from "./layout";

const here = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(join(here, name), "utf8");

describe("story dialog responsive layout", () => {
  it("keeps the header fixed and the body the only scroller", () => {
    expect(STORY_DIALOG_HEADER_CLASS).toContain("shrink-0");
    expect(STORY_DIALOG_BODY_CLASS).toContain("overflow-y-auto");
    expect(STORY_DIALOG_BODY_CLASS).toContain("overscroll-contain");
    expect(STORY_DIALOG_BODY_CLASS).toContain("min-h-0");
    expect(STORY_DIALOG_CLOSE_BUTTON_CLASS).toContain("size-11");
    expect(STORY_DIALOG_CLOSE_BUTTON_CLASS).toContain("motion-reduce");
    expect(STORY_DIALOG_LIGHTBOX_OVERLAY_CLASS).toContain(
      "story-dialog-overlay"
    );
  });

  it("sizes a side panel and a bottom sheet from the drawer's own side", () => {
    const panel = storyDialogPanelClass(false);
    expect(panel).toContain("data-[side=right]:w-[min(520px,100vw)]");
    expect(panel).toContain("data-[side=right]:h-full");
    expect(panel).toContain("data-[side=bottom]:max-h-[92dvh]");
    expect(panel).toContain("data-[side=bottom]:w-full");
    expect(panel).toContain("data-[side=bottom]:rounded-t-2xl");
  });

  it("widens the side panel only for the side-by-side Vietnamese view", () => {
    expect(isBilingualDialog(true, true)).toBe(true);
    expect(isBilingualDialog(true, false)).toBe(false);
    expect(isBilingualDialog(false, true)).toBe(false);
    const wide = storyDialogPanelClass(isBilingualDialog(true, true));
    const narrow = storyDialogPanelClass(isBilingualDialog(true, false));
    expect(wide).toContain("data-[side=right]:w-[min(980px,100vw)]");
    expect(wide).not.toContain("min(520px,100vw)");
    expect(narrow).toContain("data-[side=right]:w-[min(520px,100vw)]");
    expect(narrow).not.toContain("min(980px,100vw)");
  });

  it("keeps the image zoom inside the viewport with safe-area insets and a dvh height", () => {
    const styles = readFileSync(join(here, "../../styles.css"), "utf8");
    const root = readFileSync(join(here, "../../routes/__root.tsx"), "utf8");

    expect(root).not.toContain("viewport-fit=cover");
    expect(root).toContain("content: VIEWPORT_META_CONTENT");
    expect(VIEWPORT_META_CONTENT).toBe("width=device-width, initial-scale=1.0");
    expect(styles).toContain("--story-dialog-inset-top");
    expect(styles).toContain("env(safe-area-inset-top, 0px)");
    expect(styles).toContain("env(safe-area-inset-bottom, 0px)");

    const supportsIndex = styles.indexOf("@supports (height: 1dvh)");
    const fallback = styles.slice(0, supportsIndex);
    const dynamicViewport = styles.slice(supportsIndex);
    expect(supportsIndex).toBeGreaterThan(-1);
    expect(fallback).toContain("90vh -");
    expect(fallback).not.toContain("100dvh");
    expect(dynamicViewport).toContain("100dvh -");
    expect(styles).toContain("story-dialog-lightbox-panel");
  });

  it("keeps bilingual columns stacked through tablet and landscape widths", () => {
    const summary = readComponent("../story/BilingualSummary.tsx");

    expect(summary).toContain("lg:grid-cols-2");
    expect(summary).not.toContain("md:grid-cols-2");
  });
});
