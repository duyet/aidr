import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PHONE_PREFS_TRIGGER_CLASS } from "./chrome";

describe("phone chrome", () => {
  it("requires 44px tap targets on phone controls", () => {
    expect(PHONE_PREFS_TRIGGER_CLASS).toContain("min-h-[44px]");
    expect(PHONE_PREFS_TRIGGER_CLASS).toContain("min-w-[44px]");
    expect(PHONE_PREFS_TRIGGER_CLASS).toContain("h-11");
    expect(PHONE_PREFS_TRIGGER_CLASS).toContain("w-11");
    expect(PHONE_PREFS_TRIGGER_CLASS).toContain("p-0");
    expect(PHONE_PREFS_TRIGGER_CLASS).toContain("[&_svg]:size-5");
  });
});

describe("compact header icon buttons", () => {
  it("opens the phone menu from the compact row and the follow menu from the wide row", () => {
    const headerDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "../components/header"
    );
    const compact = readFileSync(join(headerDir, "CompactRow.tsx"), "utf8");
    const wide = readFileSync(join(headerDir, "WideRow.tsx"), "utf8");
    expect(compact).toContain("<PhoneMenuTrigger");
    expect(compact).not.toContain("<GetAIDRMenu");
    expect(wide).toContain('from "./GetAIDRMenu"');
    expect(wide).toContain("<GetAIDRMenu />");
  });

  it("keeps the channel links and their marks in the shared header lib, not in the bars", () => {
    const headerDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "../components/header"
    );
    const compact = readFileSync(join(headerDir, "CompactRow.tsx"), "utf8");
    const wide = readFileSync(join(headerDir, "WideRow.tsx"), "utf8");
    const lib = readFileSync(join(headerDir, "lib.ts"), "utf8");
    expect(lib).toContain("TELEGRAM_EN_URL");
    expect(lib).toContain("ChromeMark");
    expect(compact).not.toContain("<ChromeMark");
    expect(compact).not.toContain('aria-label="Telegram"');
    expect(wide).not.toContain("<ChromeMark");
  });
});
