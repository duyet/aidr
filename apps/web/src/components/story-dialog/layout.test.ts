import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isBilingualDialog,
  STORY_DIALOG_BODY_CLASS,
  STORY_DIALOG_CLOSE_BUTTON_CLASS,
  STORY_DIALOG_HEADER_CLASS,
  STORY_DIALOG_LIGHTBOX_OVERLAY_CLASS,
  STORY_DIALOG_OVERLAY_CLASS,
  storyDialogPanelClass,
} from "./layout";

const here = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(join(here, name), "utf8");

describe("story dialog responsive layout", () => {
  it("keeps the overlay, header, and scroll body in the viewport-safe shell", () => {
    expect(STORY_DIALOG_OVERLAY_CLASS).toContain("story-dialog-overlay");
    expect(STORY_DIALOG_OVERLAY_CLASS).toContain("overflow-hidden");
    expect(STORY_DIALOG_LIGHTBOX_OVERLAY_CLASS).toContain(
      "story-dialog-overlay"
    );
    expect(STORY_DIALOG_HEADER_CLASS).toContain("sticky top-0");
    expect(STORY_DIALOG_BODY_CLASS).toContain("overflow-y-auto");
    expect(STORY_DIALOG_BODY_CLASS).toContain("overscroll-contain");
    expect(STORY_DIALOG_CLOSE_BUTTON_CLASS).toContain("size-11");
    expect(STORY_DIALOG_CLOSE_BUTTON_CLASS).toContain("motion-reduce");
  });

  it("uses a wider desktop cap only for stories with Vietnamese text", () => {
    const bilingual = storyDialogPanelClass(isBilingualDialog(true, true));
    const noVietnamese = storyDialogPanelClass(isBilingualDialog(true, false));
    const single = storyDialogPanelClass(isBilingualDialog(false, true));

    expect(isBilingualDialog(true, true)).toBe(true);
    expect(isBilingualDialog(true, false)).toBe(false);
    expect(bilingual).toContain("max-w-2xl");
    expect(single).toContain("max-w-2xl");
    expect(noVietnamese).toContain("max-w-2xl");
    expect(bilingual).toContain("md:max-w-5xl");
    expect(bilingual).toContain("lg:max-w-6xl");
    expect(bilingual).toContain("xl:max-w-7xl");
    expect(bilingual).toContain("2xl:max-w-[88rem]");
    expect(noVietnamese).not.toContain("2xl:max-w-[88rem]");
    expect(single).not.toContain("2xl:max-w-[88rem]");
  });

  it("uses safe-area variables, dynamic viewport sizing, and a fallback", () => {
    const styles = readFileSync(join(here, "../../styles.css"), "utf8");
    const root = readFileSync(join(here, "../../routes/__root.tsx"), "utf8");

    expect(root).toContain("viewport-fit=cover");
    expect(styles).toContain("--story-dialog-inset-top");
    expect(styles).toContain("env(safe-area-inset-top, 0px)");
    expect(styles).toContain("env(safe-area-inset-bottom, 0px)");
    expect(styles).toContain("max-height: 90vh");
    expect(styles).toContain("100vh -");
    expect(styles).toContain("var(--story-dialog-inset-top)");
    expect(styles).toContain("@supports (height: 1dvh)");
    expect(styles).toContain("100dvh -");
    expect(styles).toContain("var(--story-dialog-inset-top)");
    expect(styles).toContain("var(--story-dialog-inset-bottom)");
    expect(styles).toContain("story-dialog-lightbox-panel");
  });

  it("keeps responsive width and viewport contracts across phone to wide desktop", () => {
    const classes = storyDialogPanelClass(true);
    const activeWidthClass = (width: number) => {
      if (width >= 1536) return "2xl:max-w-[88rem]";
      if (width >= 1280) return "xl:max-w-7xl";
      if (width >= 1024) return "lg:max-w-6xl";
      if (width >= 768) return "md:max-w-5xl";
      if (width >= 640) return "sm:max-w-3xl";
      return "max-w-2xl";
    };
    const styles = readFileSync(join(here, "../../styles.css"), "utf8");

    for (const width of [390, 640, 768, 1024, 1280, 1536, 1920]) {
      expect(classes).toContain(activeWidthClass(width));
    }
    expect(styles).toContain("100dvh -");
    expect(styles).toContain("100vh -");
    expect(styles).toContain("overscroll-behavior: contain");
  });

  it("keeps bilingual columns stacked through tablet and landscape widths", () => {
    const summary = readComponent("../story/BilingualSummary.tsx");
    const styles = readFileSync(join(here, "../../styles.css"), "utf8");

    expect(summary).toContain("lg:grid-cols-2");
    expect(summary).not.toContain("md:grid-cols-2");
    expect(styles).toContain("@media (min-width: 640px)");
    expect(styles).toContain("@media (min-width: 1024px)");
    expect(styles).toContain("max(1.5rem, env(safe-area-inset-top, 0px))");
    expect(styles).toContain("max(2rem, env(safe-area-inset-top, 0px))");
  });

  it("wires containment, inerting, nested Escape, and the wider rail", () => {
    const dialog = readComponent("../StoryDialog.tsx");
    const detail = readComponent("../StoryDetail.tsx");
    const summary = readComponent("../story/BilingualSummary.tsx");
    const thumb = readComponent("../StoryThumb.tsx");
    const lifecycle = readComponent("use-dialog-lifecycle.ts");

    expect(dialog).toContain("className={STORY_DIALOG_HEADER_CLASS}");
    expect(dialog).toContain("className={STORY_DIALOG_BODY_CLASS}");
    expect(dialog).toContain("tabIndex={-1}");
    expect(dialog).toContain("isBilingualDialog(prefs.bilingualDialog, hasVi)");
    expect(detail).toContain("md:grid-cols-[minmax(0,1fr)_240px]");
    expect(summary).toContain("lg:grid-cols-2");
    expect(summary).not.toContain("md:grid-cols-2");
    expect(thumb).toContain("useDialogLifecycle(onClose, overlayRef)");
    expect(thumb).toContain("tabIndex={-1}");
    expect(thumb).toContain("motion-reduce:transition-none");
    expect(lifecycle).toContain("modalStack");
    expect(lifecycle).toContain("inertBackground");
    expect(lifecycle).toContain("focusWithinTopModal");
    expect(lifecycle).toContain("bodyLockCount");
    expect(lifecycle).toContain("entry.onEscape()");
  });
});
