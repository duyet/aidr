import assert from "node:assert/strict";
import { test } from "node:test";
import { voiceProblems } from "./rubric.mjs";

// Words spread evenly at `rate` words per second from `at` (part-relative clock).
const part = (section, text, start, rate = 2.5, at = 0) => ({
  section,
  text,
  start,
  words: text.split(" ").map((t, i) => ({ text: t, start: at + i / rate, end: at + (i + 0.8) / rate })),
});

test("a calm script with short lines passes vo.natural", () => {
  assert.deepEqual(voiceProblems([part(0, "This is AI DR.", 0.6), part(0, "Here's what's new this week.", 2.4), part(1, "You can now follow AI DR in any RSS reader.", 6)], "en"), []);
});

test("a spoken list of three is flagged; any RSS reader is not", () => {
  const p = voiceProblems([part(1, "Follow AI DR by RSS in Feedly, Inoreader or NewsBlur.", 6)], "en");
  assert.equal(p.length, 1);
  assert.match(p[0], /list of three/);
});

test("a silence over 0.6 s between parts of one section is a pause, between sections it is a scene change", () => {
  const inSection = voiceProblems([part(0, "This is AI DR.", 0.6), part(0, "Here's what's new.", 3.5)], "en");
  assert.equal(inSection.length, 1);
  assert.match(inSection[0], /pause/);
  assert.deepEqual(voiceProblems([part(0, "This is AI DR.", 0.6), part(1, "Here's what's new.", 3.5)], "en"), []);
});

test("a part spoken faster than 1.35x the reading rate is rushed", () => {
  const p = voiceProblems([part(0, "The full list is in the release notes.", 0, 4.5)], "en");
  assert.match(p.join(), /words\/s/);
});
