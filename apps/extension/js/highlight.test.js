import assert from "node:assert/strict";
import { test } from "node:test";
import {
  highlightKeywords,
  highlightTitle,
  numberRanges,
  setLearnedKeywords,
  TITLE_KEYWORDS,
  tagsForHighlight,
} from "./highlight.js";

test("returns a single unhighlighted segment when there are no tags", () => {
  assert.deepEqual(highlightTitle("Anthropic ships Claude 5", []), [
    { text: "Anthropic ships Claude 5", highlighted: false },
  ]);
});

test("highlights a single matching tag case-insensitively", () => {
  assert.deepEqual(highlightTitle("Anthropic ships Claude 5", ["anthropic"]), [
    { text: "Anthropic", highlighted: true, tag: "anthropic" },
    { text: " ships Claude 5", highlighted: false },
  ]);
});

test("matches hyphenated tags against the spaced spelling", () => {
  assert.deepEqual(
    highlightTitle("New open source model released", ["open-source"]),
    [
      { text: "New ", highlighted: false },
      { text: "open source", highlighted: true, tag: "open-source" },
      { text: " model released", highlighted: false },
    ]
  );
});

test("does not highlight a needle embedded in a larger word", () => {
  const segments = highlightTitle("SpaceXAI Opens Grok Build to All", [
    "SpaceX",
    "xAI",
    "Grok",
  ]);
  assert.deepEqual(
    segments.filter((s) => s.highlighted).map((s) => s.text),
    ["Grok"]
  );
});

test("caps highlights at 3 distinct tags", () => {
  const segments = highlightTitle("Alpha Beta Gamma Delta all launch today", [
    "alpha",
    "beta",
    "gamma",
    "delta",
  ]);
  assert.ok(segments.filter((s) => s.highlighted).length <= 3);
});

test("segments join back to the original title", () => {
  const title = "Anthropic and OpenAI ship new models";
  const segments = highlightTitle(title, ["anthropic", "openai", "models"]);
  assert.equal(segments.map((s) => s.text).join(""), title);
});

test("TITLE_KEYWORDS fallback highlights well-known entities", () => {
  const segments = highlightTitle(
    "Anthropic and OpenAI ship GPT-5.6 Sol",
    tagsForHighlight([])
  );
  const highlighted = segments.filter((s) => s.highlighted).map((s) => s.text);
  assert.ok(highlighted.includes("Anthropic"));
  assert.ok(highlighted.includes("OpenAI"));
  assert.ok(highlighted.includes("GPT"));
});

test("item tags stay ahead of fallback keywords", () => {
  assert.equal(tagsForHighlight(["openai"])[0], "openai");
  assert.ok(TITLE_KEYWORDS.includes("OpenAI"));
});

const nums = (text) => numberRanges(text).map((r) => text.slice(r.start, r.end));
const marked = (text, tags = []) =>
  highlightKeywords(text, tags)
    .filter((s) => s.kind)
    .map((s) => [s.kind, s.text]);

test("numbers take Vietnamese money with its scale and currency words", () => {
  assert.deepEqual(
    nums("OpenAI gom được ~11 tỷ USD, định giá 1,25 nghìn tỷ USD, mục tiêu 30 tỷ USD."),
    ["~11 tỷ USD", "1,25 nghìn tỷ USD", "30 tỷ USD"]
  );
});

test("numbers take English money, percentages and multipliers", () => {
  assert.deepEqual(
    nums("It raised $11B at a $1.25 trillion valuation, up 30%, 10x faster."),
    ["$11B", "$1.25 trillion", "30%", "10x"]
  );
});

test("years, counts and version digits stay plain", () => {
  assert.deepEqual(
    nums("In 2026 GPT-5 and Qwen3-235B beat Llama 3 on 8 tests, v1.2."),
    []
  );
});

test("numbers inside a URL stay plain and a paragraph caps at four", () => {
  assert.deepEqual(nums("See https://example.com/raise-30%25/$11B now"), []);
  assert.equal(nums("1% 2% 3% 4% 5% 6%").length, 4);
});

test("entities need a capitalised spelling and never sit in a link", () => {
  assert.deepEqual(
    marked("OpenAI và Anthropic gom được 11 tỷ USD", ["anthropic"]),
    [
      ["entity", "OpenAI"],
      ["entity", "Anthropic"],
      ["num", "11 tỷ USD"],
    ]
  );
  assert.deepEqual(marked("New funding round for the lab", ["funding"]), []);
  assert.deepEqual(marked("Read https://openai.com/blog today"), []);
});

test("keyword segments join back to the input and learned keywords join in", () => {
  const text = "Theo WSJ, OpenAI đạt ~11 tỷ USD (30%) tại https://x.com/a/11B.";
  assert.equal(
    highlightKeywords(text, ["openai"])
      .map((s) => s.text)
      .join(""),
    text
  );
  setLearnedKeywords(["Zorblax"]);
  assert.deepEqual(marked("Zorblax ships a model"), [["entity", "Zorblax"]]);
  setLearnedKeywords([]);
});
