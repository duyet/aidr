import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXT_REF,
  EXT_UTM_CAMPAIGN,
  EXT_UTM_MEDIUM,
  EXT_UTM_SOURCE,
  formActionWithExtRef,
  withExtRef,
} from "./ref.js";

test("withExtRef tags aidr.today permalinks", () => {
  const out = withExtRef("https://aidr.today/deadbeef", "story");
  assert.equal(
    out,
    "https://aidr.today/deadbeef?lang=vi&ref=extension&utm_source=extension&utm_medium=newtab&utm_campaign=aidr_ext&utm_content=story"
  );
  const u = new URL(out);
  assert.equal(u.searchParams.get("lang"), "vi");
  assert.equal(u.searchParams.get("ref"), EXT_REF);
  assert.equal(u.searchParams.get("utm_source"), EXT_UTM_SOURCE);
  assert.equal(u.searchParams.get("utm_medium"), EXT_UTM_MEDIUM);
  assert.equal(u.searchParams.get("utm_campaign"), EXT_UTM_CAMPAIGN);
  assert.equal(u.searchParams.get("utm_content"), "story");
  assert.equal(u.pathname, "/deadbeef");
});

test("withExtRef emits exact English links", () => {
  const out = withExtRef("https://aidr.today/deadbeef", "story", "en");
  assert.equal(new URL(out).searchParams.get("lang"), "en");
  assert.equal(new URL(out).pathname, "/deadbeef");
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

test("form actions leave locale serialization to one hidden field", () => {
  const action = formActionWithExtRef(
    "https://aidr.today/search?lang=en&keep=1",
    "search",
    "en"
  );
  const actionUrl = new URL(action);
  assert.equal(actionUrl.searchParams.get("keep"), "1");
  assert.equal(actionUrl.searchParams.has("lang"), false);
  assert.equal(actionUrl.searchParams.get("utm_source"), EXT_UTM_SOURCE);

  const formData = new URLSearchParams({
    q: "agents",
    lang: "en",
    ref: EXT_REF,
    utm_source: EXT_UTM_SOURCE,
    utm_medium: EXT_UTM_MEDIUM,
    utm_campaign: EXT_UTM_CAMPAIGN,
    utm_content: "search",
  });
  const submitted = new URL(action);
  submitted.search = formData.toString();
  assert.deepEqual(submitted.searchParams.getAll("lang"), ["en"]);
});
