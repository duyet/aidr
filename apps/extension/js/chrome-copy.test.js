import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "newtab.html"), "utf8");
const css = readFileSync(join(root, "css/newtab.css"), "utf8");
const js = readFileSync(join(root, "js/newtab.js"), "utf8");

test("new tab matches site chrome copy and typefaces", () => {
  assert.match(html, /AI news ranked and summary/);
  assert.doesNotMatch(html, /translated hourly/);
  assert.doesNotMatch(html, />Blog</);
  assert.match(html, /https:\/\/duyet\.net/);
  assert.match(html, /https:\/\/aidr\.today\/subscribe/);
  assert.doesNotMatch(html, /chromewebstore\.google\.com\/detail\/aidr/);
  assert.match(css, /Source Sans 3/);
  assert.match(css, /EB Garamond/);
  assert.doesNotMatch(js, /story-host/);
  assert.doesNotMatch(js, /story-score/);
  assert.match(js, /story-sources/);
});

test("section tiles persist with a prefs-panel repaint so aria-pressed updates", () => {
  const panel = readFileSync(join(root, "js/settings-panel.js"), "utf8");
  assert.match(panel, /state\.sections\[key\] = !on;/);
  assert.match(
    panel,
    /state\.sections\[key\] = !on;[\s\S]*?await persist\(\);/
  );
});

test("header Chrome mark is RiChromeLine, not the pie-chart path", () => {
  assert.match(html, /id="chrome-tab-link"/);
  assert.match(html, /M10\.3645 19\.8327L12\.2941 16\.4905/);
  assert.doesNotMatch(
    html,
    /M12 2a10 10 0 1 0 10 10A10 10 0 1 0 12 2/
  );
});

test("digest footer has a muted reload control next to the updated stamp", () => {
  assert.match(html, /id="tldr-reload"/);
  assert.match(html, /id="tldr-updated"/);
  assert.match(css, /\.tldr-reload/);
  assert.match(js, /refreshLive\(\{ force: true \}\)/);
  assert.match(js, /campaign: "refresh"/);
});

test("new tab does not show Add section restore chip", () => {
  assert.doesNotMatch(html, /id="add-section"/);
  assert.doesNotMatch(html, /add-section-host/);
  assert.doesNotMatch(js, /renderAddSection/);
  assert.doesNotMatch(js, /add-section-btn/);
  assert.doesNotMatch(css, /\.add-section-btn/);
});

test("header action row shares one vertical center and 1rem glyphs", () => {
  assert.match(css, /\.actions\s*\{[^}]*align-items:\s*center/);
  assert.match(css, /\.actions\s*\{[^}]*height:\s*2rem/);
  assert.match(css, /\.icon-btn svg[\s\S]*width:\s*1rem/);
  assert.match(css, /\.icon-btn svg[\s\S]*display:\s*block/);
});

test("wide header uses the web Get AI;DR menu", () => {
  assert.match(html, /id="header-menu-trigger"/);
  assert.match(html, /aria-label="Get AI;DR menu"/);
  for (const label of [
    "Chrome Extension",
    "Telegram Channel (Vietnamese)",
    "Email Subscription",
    "Submit",
    "Data Analytics",
    "Algorithms",
  ]) {
    assert.ok(html.includes(`>${label}<`));
  }
  assert.match(css, /\.header-menu-content/);
  assert.match(
    html,
    /<a data-channel="telegram" href="https:\/\/t\.me\/aihomnay"[^>]*>Telegram<\/a>/
  );
  assert.match(js, /bindHeaderMenu/);
  assert.match(js, /aria-expanded/);
});

test("phone menu mirrors the web navigation and closes from its control", () => {
  for (const label of [
    "News",
    "About",
    "Brand",
    "MCP",
    "Get AI;DR",
    "Telegram",
    "Data",
    "Submit",
    "duyet.net",
  ]) {
    assert.ok(html.includes(`<span>${label}</span>`));
  }
  assert.match(html, /id="close-menu"/);
  assert.match(css, /\.phone-menu-panel[\s\S]*border-radius:\s*1\.5rem/);
  assert.match(js, /close-menu/);
});

test("preferences popover exposes close for Escape handling", () => {
  const panel = readFileSync(join(root, "js/settings-panel.js"), "utf8");
  assert.match(panel, /return \{ close \};/);
});

test("Submit is available from the Get AI;DR menu", () => {
  assert.match(html, /id="submit-btn"[^>]*href="https:\/\/aidr\.today\/submit"/);
  assert.doesNotMatch(html, /id="submit-btn"[^>]*hidden/);
  assert.doesNotMatch(js, /applySubmitVisibility/);
  assert.doesNotMatch(js, /dataset\.signedIn/);
});

test("brief layout centers AI;DR when the daily feed is off", () => {
  assert.match(css, /\.page\.is-brief/);
  assert.match(css, /\.page\.is-brief \.tldr[\s\S]*margin-top:\s*auto/);
  assert.doesNotMatch(
    css,
    /\.page\.is-brief\s*\{[^}]*justify-content:\s*center/
  );
  assert.match(js, /applyBriefLayout/);
  assert.match(js, /classList\.toggle\("is-brief"/);
  assert.match(js, /!visibleSection\("section-days"\)/);
});

test("section tiles follow Cat > Trending > AI;DR > Daily feed", () => {
  const panel = readFileSync(join(root, "js/settings-panel.js"), "utf8");
  const keys = [...panel.matchAll(/key: "(categories|trending|tldr|days)"/g)].map(
    (m) => m[1]
  );
  assert.deepEqual(keys, ["categories", "trending", "tldr", "days"]);
  assert.match(panel, /prefs-section-tile/);
  assert.match(panel, /sectionIcon/);
});
