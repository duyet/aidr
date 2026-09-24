import { describe, expect, it } from "vitest";
import {
  COMPACT_CHROME_CLASS,
  PHONE_DROPDOWN_ITEM_CLASS,
  PHONE_GET_AIDR_TRIGGER_CLASS,
  PHONE_LANG_TOGGLE_BUTTON_CLASS,
  PHONE_MENU_DIALOG_CLASS,
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
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("bg-muted/60");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("hover:bg-muted");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain(
      "data-[state=open]:bg-muted"
    );
  });

  it("raises compact dropdown and language controls to 44px", () => {
    expect(PHONE_DROPDOWN_ITEM_CLASS).toContain("h-11");
    expect(PHONE_DROPDOWN_ITEM_CLASS).toContain("min-h-11");
    expect(PHONE_DROPDOWN_ITEM_CLASS).toContain("min-w-[44px]");
    expect(PHONE_LANG_TOGGLE_BUTTON_CLASS).toContain("min-h-[44px]");
    expect(PHONE_LANG_TOGGLE_BUTTON_CLASS).toContain("min-w-[44px]");
  });

  it("keeps the phone dialog one-column by default and two-column at 600px", () => {
    expect(PHONE_MENU_DIALOG_CLASS).toContain("fixed");
    expect(PHONE_MENU_DIALOG_CLASS).toContain("inset-3");
    expect(PHONE_MENU_DIALOG_CLASS).toContain("min-[600px]:inset-4");
    expect(PHONE_MENU_DIALOG_CLASS).not.toContain("news-mobile-menu-dialog");
    expect(PHONE_MENU_GRID_CLASS).toContain("grid-cols-1");
    expect(PHONE_MENU_GRID_CLASS).toContain("min-[600px]:grid-cols-2");
    expect(PHONE_MENU_GRID_CLASS).toContain("auto-rows-fr");
    expect(PHONE_MENU_GRID_CLASS).toContain("min-h-0");
    expect(PHONE_MENU_LINK_CLASS).toContain("min-h-12");
    expect(PHONE_MENU_LINK_CLASS).toContain("min-[600px]:min-h-14");
    expect(PHONE_MENU_LINK_CLASS).toContain("min-[600px]:text-base");
    expect(PHONE_MENU_LINK_CLASS).toContain("min-[600px]:[&_svg]:size-[22px]");
    expect(PHONE_MENU_LINK_CLASS).toContain(
      "focus-visible:ring-3 focus-visible:ring-ring/30"
    );
  });
});
