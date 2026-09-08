import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowCustomApiBase,
  clampFontSize,
  DEFAULT_API_BASE,
  DEFAULT_SETTINGS,
  isDarkAppearance,
  normalizeApiBase,
  normalizeSettings,
  safeHttpUrl,
} from "./settings.js";

test("normalizeSettings clamps size, count, and unknown enums", () => {
  const settings = normalizeSettings({
    theme: "neon",
    font: "comic",
    fontSize: 99,
    language: "fr",
    density: "huge",
    bg: "neon",
    storyCount: 0,
    apiBase: "ftp://evil",
    sections: { tldr: false },
  });

  assert.equal(settings.theme, "system");
  assert.equal(settings.font, "sans");
  assert.equal(settings.fontSize, 1.25);
  assert.equal(settings.bg, "default");
  assert.equal(settings.language, "vi");
  assert.equal(settings.density, "compact");
  assert.equal(settings.storyCount, 1);
  assert.equal(settings.tldrCount, 8);
  assert.equal(settings.apiBase, DEFAULT_API_BASE);
  assert.equal(settings.sections.tldr, false);
  assert.equal(settings.sections.days, false); // defaults off (digest-first)
  assert.equal(settings.showFooter, false);
});

test("normalizeSettings migrates legacy fonts and px sizes", () => {
  const settings = normalizeSettings({
    font: "editorial",
    fontSize: 16,
    bg: "cream",
  });
  assert.equal(settings.font, "sans");
  assert.equal(settings.fontSize, 1);
  assert.equal(settings.bg, "cream");
  assert.equal(clampFontSize(20), 1.25);
  assert.equal(clampFontSize(0.9), 0.9);
});

test("isDarkAppearance respects bg swatches over theme", () => {
  assert.equal(isDarkAppearance({ theme: "light", bg: "dark" }), true);
  assert.equal(isDarkAppearance({ theme: "dark", bg: "cream" }), false);
  assert.equal(isDarkAppearance({ theme: "dark", bg: "default" }), true);
  assert.equal(isDarkAppearance({ theme: "light", bg: "default" }), false);
});

test("normalizeApiBase keeps host and rejects junk", () => {
  assert.equal(
    normalizeApiBase("https://aidr.today/extra"),
    "https://aidr.today"
  );
  assert.equal(normalizeApiBase("not a url"), DEFAULT_API_BASE);
  assert.equal(
    normalizeApiBase("http://localhost:3014"),
    "http://localhost:3014"
  );
  assert.equal(normalizeApiBase("http://example.com"), DEFAULT_API_BASE);
});

test("allowCustomApiBase follows optional localhost hosts", () => {
  assert.equal(allowCustomApiBase(null), true);
  assert.equal(
    allowCustomApiBase({
      optional_host_permissions: ["http://localhost/*", "http://127.0.0.1/*"],
    }),
    true
  );
  assert.equal(allowCustomApiBase({}), false);
  assert.equal(allowCustomApiBase({ optional_host_permissions: [] }), false);
});

test("safeHttpUrl allows https and loopback http only", () => {
  assert.equal(
    safeHttpUrl("https://aidr.today/ai/x"),
    "https://aidr.today/ai/x"
  );
  assert.equal(
    safeHttpUrl("http://127.0.0.1:3014/x"),
    "http://127.0.0.1:3014/x"
  );
  assert.equal(safeHttpUrl("http://localhost/x"), "http://localhost/x");
  assert.equal(safeHttpUrl("javascript:alert(1)", "fb"), "fb");
  assert.equal(safeHttpUrl("data:text/html,hi", "fb"), "fb");
  assert.equal(safeHttpUrl("http://evil.example/", "fb"), "fb");
  assert.equal(safeHttpUrl("", "fb"), "fb");
  assert.equal(safeHttpUrl(null, "fb"), "fb");
});

test("DEFAULT_SETTINGS matches website PrefsPanel shape", () => {
  assert.equal(DEFAULT_SETTINGS.font, "sans");
  assert.equal(DEFAULT_SETTINGS.fontSize, 1);
  assert.equal(DEFAULT_SETTINGS.bg, "default");
  assert.equal("accent" in DEFAULT_SETTINGS, false);
});

test("normalizeSettings normalizes sectionOrder", () => {
  const settings = normalizeSettings({
    sectionOrder: ["tldr", "days"],
  });
  assert.deepEqual(settings.sectionOrder, [
    "tldr",
    "days",
    ...DEFAULT_SETTINGS.sectionOrder.filter(
      (k) => !["tldr", "days"].includes(k)
    ),
  ]);
  assert.equal(
    normalizeSettings({ sectionOrder: "junk" }).sectionOrder[0],
    "categories"
  );
});
