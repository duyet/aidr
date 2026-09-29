import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMPACT_CHROME_CLASS,
  PHONE_DROPDOWN_ITEM_CLASS,
  PHONE_GET_AIDR_TRIGGER_CLASS,
  PHONE_LANG_TOGGLE_BUTTON_CLASS,
  PHONE_LANG_TOGGLE_CONTAINER_CLASS,
  PHONE_MENU_BODY_CLASS,
  PHONE_MENU_DIALOG_CLASS,
  PHONE_MENU_FOOTER_CLASS,
  PHONE_MENU_GRID_CLASS,
  PHONE_MENU_LINK_CLASS,
  PHONE_PREFS_TRIGGER_CLASS,
  PHONE_TAP_TARGET_CLASS,
  WIDE_CHROME_CLASS,
  WIDE_HEADER_ROW_CLASS,
} from "./chrome";

describe("phone chrome", () => {
  it("requires 44px tap targets on phone controls", () => {
    expect(PHONE_TAP_TARGET_CLASS).toContain("min-h-[44px]");
    expect(PHONE_TAP_TARGET_CLASS).toContain("min-w-[44px]");
    expect(PHONE_TAP_TARGET_CLASS).toContain("h-11");
    expect(PHONE_TAP_TARGET_CLASS).toContain("w-11");
    expect(PHONE_TAP_TARGET_CLASS).toContain("p-0");
    expect(PHONE_TAP_TARGET_CLASS).toContain("[&_svg]:size-5");
    expect(PHONE_PREFS_TRIGGER_CLASS).toContain("min-h-[44px]");
    expect(PHONE_PREFS_TRIGGER_CLASS).toContain("p-0");
  });

  it("keeps wide and compact chrome on separate class hooks", () => {
    expect(WIDE_CHROME_CLASS).toBe("news-wide-chrome");
    expect(COMPACT_CHROME_CLASS).toBe("news-compact-chrome");
    expect(WIDE_HEADER_ROW_CLASS).toBe("news-wide-row");
    expect(WIDE_CHROME_CLASS).not.toBe(COMPACT_CHROME_CLASS);
  });
});

describe("mobile header action contracts", () => {
  it("keeps the Get AI;DR trigger compact, tappable, and stateful", () => {
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("h-11");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("w-11");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("min-h-[44px]");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("min-w-[44px]");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("hover:bg-muted");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain(
      "data-[state=open]:bg-muted"
    );
  });

  it("keeps the mobile Get AI;DR logo idle, with no circle fill, border, or shadow", () => {
    // Idle must match the prefs trigger and hamburger: no gray circle behind logo+chevron.
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).not.toContain("bg-muted/60");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).not.toContain("border-border");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).not.toContain("shadow-sm");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).not.toMatch(/(^|\s)bg-/);
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).not.toMatch(/(^|\s)shadow-/);
  });

  it("raises compact dropdown and language controls to 44px or more", () => {
    expect(PHONE_DROPDOWN_ITEM_CLASS).toContain("h-11");
    expect(PHONE_DROPDOWN_ITEM_CLASS).toContain("min-h-11");
    expect(PHONE_DROPDOWN_ITEM_CLASS).toContain("min-w-[44px]");
    // The drawer's language halves are 56px, past the 44px floor.
    expect(PHONE_LANG_TOGGLE_BUTTON_CLASS).toContain("min-h-14");
    expect(PHONE_LANG_TOGGLE_BUTTON_CLASS).toContain("min-w-[44px]");
    expect(PHONE_LANG_TOGGLE_CONTAINER_CLASS).toContain("grid-cols-2");
    expect(PHONE_LANG_TOGGLE_CONTAINER_CLASS).toContain("w-full");
  });

  it("lays the phone menu out as a two-column grid of large tiles", () => {
    expect(PHONE_MENU_DIALOG_CLASS).toContain("fixed");
    expect(PHONE_MENU_DIALOG_CLASS).toContain("inset-3");
    expect(PHONE_MENU_DIALOG_CLASS).toContain("min-[600px]:inset-4");
    expect(PHONE_MENU_DIALOG_CLASS).not.toContain("news-mobile-menu-dialog");
    // Two columns at every phone width: nine full-width rows buried half the
    // menu behind a scroll gesture.
    expect(PHONE_MENU_GRID_CLASS).toContain("grid-cols-2");
    expect(PHONE_MENU_GRID_CLASS).not.toContain("grid-cols-1");
    // `auto-rows-min`, not `auto-rows-fr`: at 320x568 a bare `1fr` shrinks each
    // row below its tile and the tiles overlap. A minmax() custom value was
    // tried and Tailwind never generated it, so it was silently inert.
    expect(PHONE_MENU_GRID_CLASS).toContain("auto-rows-min");
    expect(PHONE_MENU_GRID_CLASS).not.toContain("auto-rows-fr");
    expect(PHONE_MENU_GRID_CLASS).not.toContain("minmax(");
    expect(PHONE_MENU_GRID_CLASS).toContain("min-h-0");
    expect(PHONE_MENU_GRID_CLASS).toContain("overflow-y-auto");
    // A tile, not a list row: column layout, icon over label.
    expect(PHONE_MENU_LINK_CLASS).toContain("flex-col");
    expect(PHONE_MENU_LINK_CLASS).toContain("items-center");
    expect(PHONE_MENU_LINK_CLASS).toContain("min-h-24");
    expect(PHONE_MENU_LINK_CLASS).toContain("min-[600px]:min-h-28");
    expect(PHONE_MENU_LINK_CLASS).toContain("min-[600px]:text-[0.9375rem]");
    expect(PHONE_MENU_LINK_CLASS).toContain("min-[600px]:[&_svg]:size-7");
    expect(PHONE_MENU_LINK_CLASS).toContain(
      "focus-visible:ring-3 focus-visible:ring-ring/30"
    );
  });

  it("puts the settings column beside the grid in landscape", () => {
    // A 375px-tall phone stacked leaves the grid about one row tall, forcing a
    // scroll to reach a link.
    expect(PHONE_MENU_BODY_CLASS).toContain("flex-col");
    expect(PHONE_MENU_BODY_CLASS).toContain("min-[600px]:flex-row");
    expect(PHONE_MENU_FOOTER_CLASS).toContain("border-t");
    expect(PHONE_MENU_FOOTER_CLASS).toContain("min-[600px]:border-l");
    expect(PHONE_MENU_FOOTER_CLASS).toContain("min-[600px]:border-t-0");
  });
});

describe("compact header icon buttons", () => {
  it("uses 44px icon-lg taps with even gaps, not 36px icon size", () => {
    const headerDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "../components/header"
    );
    const header = readFileSync(join(headerDir, "CompactRow.tsx"), "utf8");
    const menuPath = join(headerDir, "GetAIDRMenu.tsx");
    const menu = existsSync(menuPath) ? readFileSync(menuPath, "utf8") : "";
    const compact = header.slice(header.lastIndexOf("COMPACT_CHROME_CLASS"));
    const compactControls = `${compact}\n${menu}`;
    expect(compactControls).toContain('"icon-lg"');
    // The phone trigger now goes through PHONE_GET_AIDR_TRIGGER_CLASS, which
    // composes the 44px tap target (see chrome.ts). Assert both the wiring and
    // the composition, so renaming the constant cannot silently drop the size.
    expect(compactControls).toContain("PHONE_GET_AIDR_TRIGGER_CLASS");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain(PHONE_TAP_TARGET_CLASS);
    expect(compact).toContain("items-center gap-1");
    expect(compactControls).not.toMatch(/size="icon"(?!-lg)/);
  });

  it("uses the shared Get AI;DR dropdown without direct channel icons", () => {
    const headerDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "../components/header"
    );
    const compact = readFileSync(join(headerDir, "CompactRow.tsx"), "utf8");
    const wide = readFileSync(join(headerDir, "WideRow.tsx"), "utf8");
    const menuPath = join(headerDir, "GetAIDRMenu.tsx");
    const menu = existsSync(menuPath) ? readFileSync(menuPath, "utf8") : "";

    expect(compact).toContain('from "./GetAIDRMenu"');
    expect(compact).toContain("<GetAIDRMenu compact />");
    expect(compact).not.toContain("<RiChromeLine");
    expect(compact).not.toContain("<Send");
    expect(compact).not.toContain('aria-label="Telegram"');
    expect(wide).toContain('from "./GetAIDRMenu"');
    expect(wide).toContain("<GetAIDRMenu />");
    expect(menu).toContain("Chrome Extension");
    expect(menu).toContain("Telegram Channel (Vietnamese)");
    expect(menu).toContain("Telegram Channel (English)");
    expect(menu).toContain("TELEGRAM_EN_URL");
    expect(menu).toContain("Email Subscription");
  });
});
