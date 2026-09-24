import assert from "node:assert/strict";
import { test } from "node:test";
import { apiUrl, siteUrl, storyPermalink, withSiteLang } from "./site-url.js";

test("site URLs carry one explicit validated locale", () => {
  assert.equal(
    storyPermalink("abcdef1234567890", "vi"),
    "https://aidr.today/abcdef12?lang=vi"
  );
  assert.equal(
    storyPermalink("abcdef1234567890", "en"),
    "https://aidr.today/abcdef12?lang=en"
  );
  assert.equal(
    apiUrl("https://aidr.today", "/api/feed?days=3", "en"),
    "https://aidr.today/api/feed?days=3&lang=en"
  );
});

test("legacy locale and attribution parameters are normalized", () => {
  assert.equal(
    siteUrl("/abcdef12?locale=en&utm_source=extension", "vi"),
    "https://aidr.today/abcdef12?utm_source=extension&lang=vi"
  );
});

test("publisher links are never localized", () => {
  const source = "https://example.com/story?a=1";
  assert.equal(withSiteLang(source, "en"), source);
});
