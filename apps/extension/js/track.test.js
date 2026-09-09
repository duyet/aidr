import assert from "node:assert/strict";
import { test } from "node:test";
import { track, trackContent, trackUrl } from "./track.js";

test("trackContent matches web event names with params", () => {
  assert.equal(trackContent("cache_hit", { source: "local" }), "cache_hit_local");
  assert.equal(
    trackContent("prefs_change", { pref: "days", to: "on" }),
    "prefs_change_days_on"
  );
  assert.equal(
    trackContent("live_refresh", { source: "public", stale: "" }),
    "live_refresh_public"
  );
});

test("trackUrl tags /api/extension with campaign params", () => {
  const url = new URL(trackUrl("https://aidr.today/", "nav_click", { to: "submit" }));
  assert.equal(url.pathname, "/api/extension");
  assert.equal(url.searchParams.get("ref"), "extension");
  assert.equal(url.searchParams.get("utm_source"), "extension");
  assert.equal(url.searchParams.get("utm_medium"), "newtab");
  assert.equal(url.searchParams.get("utm_campaign"), "aidr_ext");
  assert.equal(url.searchParams.get("utm_content"), "nav_click_submit");
});

test("track GETs the tagged URL and never throws", async () => {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), method: init?.method });
    return { ok: true };
  };
  track("page_view", {}, "https://aidr.today");
  track("!!!bad", {}, "https://aidr.today");
  await Promise.resolve();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, "GET");
  assert.match(seen[0].url, /utm_content=page_view/);
});
