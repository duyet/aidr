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
  assert.match(css, /font-family: "Inter Variable";/);
  assert.match(css, /inter-wght-normal\.woff2/);
  // Reader serif carries the Vietnamese subset so diacritics render.
  assert.match(css, /source-serif-4-vietnamese-wght-normal\.woff2/);
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
  assert.match(html, /M10\.3645 19\.8327L12\.2941 16\.4905/);
  assert.doesNotMatch(html, /M12 2a10 10 0 1 0 10 10A10 10 0 1 0 12 2/);
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

test("header action row shares one vertical center and 15px glyphs", () => {
  assert.match(css, /\.actions\s*\{[^}]*align-items:\s*center/);
  assert.match(css, /\.actions\s*\{[^}]*height:\s*2rem/);
  assert.match(css, /\.icon-btn svg \{[^}]*width:\s*15px/);
  assert.match(css, /\.icon-btn svg \{[^}]*display:\s*block/);
});

test("wide header uses the web Get AI;DR menu", () => {
  assert.match(html, /id="header-menu-trigger"/);
  assert.match(html, /aria-label="Get AI;DR menu"/);
  const menu = html.match(/id="header-menu-content"[\s\S]*?<\/div>/)[0];
  // Same items and order as the web GetAIDRMenu, minus the Chrome item.
  assert.deepEqual(
    [...menu.matchAll(/<span>([^<]+)<\/span>|<(hr) /g)].map(
      (m) => m[1] || m[2]
    ),
    [
      "Telegram Channel (Vietnamese)",
      "Telegram Channel (English)",
      "Email Subscription",
      "hr",
      "Contribute",
      "Data Analytics",
      "Algorithms",
      "hr",
      "About",
    ]
  );
  assert.doesNotMatch(html, /chrome-tab-link/);
  assert.doesNotMatch(js, /chrome-tab-link/);
  assert.match(
    menu,
    /data-channel="telegram"[^>]*href="https:\/\/t\.me\/aidr_today" target="_blank" rel="noopener noreferrer"/
  );
  assert.match(menu, /href="https:\/\/aidr\.today\/about"/);
  assert.match(css, /\.header-menu-content/);
  assert.match(
    html,
    /<a class="footer-link" id="footer-telegram" data-channel="telegram" href="https:\/\/t\.me\/aihomnay"[^>]*>[\s\S]*?<span>Telegram<\/span><\/a>/
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
    "Contribute",
    "duyet.net",
  ]) {
    assert.ok(html.includes(`<span>${label}</span>`));
  }
  assert.match(html, /id="phone-intro-label"[^>]*>Video giới thiệu</);
  assert.match(html, /id="close-menu"/);
  // One card radius everywhere (minimal pass): no bubbly 24px panel.
  assert.match(
    css,
    /\.phone-menu-panel \{[^}]*border-radius:\s*var\(--radius-card\)/
  );
  assert.match(js, /close-menu/);
});

test("preferences popover exposes close for Escape handling", () => {
  const panel = readFileSync(join(root, "js/settings-panel.js"), "utf8");
  assert.match(panel, /return \{ close \};/);
});

test("Contribute replaces Submit in the Get AI;DR menu", () => {
  assert.match(
    html,
    /id="contribute-btn"[^>]*href="https:\/\/aidr\.today\/contribute"/
  );
  assert.doesNotMatch(html, /id="submit-btn"/);
  assert.doesNotMatch(html, /id="phone-submit-link"/);
  assert.doesNotMatch(js, /applySubmitVisibility/);
  assert.doesNotMatch(js, /dataset\.signedIn/);
});

test("new tab follows the live digest masthead, day links, and intro video", () => {
  assert.match(html, /id="intro-video-btn"/);
  assert.match(html, /id="phone-intro-video"/);
  assert.match(js, /"tldr-day"/);
  // The day heading itself links to the archive; no separate "Full day" link.
  assert.match(js, /className: "day-link"/);
  assert.doesNotMatch(js, /Xem cả ngày|Full day/);
  assert.doesNotMatch(css, /\.day-full/);
  assert.match(js, /story-publisher/);
  assert.match(js, /story-votes/);
  assert.match(css, /\.story-vote \{[^}]*width:\s*0\.875rem/);
  assert.match(js, /tynoWx03zDc/);
  assert.match(js, /youtube-nocookie\.com/);
  assert.match(
    css,
    /\.tldr-counts button\[aria-pressed="true"\][\s\S]*?var\(--primary-foreground\)/
  );
  assert.doesNotMatch(js, /story-host/);
});

test("story row meta is one small wrapping line; votes only when enabled", () => {
  assert.match(
    js,
    /if \(showVotes && settings\.votes\) meta\.append\(renderVotes\(settings, story\)\)/
  );
  // Category dot and name, then the publisher, then the time (web StoryRow).
  assert.match(
    js,
    /categoryLabelNode\(story\.category\)[\s\S]*?"story-publisher"[\s\S]*?"story-when"/
  );
  assert.match(css, /\.story-head \{[^}]*align-items:\s*center/);
  assert.match(css, /\.story-meta \{[^}]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(css, /\.story-meta \{[^}]*height:\s*1lh/);
});

test("masthead image | 2 rows | 3 rows switch replaces the day card chip", () => {
  // Same control as web TldrViewSwitch: 2 rows by default, image stays
  // open until the reader switches back (no hover preview).
  assert.match(html, /id="day-card-switch"/);
  assert.match(html, /id="day-card-image" aria-pressed="false"/);
  assert.match(html, /id="day-card-rows2" aria-pressed="true"/);
  assert.match(html, /id="day-card-rows3" aria-pressed="false"/);
  assert.doesNotMatch(html, /day-card-text/);
  assert.doesNotMatch(html, /day-card-chip/);
  assert.match(js, /Xem ảnh tóm tắt/);
  assert.match(js, /Show day card/);
  assert.match(js, /Chữ, 3 dòng mỗi tin/);
  assert.match(js, /"3 rows"/);
  // Glyphs come from the shared module, not from inline copies in the page.
  assert.match(js, /TLDR_VIEW_ICONS/);
  assert.doesNotMatch(js, /pointerenter/);
  // Styled like the 8 | 12 count pills: 44px buttons on phones, 36x32 from
  // 640px, 14px icons (web TldrControls).
  assert.match(
    css,
    /\.day-card-switch \{[^}]*padding:\s*2px;[^}]*border-radius:\s*999px/
  );
  assert.match(css, /\.day-card-switch button \{[^}]*width:\s*2\.75rem/);
  assert.match(css, /\.day-card-switch button \{\s*width:\s*2\.25rem;/);
  assert.match(
    css,
    /\.day-card-switch button\[aria-pressed="true"\] \{\s*background:\s*var\(--primary\);\s*color:\s*var\(--primary-foreground\)/
  );
  assert.match(css, /\.day-card-switch svg \{\s*width:\s*0\.875rem/);
});

test("image view makes the covered AI;DR list inert, text view restores it", () => {
  const fn = js.match(/function applyDayCardView\(\) \{[\s\S]*?\n\}/)[0];
  for (const id of ["tldr-cols", "tldr-more"]) {
    assert.match(fn, new RegExp(`\\$\\("${id}"\\)`));
  }
  assert.match(fn, /toggleAttribute\("inert", open\)/);
  assert.match(fn, /removeAttribute\("aria-hidden"\)/);
  // The masthead switch must stay usable, so it is never made inert.
  assert.doesNotMatch(fn, /day-card-switch/);
  // Resetting with no snapshot date goes back to text, which clears inert.
  assert.match(js, /dayCardImageOn = false;\s*applyDayCardView\(\);/);
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
  const keys = [
    ...panel.matchAll(/key: "(categories|trending|tldr|days)"/g),
  ].map((m) => m[1]);
  assert.deepEqual(keys, ["categories", "trending", "tldr", "days"]);
  assert.match(panel, /prefs-section-tile/);
  assert.match(panel, /sectionIcon/);
});

test("density drives AI;DR and day story row spacing", () => {
  // Same seven steps as web readerCssVars; :root is the "medium" default.
  assert.match(css, /:root\s*\{[^}]*--pad:\s*0\.625rem;\s*--leading:\s*1\.62/);
  for (const [density, pad, leading] of [
    ["dense", "0\\.375rem", "1\\.45"],
    ["compact", "0\\.5rem", "1\\.55"],
    ["comfortable", "0\\.75rem", "1\\.7"],
    ["relaxed", "0\\.9rem", "1\\.8"],
    ["spacious", "1\\.125rem", "1\\.9"],
    ["airy", "1\\.375rem", "2"],
  ]) {
    assert.match(
      css,
      new RegExp(
        `html\\[data-density="${density}"\\]\\s*\\{\\s*--pad:\\s*${pad};\\s*--leading:\\s*${leading};`
      )
    );
  }
  assert.match(css, /\.tldr-list \{[^}]*line-height:\s*calc\(var\(--leading\)/);
  // The digest rows follow density; the ranked rows use the home row pad
  // (--home-row-pad through --row-pad), as on the site.
  assert.match(css, /\n\.tldr-row \{[^}]*var\(--pad\)/);
  assert.match(css, /\n\.story-head \{[^}]*var\(--row-pad\)/);
  assert.match(css, /\.page\.is-brief \.tldr \{[^}]*var\(--pad\)/);
});

test("density slider persists through onSaved so appearance re-applies live", () => {
  const panel = readFileSync(join(root, "js/settings-panel.js"), "utf8");
  assert.match(
    panel,
    /state\.density =\s*[^;]*;\s*await persist\(\{ repaint: false \}\);/
  );
  assert.match(panel, /onSaved\?\.\(saved\);\s*if \(repaint\) paint\(\);/);
  assert.match(js, /const refresh = async[\s\S]*?applyAppearance\(settings\);/);
});

test("preferences panel has no About tab", () => {
  const panel = readFileSync(join(root, "js/settings-panel.js"), "utf8");
  assert.equal(panel.match(/role: "tab",/g).length, 2);
  assert.doesNotMatch(panel, /about/i);
  assert.doesNotMatch(css, /\.prefs-about/);
});

test("3 rows clamps titles to 3 lines and overlays behind panels blur", () => {
  assert.match(
    css,
    /\.tldr-cols\[data-rows="3"\] \.bullet-copy \{[^}]*line-clamp:\s*3/
  );
  for (const selector of [
    "phone-menu-backdrop",
    "story-dialog-overlay",
    "intro-dialog-backdrop",
  ]) {
    const rule = css.match(new RegExp("\\." + selector + " \\{[^}]*\\}"))[0];
    assert.match(rule, /backdrop-filter:\s*blur\(4px\)/, selector);
  }
});
