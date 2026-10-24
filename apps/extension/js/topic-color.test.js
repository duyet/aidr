import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoryColor,
  NEUTRAL_CATEGORY_COLOR,
  TOPIC_COLOR_PALETTE,
  topicColor,
} from "./topic-color.js";

test("topicColor is deterministic across case and whitespace", () => {
  assert.deepEqual(topicColor("GPT-5"), topicColor("gpt-5"));
  assert.deepEqual(topicColor(" Anthropic "), topicColor("anthropic"));
  assert.deepEqual(topicColor("open-source"), topicColor("open-source"));
});

test("palette slots are hex pairs", () => {
  for (const slot of TOPIC_COLOR_PALETTE) {
    assert.match(slot.light, /^#[0-9a-f]{6}$/);
    assert.match(slot.dark, /^#[0-9a-f]{6}$/);
  }
});

test("distinct tags use more than one palette color", () => {
  const tags = [
    "gpt-5",
    "anthropic",
    "openai",
    "open-source",
    "llm",
    "agent",
    "reasoning",
    "safety",
    "chips",
  ];
  const colors = new Set(tags.map((tag) => topicColor(tag).light));
  assert.ok(colors.size > 1);
});

test("categoryColor uses the web's fixed category slots", () => {
  assert.deepEqual(categoryColor("Models"), TOPIC_COLOR_PALETTE[6]);
  assert.deepEqual(categoryColor(" open source "), TOPIC_COLOR_PALETTE[3]);
  assert.deepEqual(categoryColor("Tools"), TOPIC_COLOR_PALETTE[10]);
});

test("unknown categories stay neutral instead of hashing to a hue", () => {
  assert.deepEqual(categoryColor("Gossip"), NEUTRAL_CATEGORY_COLOR);
  assert.deepEqual(categoryColor(null), NEUTRAL_CATEGORY_COLOR);
});
