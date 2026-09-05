import assert from "node:assert/strict";
import { test } from "node:test";
import { t } from "./i18n.js";

test("search copy matches the live homepage SearchBox", () => {
  assert.equal(t({ language: "en" }, "search"), "Search AI news...");
  assert.equal(t({ language: "vi" }, "search"), "Tìm kiếm...");
});
