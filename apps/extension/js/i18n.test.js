import assert from "node:assert/strict";
import { test } from "node:test";
import { t } from "./i18n.js";

test("search copy is site-specific, not generic web search", () => {
  assert.equal(t({ language: "en" }, "search"), "Search aidr.today");
  assert.equal(t({ language: "vi" }, "search"), "Tìm trên aidr.today");
});
