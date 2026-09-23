import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMPACT_CHROME_CLASS,
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
  it("uses 44px icon-lg taps with even gaps, not 36px icon size", () => {
    const header = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../components/header/CompactRow.tsx"
      ),
      "utf8"
    );
    const compact = header.slice(header.lastIndexOf("COMPACT_CHROME_CLASS"));
    expect(compact).toContain('size="icon-lg"');
    expect(compact).toContain("PHONE_TAP_TARGET_CLASS");
    expect(compact).toContain("items-center gap-1");
    expect(compact).not.toMatch(/size="icon"(?!-lg)/);
  });
});
