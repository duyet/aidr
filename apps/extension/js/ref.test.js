import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXT_REF,
  EXT_UTM_CAMPAIGN,
  EXT_UTM_MEDIUM,
  EXT_UTM_SOURCE,
  withExtRef,
} from "./ref.js";

test("withExtRef tags aidr.today permalinks", () => {
  const out = withExtRef("https://aidr.today/ai/deadbeef", "story");
  const u = new URL(out);
  assert.equal(u.searchParams.get("ref"), EXT_REF);
  assert.equal(u.searchParams.get("utm_source"), EXT_UTM_SOURCE);
  assert.equal(u.searchParams.get("utm_medium"), EXT_UTM_MEDIUM);
  assert.equal(u.searchParams.get("utm_campaign"), EXT_UTM_CAMPAIGN);
  assert.equal(u.searchParams.get("utm_content"), "story");
  assert.equal(u.pathname, "/ai/deadbeef");
});

test("withExtRef leaves third-party URLs alone", () => {
  const hn = "https://news.ycombinator.com/item?id=1";
  assert.equal(withExtRef(hn, "story_ext"), hn);
});

test("withExtRef preserves existing query and path", () => {
  const out = withExtRef("https://aidr.today/submit?x=1", "submit");
  const u = new URL(out);
  assert.equal(u.searchParams.get("x"), "1");
  assert.equal(u.searchParams.get("ref"), EXT_REF);
});

test("withExtRef returns blank/invalid input unchanged", () => {
  assert.equal(withExtRef(""), "");
  assert.equal(withExtRef("not a url"), "not a url");
});
