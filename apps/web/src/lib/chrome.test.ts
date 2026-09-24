import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMPACT_CHROME_CLASS,
  PHONE_GET_AIDR_TRIGGER_CLASS,
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

describe("compact header icon buttons", () => {
  it("uses the shared 44px Get AI;DR trigger with even gaps", () => {
    const headerDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "../components/header"
    );
    const compact = readFileSync(join(headerDir, "CompactRow.tsx"), "utf8");
    const getAIDRMenu = readFileSync(
      join(headerDir, "GetAIDRMenu.tsx"),
      "utf8"
    );
    const controls = `${compact}\n${getAIDRMenu}`;
    expect(compact).toContain('from "./GetAIDRMenu"');
    expect(compact).toContain("<GetAIDRMenu compact />");
    expect(compact).toContain("items-center gap-1");
    expect(compact).not.toContain("RiChromeLine");
    expect(compact).not.toContain('aria-label="Telegram"');
    expect(getAIDRMenu).toContain('size={compact ? "icon-lg" : "sm"}');
    expect(getAIDRMenu).toContain("PHONE_GET_AIDR_TRIGGER_CLASS");
    expect(getAIDRMenu).toContain("Chrome Extension");
    expect(getAIDRMenu).toContain("Telegram Channel (Vietnamese)");
    expect(getAIDRMenu).toContain("Email Subscription");
    expect(getAIDRMenu).toContain("Submit");
    expect(getAIDRMenu).toContain("Data Analytics");
    expect(getAIDRMenu).toContain("Algorithms");
    expect(controls).not.toMatch(/size="icon"(?!-lg)/);
  });
});

describe("mobile header actions and navigation", () => {
  it("keeps the dropdown trigger at a 44px target with visible interaction states", () => {
    const headerDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "../components/header"
    );
    const wide = readFileSync(join(headerDir, "WideRow.tsx"), "utf8");
    const menu = readFileSync(join(headerDir, "GetAIDRMenu.tsx"), "utf8");
    expect(wide).toContain('from "./GetAIDRMenu"');
    expect(wide).toContain("<GetAIDRMenu />");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("h-11");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("w-11");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("min-h-[44px]");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("min-w-[44px]");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("bg-muted/60");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain("hover:bg-muted");
    expect(PHONE_GET_AIDR_TRIGGER_CLASS).toContain(
      "data-[state=open]:bg-muted"
    );
    expect(menu).toContain('aria-label="Get AI;DR menu"');
    expect(menu).toContain('className="sr-only"');
  });

  it("uses one column on phones and a filled two-column grid from 600px", () => {
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

  it("keeps safe-area insets, active News semantics, and close focus order", () => {
    const styles = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
      "utf8"
    );
    const menu = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../components/header/PhoneMenu.tsx"
      ),
      "utf8"
    );
    expect(PHONE_MENU_DIALOG_CLASS).toContain("news-mobile-menu-dialog");
    expect(styles).toContain("safe-area-inset-top");
    expect(styles).toContain("safe-area-inset-right");
    expect(styles).toContain("safe-area-inset-bottom");
    expect(styles).toContain("safe-area-inset-left");
    expect(menu).toContain("autoFocus");
    expect(menu).toContain("tabIndex={-1}");
    expect(menu).toContain('aria-current={active ? "page" : undefined}');
    expect(menu).toContain("PHONE_MENU_GRID_CLASS");
  });
});
