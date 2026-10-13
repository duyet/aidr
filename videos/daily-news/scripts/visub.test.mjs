// node --test videos/daily-news/scripts/*.test.mjs
// The visub cut: the English cut with Vietnamese subtitles, posted to the Vietnamese Telegram channel.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { cutFor } from "./lang.mjs";
import { addRows, needsRender, telegramTodo } from "./status.mjs";
import { chatFor, telegramPost, youtubeIdFor } from "./telegram-video.mjs";
import { formatSrt, houseStyle, parseSrt, spreadWords, subsMismatch, translateCues } from "./visub.mjs";

// A slice of the 2026-10-13 captions.srt: cue fragments of whole sentences, one with numbers.
const EN_SRT = `1
00:00:00,900 --> 00:00:02,224
This is AI;DR,

2
00:00:02,224 --> 00:00:03,141
your AI news for

3
00:00:03,141 --> 00:00:05,360
Tuesday.

4
00:00:42,568 --> 00:00:44,193
Nvidia's AI chip shipments

5
00:00:44,193 --> 00:00:46,051
to China fall 44%

6
00:00:46,051 --> 00:00:50,544
to 678,000 in H1 2026.
`;
const VI = {
  title: "Muse Wonder đưa Meta lên tuyến đầu AI và hơn nữa | 2026-10-13",
  lines: ["Đây là AI;DR, bản tin AI của bạn hôm thứ Ba.", "Lượng chip AI Nvidia giao cho Trung Quốc giảm 44%, còn 678.000 chiếc trong H1 2026."],
};
const TITLE = "Muse Wonder puts Meta at AI frontier & more | 2026-10-13";
const style = { style: "STYLE", overview: "OVERVIEW" };
const answer = (o) => async () => JSON.stringify(o);

test("subtitles keep every English cue and its exact times, with Vietnamese text", async () => {
  const cues = parseSrt(EN_SRT);
  const out = await translateCues({ cues, title: TITLE, models: ["m1"], llm: answer(VI), style, log: () => {} });
  assert.equal(out.model, "m1");
  assert.equal(out.title, VI.title);
  assert.equal(out.cues.length, cues.length);
  out.cues.forEach((c, i) => {
    assert.equal(c.start, cues[i].start);
    assert.equal(c.end, cues[i].end);
    assert.equal(c.en, cues[i].text);
    assert.ok(c.vi.trim(), `cue ${i + 1} is empty`);
  });
  // A sentence's Vietnamese is split over its own cues, in order, word for word.
  assert.equal(out.cues.slice(0, 3).map((c) => c.vi).join(" "), VI.lines[0]);
  assert.equal(out.cues.slice(3).map((c) => c.vi).join(" "), VI.lines[1]);
  // The written SRT is the English timing with the Vietnamese text.
  const srt = parseSrt(formatSrt(out.cues.map((c) => ({ start: c.start, end: c.end, text: c.vi }))));
  assert.deepEqual(srt.map((c) => [c.start, c.end]), cues.map((c) => [c.start, c.end]));
});

test("an answer that drops a number or a line goes to the next model; none valid fails loudly", async () => {
  const cues = parseSrt(EN_SRT);
  const noNumber = { ...VI, lines: [VI.lines[0], "Lượng chip AI Nvidia giao cho Trung Quốc giảm mạnh trong H1 2026."] };
  const asked = [];
  const llm = async (model) => {
    asked.push(model);
    return JSON.stringify(model === "bad" ? noNumber : VI);
  };
  const out = await translateCues({ cues, title: TITLE, models: ["bad", "good"], llm, style, log: () => {} });
  assert.deepEqual(asked, ["bad", "good"]);
  assert.equal(out.model, "good");
  await assert.rejects(
    translateCues({ cues, title: TITLE, models: ["bad"], llm: answer({ ...VI, lines: [VI.lines[0]] }), style, log: () => {} }),
    /no valid Vietnamese subtitles[\s\S]*1 lines for 2/
  );
  await assert.rejects(translateCues({ cues, title: TITLE, models: [], llm, style }), /no model/);
});

test("the cache is reused only for the same English cues", async () => {
  const cues = parseSrt(EN_SRT);
  const out = await translateCues({ cues, title: TITLE, models: ["m1"], llm: answer(VI), style, log: () => {} });
  assert.equal(subsMismatch(out.cues, cues), null);
  const retimed = cues.map((c, i) => (i === 4 ? { ...c, end: "00:00:46,100" } : c));
  assert.match(subsMismatch(out.cues, retimed), /cue 5 differs/);
  assert.match(subsMismatch(out.cues, cues.slice(1)), /6 cached cues, 5/);
});

test("burned words share the cue's span in order", () => {
  const w = spreadWords("Lượng chip AI Nvidia", 10, 12);
  assert.equal(w.length, 4);
  assert.equal(w[0].s, 10);
  assert.ok(Math.abs(w.at(-1).e - 12) < 1e-9);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].s >= w[i - 1].s && w[i].s === w[i - 1].e);
});

test("the prompt uses the Worker's Vietnamese house style, read from source", () => {
  const { style: s, overview } = houseStyle();
  assert.match(s, /^HARD RULES/);
  assert.match(s, /fine-tune, benchmark, agent/); // KEEP_ENGLISH_PROSE filled in
  assert.doesNotMatch(s, /\$\{/);
  assert.match(overview, /^Keep every fact/);
});

const dir = "/x/editions/2026-10-13";
const config = { formats: { "16x9": {}, "9x16": {} } };
const rowsFor = (langs) => addRows([], { date: "2026-10-13", langs, config, dir });

test("visub is one 16:9 cut that reuses the English cover", () => {
  const rows = rowsFor(["en", "visub"]);
  const visub = rows.filter((r) => r.lang === "visub");
  assert.deepEqual(visub.map((r) => r.cut), ["2026-10-13-visub-16x9"]);
  assert.equal(visub[0].cover, join(dir, "renders", "cover-2026-10-13-16x9.png"));
  assert.equal(visub[0].path, join(dir, "renders", "aidr-daily-2026-10-13-visub-16x9-1080p.mp4"));
  assert.equal(cutFor("visub").timeline, cutFor("en").timeline);
});

test("a visub cut STATUS says is done is skipped: rendered, or posted to the channel", () => {
  const [, , visub] = rowsFor(["en", "visub"]);
  assert.equal(needsRender(visub, { exists: () => false }), true);
  assert.equal(needsRender(visub, { exists: (p) => p === visub.path }), false);
  assert.deepEqual(telegramTodo([visub], ["visub"], "16x9"), [visub]);
  // A staging send does not count; a channel post does.
  assert.deepEqual(telegramTodo([{ ...visub, telegramTest: { chat_id: 1, message_id: 2 } }], ["visub"], "16x9").length, 1);
  assert.deepEqual(telegramTodo([{ ...visub, telegram: { chat_id: 1, message_id: 2 } }], ["visub"], "16x9"), []);
  // One video a day on the Vietnamese channel: not after the Vietnamese-voice cut.
  const vi = { cut: "2026-10-13-vi-16x9", lang: "vi", fmt: "16x9", telegram: { chat_id: 1, message_id: 3 } };
  assert.deepEqual(telegramTodo([vi, visub], ["visub"], "16x9"), []);
});

test("visub posts to the Vietnamese channel with Vietnamese copy and the English video's YouTube button", () => {
  const rows = rowsFor(["en", "visub"]);
  rows[0].youtube = { id: "EN16x9abcde" };
  const visub = rows.find((r) => r.lang === "visub");
  const env = (n) => ({ TELEGRAM_VI_CHAT_ID: "-100vi", TELEGRAM_EN_CHAT_ID: "@en" })[n] ?? null;
  assert.equal(chatFor("visub", { prod: true, env }), "-100vi");
  assert.equal(chatFor("visub", { prod: true, env: () => null }), "-1004420104760");
  assert.equal(chatFor("visub", { prod: false, staging: "-100staging", env }), "-100staging");
  assert.equal(chatFor("visub", { prod: true, override: "123", env }), "123");

  const youtubeId = youtubeIdFor(visub, rows);
  assert.equal(youtubeId, "EN16x9abcde");
  const post = telegramPost({ date: "2026-10-13", lang: "visub", title: VI.title, youtubeId });
  assert.equal(post.caption, `<b>${VI.title.replace("&", "&amp;")}</b>`);
  const [yt, day] = post.replyMarkup.inline_keyboard[0];
  assert.deepEqual(yt, { text: "▶ YouTube", url: "https://youtu.be/EN16x9abcde" });
  assert.equal(day.text, "Trang ngày trên aidr.today");
  assert.match(day.url, /\/date\/2026-10-13\?lang=vi&utm_source=telegram$/);
  assert.equal(telegramPost({ date: "2026-10-13", lang: "visub", title: null }).caption, "<b>Bản tin AI;DR — 2026-10-13</b>");
});
