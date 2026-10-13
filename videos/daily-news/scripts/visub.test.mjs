// node --test videos/daily-news/scripts/*.test.mjs
// The visub cut: the English cut with Vietnamese subtitles, posted to the Vietnamese Telegram channel.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { cutFor } from "./lang.mjs";
import { addRows, attachTodo, dayVideoArgs, needsRender, parseUpload, seedIds, telegramTodo, uploadArgs, uploadTodo, viPageCut } from "./status.mjs";
import { chatFor, telegramPost, youtubeIdFor } from "./telegram-video.mjs";
import {
  enPost,
  formatSrt,
  postLineProblems,
  houseStyle,
  parseSrt,
  retime,
  splitAcross,
  spreadWords,
  subsMismatch,
  translateCues,
  translatePost,
  viLinks,
} from "./visub.mjs";

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

test("a cue break moves to a nearby comma instead of splitting a Vietnamese word", () => {
  const parts = splitAcross("Đây là AI;DR, bản tin AI của bạn cho thứ Ba, ngày 13 tháng 10.", [
    "This is AI;DR,",
    "your AI news for",
    "Tuesday,",
    "October thirteenth.",
  ]);
  assert.equal(parts.length, 4);
  assert.equal(parts[0], "Đây là AI;DR,");
  assert.match(parts[2], /thứ Ba,$/);
  assert.equal(parts.join(" "), "Đây là AI;DR, bản tin AI của bạn cho thứ Ba, ngày 13 tháng 10.");
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

test("a re-voiced cut (same cue texts, new times) moves the cache onto the new times instead of translating again", async () => {
  const cues = parseSrt(EN_SRT);
  const out = await translateCues({ cues, title: TITLE, models: ["m1"], llm: answer(VI), style, log: () => {} });
  const revoiced = cues.map((c, i) => ({ ...c, start: `00:00:0${i},500`, end: `00:00:0${i},900` }));
  const moved = retime(out.cues, revoiced);
  assert.deepEqual(moved.map((c) => [c.start, c.end]), revoiced.map((c) => [c.start, c.end]));
  assert.deepEqual(moved.map((c) => c.vi), out.cues.map((c) => c.vi));
  assert.equal(subsMismatch(moved, revoiced), null);
  // A wording change is a new script: translate again.
  assert.equal(retime(out.cues, cues.map((c, i) => (i === 2 ? { ...c, text: "Wednesday." } : c))), null);
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

test("visub is one 16:9 cut with its own Vietnamese cover", () => {
  const rows = rowsFor(["en", "visub"]);
  const visub = rows.filter((r) => r.lang === "visub");
  assert.deepEqual(visub.map((r) => r.cut), ["2026-10-13-visub-16x9"]);
  assert.equal(visub[0].cover, join(dir, "renders", "cover-2026-10-13-visub-16x9.png"));
  assert.notEqual(visub[0].cover, rows.find((r) => r.cut === "2026-10-13-en-16x9").cover);
  assert.equal(visub[0].path, join(dir, "renders", "aidr-daily-2026-10-13-visub-16x9-1080p.mp4"));
  assert.equal(cutFor("visub").timeline, cutFor("en").timeline);
});

test("a visub cut STATUS says is done is skipped: rendered, or posted to the channel", () => {
  const [, , visub] = rowsFor(["en", "visub"]);
  assert.equal(needsRender(visub, { exists: () => false }), true);
  assert.equal(needsRender(visub, { exists: (p) => p === visub.path }), true);
  assert.equal(needsRender(visub, { exists: (p) => p === visub.path || p === visub.cover }), false);
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

  // Not uploaded (or the upload failed): the English video.
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

test("visub's Telegram button links its own YouTube video once it has one", () => {
  const rows = rowsFor(["en", "visub"]);
  rows[0].youtube = { id: "EN16x9abcde" };
  const visub = rows.find((r) => r.lang === "visub");
  visub.youtube = { id: "VIsub16x9ab" };
  const id = youtubeIdFor(visub, rows);
  assert.equal(id, "VIsub16x9ab");
  const [yt] = telegramPost({ date: "2026-10-13", lang: "visub", title: VI.title, youtubeId: id }).replyMarkup.inline_keyboard[0];
  assert.deepEqual(yt, { text: "▶ YouTube", url: "https://youtu.be/VIsub16x9ab" });
});

test("visub is uploaded to YouTube with Vietnamese metadata over English audio, and its STATUS id stops a second upload", () => {
  const rows = rowsFor(["en", "visub"]);
  const visub = rows.find((r) => r.lang === "visub");
  assert.deepEqual(uploadTodo(rows, ["visub"]), [visub]);
  const args = uploadArgs(visub, dir);
  const at = (f) => args[args.indexOf(f) + 1];
  assert.equal(args[0], visub.path);
  assert.equal(at("--meta"), join(dir, "youtube.visub.json"));
  assert.equal(at("--lang"), "vi"); // title and description: defaultLanguage
  assert.equal(at("--audio-lang"), "en"); // the English anchors: defaultAudioLanguage
  assert.equal(at("--kind"), "long");
  assert.equal(at("--cover"), join(dir, "renders", "cover-2026-10-13-visub-16x9.png")); // its Vietnamese cover is the thumbnail
  // The English cut is unchanged: posts.md, its own language for both.
  const en = uploadArgs(rows[0], dir);
  assert.deepEqual([en[en.indexOf("--meta") + 1], en[en.indexOf("--lang") + 1], en[en.indexOf("--audio-lang") + 1]], [join(dir, "posts.md"), "en", "en"]);

  // YouTube cannot replace a file: an id in STATUS (even from a run that failed after ID=) is never uploaded again.
  const up = parseUpload("ID=VIsub16x9ab\nFAIL: thumbnail (video VIsub16x9ab is uploaded)\n");
  assert.deepEqual(up, { id: "VIsub16x9ab", url: undefined, oembed: undefined, fail: "thumbnail (video VIsub16x9ab is uploaded)" });
  visub.youtube = { id: up.id };
  assert.deepEqual(uploadTodo(rows, ["visub"]), []);
  assert.deepEqual(parseUpload("FAIL: token (HTTP 400: invalid_grant)\n"), { id: undefined, url: undefined, oembed: undefined, fail: "token (HTTP 400: invalid_grant)" });
});

test("visub is attached to the Vietnamese day page with its 16:9 only", () => {
  const rows = rowsFor(["en", "visub"]);
  const visub = rows.find((r) => r.lang === "visub");
  assert.deepEqual(attachTodo(rows, ["visub"]), []);
  assert.deepEqual(attachTodo(rows, ["visub"], { dry: true }), ["visub"]);
  visub.youtube = { id: "VIsub16x9ab" };
  assert.deepEqual(attachTodo(rows, ["visub"]), ["visub"]);
  // No --short: the page keeps whatever Short it has.
  assert.deepEqual(dayVideoArgs({ date: "2026-10-13", lang: "visub", rows: [visub], title: VI.title }), [
    "day-video", "2026-10-13", "--lang", "vi", "--video", "VIsub16x9ab", "--title", VI.title,
  ]);
  const en = rows.filter((r) => r.lang === "en");
  en[0].youtube = { id: "EN16x9abcde" };
  en[1].youtube = { id: "EN9x16abcde" };
  assert.deepEqual(dayVideoArgs({ date: "2026-10-13", lang: "en", rows: en, title: TITLE }), [
    "day-video", "2026-10-13", "--lang", "en", "--video", "EN16x9abcde", "--short", "EN9x16abcde", "--title", TITLE,
  ]);
  visub.attached = true;
  assert.deepEqual(attachTodo(rows, ["visub"]), []);
});

test("the Vietnamese-voice cut wins the Vietnamese page: visub is neither uploaded nor attached over it", () => {
  const en = { "16x9": "EN16x9abcde", "9x16": "EN9x16abcde" };
  const voice = { "16x9": "VIvoice16x9", "9x16": "VIvoice9x16" };
  const subs = { "16x9": "VIsub16x9ab" };
  // Shape: attach sets the voice cut's 16:9 and Short together; the subtitled cut has a 16:9 only.
  assert.equal(viPageCut({ en, vi: voice }, []), "vi");
  assert.equal(viPageCut({ en, vi: subs }, []), "visub");
  assert.equal(viPageCut({ en, vi: {} }, []), null);
  // An old Worker serves the English ids on ?lang=vi: no Vietnamese video.
  assert.equal(viPageCut({ en, vi: en }, []), null);
  // A STATUS id decides over the shape.
  assert.equal(viPageCut({ en, vi: { "16x9": "VIvoice16x9" } }, [{ lang: "vi", youtube: { id: "VIvoice16x9" } }]), "vi");

  // Seeding: the voice cut never takes a subtitled 16:9 (it would attach it with a new Short), and the reverse.
  assert.deepEqual(seedIds("vi", { en, vi: subs }, []), {});
  assert.deepEqual(seedIds("visub", { en, vi: subs }, []), subs);
  assert.deepEqual(seedIds("visub", { en, vi: voice }, []), {});
  assert.deepEqual(seedIds("vi", { en, vi: voice }, []), voice);
  assert.deepEqual(seedIds("en", { en, vi: voice }, []), en);

  const rows = rowsFor(["en", "visub"]);
  const visub = rows.find((r) => r.lang === "visub");
  assert.deepEqual(uploadTodo(rows, ["visub"], "vi"), []);
  assert.equal(uploadTodo(rows, ["vi", "visub"]).some((r) => r.lang === "visub"), false);
  assert.deepEqual(uploadTodo([...rows, { lang: "vi", fmt: "16x9", youtube: { id: "VIvoice16x9" } }], ["visub"]), []);
  visub.youtube = { id: "VIsub16x9ab" };
  assert.deepEqual(attachTodo(rows, ["visub"], { viPage: "vi" }), []);
  assert.deepEqual(attachTodo(rows, ["visub"], { viPage: "visub" }), ["visub"]);
});

const POSTS = `<!-- posts:en -->
# Posts (EN) — AI;DR Daily 2026-10-13

## YouTube (16:9)

**Title** (56/100)

${TITLE}

**Description**

AI models hide capabilities. Tuesday, October 13, 2026.

1. Nvidia China shipments: Nvidia shipments fall 44% in China

Chapters
0:00 Intro
0:43 Nvidia China shipments

Sources
1. https://www.techmeme.com/261013/p2

Today's stories: https://aidr.today/date/2026-10-13
Every story, ranked and summarized daily: https://aidr.today

#AI #AINews #Nvidia

**Tags:** AI, AINews, Nvidia, AI;DR
**Captions:** upload \`captions.srt\` (English).

## YouTube Shorts (9:16)

**Title**

Short #Shorts
<!-- /posts:en -->
`;
const VI_LINES = {
  "AI models hide capabilities. Tuesday, October 13, 2026.": "Các model AI che giấu năng lực. Thứ Ba, 13/10/2026.",
  "Nvidia China shipments: Nvidia shipments fall 44% in China": "Nvidia tại Trung Quốc: lượng giao hàng giảm 44%",
  Chapters: "Chương",
  Intro: "Mở đầu",
  "Nvidia China shipments": "Nvidia tại Trung Quốc",
  Sources: "Nguồn",
  "Today's stories:": "Tin hôm nay:",
  "Every story, ranked and summarized daily:": "Mọi tin AI, xếp hạng và tóm tắt mỗi ngày:",
  "#AI #AINews #Nvidia": "#AI #TinAI #Nvidia",
  [TITLE]: VI.title,
};
const askedLines = (messages) => JSON.parse(messages[1].content.slice(messages[1].content.indexOf("\n\n"))).lines;
// A model that translates the lines it is asked for, from VI_LINES.
const postModel = (asked) => async (_model, messages) => {
  const lines = askedLines(messages);
  asked.push(...lines);
  return JSON.stringify({ lines: lines.map((l) => VI_LINES[l]) });
};

test("visub's YouTube description is the English one in Vietnamese: times, numbers and links kept, aidr.today in Vietnamese", async () => {
  const asked = [];
  const chain = () => ({ models: ["m1"], llm: postModel(asked) });
  const out = await translatePost({ en: enPost(POSTS), title: VI.title, chain, style, log: () => {} });
  assert.equal(out.model, "m1");
  assert.equal(out.title, VI.title);
  assert.equal(
    out.desc,
    `Các model AI che giấu năng lực. Thứ Ba, 13/10/2026.

1. Nvidia tại Trung Quốc: lượng giao hàng giảm 44%

Chương
0:00 Mở đầu
0:43 Nvidia tại Trung Quốc

Nguồn
1. https://www.techmeme.com/261013/p2

Tin hôm nay: https://aidr.today/date/2026-10-13?lang=vi
Mọi tin AI, xếp hạng và tóm tắt mỗi ngày: https://aidr.today/?lang=vi

#AI #TinAI #Nvidia`
  );
  assert.equal(out.tags, "AI, AINews, Nvidia, AI;DR, tin AI hôm nay, trí tuệ nhân tạo");
  assert.ok(!asked.includes(TITLE), "the caption title is reused, not translated again");

  // A re-voiced cut moves the chapter times: the cached lines are reused with no model call.
  const moved = { ...enPost(POSTS), desc: enPost(POSTS).desc.replace("0:43", "0:47") };
  const again = await translatePost({ en: moved, title: VI.title, cached: out.lines, chain: () => assert.fail("no model call"), style });
  assert.equal(again.model, null);
  assert.match(again.desc, /^0:47 Nvidia tại Trung Quốc$/m);

  // No caption title (a script without post.youtubeTitle): the English title is translated with the lines.
  const titled = await translatePost({ en: enPost(POSTS), title: null, chain: () => ({ models: ["m1"], llm: postModel([]) }), style, log: () => {} });
  assert.equal(titled.title, VI.title);
});

test("a description answer that drops a number or breaks the hashtags goes to the next model", async () => {
  const bad = async (_model, messages) => {
    const lines = askedLines(messages);
    return JSON.stringify({ lines: lines.map((l) => (l.startsWith("#") ? "#AI #tin tức AI #Nvidia" : l.includes("44%") ? "Nvidia giảm mạnh" : VI_LINES[l])) });
  };
  const tried = [];
  const out = await translatePost({
    en: enPost(POSTS),
    title: VI.title,
    chain: () => ({
      models: ["bad", "good"],
      llm: (m, msgs) => {
        tried.push(m);
        return m === "bad" ? bad(m, msgs) : postModel([])(m, msgs);
      },
    }),
    style,
    log: () => {},
  });
  assert.deepEqual(tried, ["bad", "good"]);
  assert.equal(out.model, "good");
  await assert.rejects(
    translatePost({ en: enPost(POSTS), title: VI.title, chain: () => ({ models: ["bad"], llm: bad }), style, log: () => {} }),
    /no valid Vietnamese YouTube description[\s\S]*number 44 is missing[\s\S]*hashtags/
  );
  // A link inside a line must survive; a translated title must fit YouTube's 100 characters.
  assert.ok(postLineProblems("l", "Read https://example.com/a now", "Đọc ngay").includes("l: link https://example.com/a is missing"));
  assert.deepEqual(postLineProblems("l", "Read https://example.com/a now", "Đọc https://example.com/a ngay"), []);
  const long = async (_model, messages) => JSON.stringify({ lines: askedLines(messages).map((l) => (l === TITLE ? `${VI.title} ${"x".repeat(60)}` : VI_LINES[l])) });
  await assert.rejects(
    translatePost({ en: enPost(POSTS), title: null, chain: () => ({ models: ["long"], llm: long }), style, log: () => {} }),
    /a title over 100 characters/
  );
});

test("aidr.today links in the Vietnamese description open the Vietnamese site", () => {
  assert.equal(
    viLinks("https://aidr.today\nhttps://aidr.today/\nhttps://aidr.today/date/2026-10-13\nhttps://www.techmeme.com/261013/p2"),
    "https://aidr.today/?lang=vi\nhttps://aidr.today/?lang=vi\nhttps://aidr.today/date/2026-10-13?lang=vi\nhttps://www.techmeme.com/261013/p2"
  );
});

test("yt-meta.py --json gives the uploaders visub's metadata with the Vietnamese channel links before the hashtags", () => {
  const tmp = mkdtempSync(join(tmpdir(), "visub-meta-"));
  try {
    const file = join(tmp, "youtube.visub.json");
    writeFileSync(file, JSON.stringify({ title: VI.title, desc: "Tóm tắt.\n\nTin hôm nay: https://aidr.today/date/2026-10-13?lang=vi\n\n#AI #TinAI", tags: "AI, tin AI hôm nay" }));
    const bin = resolve(import.meta.dirname, "../../../.agents/skills/aidr-youtube-upload/bin/yt-meta.py");
    const m = JSON.parse(execFileSync("python3", ["-I", bin, "--json", file, "--lang", "vi", "--kind", "long"], { encoding: "utf8" }));
    assert.equal(m.title, VI.title);
    assert.equal(m.tags, "AI, tin AI hôm nay");
    assert.match(m.desc, /\?lang=vi\nTiện ích Chrome: \S+\nTelegram: https:\/\/t\.me\/aihomnay\nFacebook: \S+\n\n#AI #TinAI$/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
