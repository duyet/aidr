import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  STORY_DIALOG_BODY_CLASS,
  STORY_DIALOG_HEADER_CLASS,
  STORY_DIALOG_OVERLAY_CLASS,
  storyDialogPanelClass,
} from "./layout";

const here = dirname(fileURLToPath(import.meta.url));
const readComponent = (name: string) => readFileSync(join(here, name), "utf8");

describe("story dialog responsive layout", () => {
  it("keeps the overlay, header, and scroll body in the viewport-safe shell", () => {
    expect(STORY_DIALOG_OVERLAY_CLASS).toContain("overflow-hidden");
    expect(STORY_DIALOG_OVERLAY_CLASS).toContain("p-4");
    expect(STORY_DIALOG_OVERLAY_CLASS).toContain("sm:p-6");
    expect(STORY_DIALOG_OVERLAY_CLASS).toContain("lg:p-8");
    expect(STORY_DIALOG_OVERLAY_CLASS).toContain("2xl:p-10");
    expect(STORY_DIALOG_HEADER_CLASS).toContain("sticky top-0");
    expect(STORY_DIALOG_BODY_CLASS).toContain("overflow-y-auto");
    expect(STORY_DIALOG_BODY_CLASS).toContain("overscroll-contain");
  });

  it("uses a wider desktop cap for the bilingual reader", () => {
    const bilingual = storyDialogPanelClass(true);
    const single = storyDialogPanelClass(false);

    expect(bilingual).toContain("max-w-2xl");
    expect(single).toContain("max-w-2xl");
    expect(bilingual).toContain("md:max-w-5xl");
    expect(bilingual).toContain("lg:max-w-6xl");
    expect(bilingual).toContain("xl:max-w-7xl");
    expect(bilingual).toContain("2xl:max-w-[88rem]");
    expect(single).toContain("lg:max-w-5xl");
    expect(single).toContain("xl:max-w-6xl");
    expect(single).not.toContain("2xl:max-w-[88rem]");
  });

  it("keeps dynamic viewport sizing with a conservative fallback", () => {
    const styles = readFileSync(join(here, "../../styles.css"), "utf8");
    const panelRule = styles.match(
      /\.story-dialog-panel\s*\{[\s\S]*?\n\}/
    )?.[0];

    expect(panelRule).toContain("max-height: 90vh");
    expect(styles).toContain("@supports (height: 1dvh)");
    expect(styles).toContain("max-height: calc(100dvh - 2rem)");
    expect(styles).toContain("max-height: calc(100dvh - 3rem)");
    expect(styles).toContain("max-height: calc(100dvh - 4rem)");
    expect(styles).toContain("max-height: calc(100dvh - 5rem)");
  });

  it("wires the body wrapper without dropping dialog lifecycle hooks", () => {
    const dialog = readComponent("../StoryDialog.tsx");
    const detail = readComponent("../StoryDetail.tsx");
    const lifecycle = readComponent("use-dialog-lifecycle.ts");

    expect(dialog).toContain("className={STORY_DIALOG_HEADER_CLASS}");
    expect(dialog).toContain("className={STORY_DIALOG_BODY_CLASS}");
    expect(dialog).toContain("useDialogLifecycle(onClose)");
    expect(detail).toContain("md:grid-cols-[minmax(0,1fr)_240px]");
    expect(lifecycle).toContain('document.body.style.overflow = "hidden"');
    expect(lifecycle).toContain('if (e.key === "Escape") onClose()');
    expect(lifecycle).toContain("trigger.focus()");
  });
});
