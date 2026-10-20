// node --test videos/daily-news/scripts/*.test.mjs
// The visub cut's screen text: Vietnamese over the English script, voice and timing unchanged.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { runBuild, scratchRoot } from "./scratch-root.mjs";
import { parseSrt } from "./visub.mjs";
import {
  applyScreen,
  categoryLabels,
  fieldProblems,
  screenFields,
  translateScreen,
} from "./visub-screen.mjs";

const STYLE = { style: "HOUSE STYLE", overview: "OVERVIEW" };
const EDITION = {
  date: "1999-01-05",
  stories: [
    {
      rank: 1,
      category: "Chips",
      title: "Nvidia's AI chip shipments in China fell 44% to 678K",
      title_vi: "Lượng chip AI Nvidia xuất sang Trung Quốc giảm 44%",
      text: "Nvidia shipped 678,000 AI chips to China in H1 2026, down 44%.",
      text_vi:
        "Nvidia xuất 678.000 chip AI sang Trung Quốc trong H1 2026, giảm 44%.",
      source: "techmeme.com",
    },
    {
      rank: 2,
      category: "Research",
      title: "AI Models Can Provably Hide Arbitrary Capabilities",
      title_vi: "Mô hình AI có thể che giấu năng lực tùy ý",
      text: "Researchers show models can hide computations from audits.",
      text_vi:
        "Các nhà nghiên cứu cho thấy mô hình có thể giấu phép tính khỏi kiểm tra.",
      source: "arxiv.org",
    },
  ],
};
const voice = (text) => [{ anchor: "alex", text }];
const SCRIPT = {
  date: "1999-01-05",
  dateline: "Tuesday, January 5, 1999",
  theme: { intro: "grid", transition: "wipe", background: "paper" },
  thumb: { story: 1, hook: "Nvidia loses China share" },
  intro: {
    voice: voice("This is AI DR, your AI news. Nvidia leads today."),
    title: "Two stories that matter today",
    focus: [{ rank: 1, word: "Nvidia" }],
  },
  stories: [
    {
      rank: 1,
      kicker: "Nvidia China shipments",
      headline: "Nvidia shipments *fall 44%* in China",
      stat: "678,000",
      statLabel: "H1 2026 China shipments",
      statWord: "six",
      layout: "split",
      images: [],
      voice: voice(
        "Nvidia shipped six hundred seventy eight thousand chips to China, down forty four percent."
      ),
    },
    {
      rank: 2,
      kicker: "AI safety research",
      headline: "Models *hide arbitrary* capabilities from audits",
      stat: "Proof of concept",
      statLabel: "Released to improve defenses",
      statWord: "proof",
      layout: "split",
      images: [],
      paper: {
        venue: "arxiv.org",
        title: "AI Models Can Provably Hide Arbitrary Capabilities",
      },
      voice: voice(
        "Researchers show models can hide capabilities, with proof of concept models."
      ),
    },
  ],
  outro: {
    voice: voice("That's AI DR for today, at aidr dot today."),
    title: "What's happening in AI today?",
  },
  post: { youtubeTitle: "Nvidia and more | 1999-01-05" },
};

// A good answer for every field the model is asked about, keyed as the prompt asks.
const GOOD = {
  "s1.kicker": "Chip Nvidia sang Trung Quốc",
  "s1.headline": "Lượng chip Nvidia *giảm 44%* tại Trung Quốc",
  "s1.stat": "678.000",
  "s1.statLabel": "Chip sang Trung Quốc trong H1 2026",
  "s2.kicker": "Nghiên cứu an toàn AI",
  "s2.headline": "Mô hình *giấu năng lực* khi bị kiểm tra",
  "s2.stat": "Bằng chứng khái niệm",
  "s2.statLabel": "Phát hành để cải thiện phòng vệ",
  "intro.title": "Hai tin đáng chú ý hôm nay",
  "outro.title": "Hôm nay AI có gì mới?",
  "thumb.hook": "Nvidia mất thị phần Trung Quốc",
};
const asked = (messages) =>
  [...messages[1].content.matchAll(/"key": "([^"]+)"/g)].map((m) => m[1]);
/** A fake model chain: `answers[model]` maps a key to its answer (default GOOD); records what each call asked. */
function fakeLlm(answers = {}) {
  const calls = [];
  const llm = async (model, messages) => {
    const keys = asked(messages);
    calls.push({ model, keys });
    return JSON.stringify({
      fields: Object.fromEntries(
        keys.map((k) => [k, answers[model]?.[k] ?? GOOD[k]])
      ),
    });
  };
  return { llm, calls };
}

test("screen fields the edition or the Vietnamese mail already has take that copy, with no model call", async () => {
  const { llm, calls } = fakeLlm();
  const fields = await translateScreen({
    script: SCRIPT,
    edition: EDITION,
    models: ["m1"],
    llm,
    style: STYLE,
    log: () => {},
  });
  // CATEGORY_VI is read from apps/web/worker/mail/render.ts, the copy the Vietnamese mail shows.
  assert.equal(categoryLabels().Chips, "Chip");
  assert.deepEqual(fields["s1.category"], {
    en: "Chips",
    vi: "Chip",
    from: "edition",
  });
  assert.deepEqual(fields["s2.category"], {
    en: "Research",
    vi: "Nghiên cứu",
    from: "edition",
  });
  // The paper card's title is the edition's title, so it is the site's Vietnamese title.
  assert.deepEqual(fields["s2.paper.title"], {
    en: EDITION.stories[1].title,
    vi: EDITION.stories[1].title_vi,
    from: "edition",
  });
  const modelKeys = calls.flatMap((c) => c.keys);
  for (const k of ["s1.category", "s2.category", "s2.paper.title"])
    assert.ok(!modelKeys.includes(k), `${k} is not sent to the model`);
  assert.deepEqual(modelKeys.sort(), Object.keys(GOOD).sort());
});

test("the model gets the site's Vietnamese for the story as the wording to follow", async () => {
  const { llm } = fakeLlm();
  const prompts = [];
  const spy = (model, messages) => {
    prompts.push(messages[1].content);
    return llm(model, messages);
  };
  await translateScreen({
    script: SCRIPT,
    edition: EDITION,
    models: ["m1"],
    llm: spy,
    style: STYLE,
    log: () => {},
  });
  assert.ok(prompts[0].includes(EDITION.stories[0].text_vi));
});

test("a model answer that drops a number, a marker or a name goes to the next model; the good fields are kept", async () => {
  const { llm, calls } = fakeLlm({
    m1: {
      "s1.headline": "Lượng chip Nvidia giảm mạnh tại Trung Quốc", // number 44 and the *marker* lost
      "s1.kicker": "Chip sang Trung Quốc", // "Nvidia" is in the site's Vietnamese, so it must stay
      "s2.headline":
        "Các mô hình AI có thể *giấu năng lực tùy ý* khỏi mọi cuộc kiểm tra năng lực", // 16 words, limit 12
    },
  });
  const fields = await translateScreen({
    script: SCRIPT,
    edition: EDITION,
    models: ["m1", "m2"],
    llm,
    style: STYLE,
    log: () => {},
  });
  assert.deepEqual(calls[1], {
    model: "m2",
    keys: ["s1.kicker", "s1.headline", "s2.headline"],
  });
  assert.equal(fields["s1.headline"].vi, GOOD["s1.headline"]);
  assert.equal(fields["s1.headline"].from, "m2");
  assert.equal(fields["s1.stat"].from, "m1");
  assert.equal(fields["s1.stat"].vi, "678.000");
});

test("with one model, a failed field is asked again with its problem, and the second answer counts", async () => {
  const prompts = [];
  let call = 0;
  const llm = async (_model, messages) => {
    prompts.push(messages[1].content);
    const keys = asked(messages);
    const kicker =
      call++ === 0
        ? "Lô hàng chip AI của Nvidia sang Trung Quốc"
        : GOOD["s1.kicker"];
    return JSON.stringify({
      fields: Object.fromEntries(
        keys.map((k) => [k, k === "s1.kicker" ? kicker : GOOD[k]])
      ),
    });
  };
  const fields = await translateScreen({
    script: SCRIPT,
    edition: EDITION,
    models: ["m1"],
    llm,
    style: STYLE,
    log: () => {},
  });
  assert.equal(prompts.length, 2);
  assert.match(
    prompts[1],
    /"fix": "\\"Lô hàng chip AI của Nvidia sang Trung Quốc\\": s1\.kicker: 9 words, 1-6 allowed"/
  );
  assert.deepEqual(asked([{}, { content: prompts[1] }]), ["s1.kicker"]);
  assert.equal(fields["s1.kicker"].vi, GOOD["s1.kicker"]);
});

test("a label made of names may stay as written, and 100K may become 100.000", () => {
  assert.deepEqual(
    fieldProblems(
      "s1.kicker",
      "Broadcom x Anthropic",
      "Broadcom x Anthropic",
      EDITION
    ),
    []
  );
  assert.deepEqual(
    fieldProblems("s1.kicker", "ChatGPT for Mac", "ChatGPT for Mac", EDITION),
    []
  );
  assert.match(
    fieldProblems(
      "s1.headline",
      "Nvidia shipments fall in China",
      "Nvidia shipments fall in China",
      EDITION
    ).join(),
    /not translated/
  );
  assert.deepEqual(
    fieldProblems(
      "s1.statLabel",
      "seed · 100K neuro-sensors",
      "vòng seed · 100.000 cảm biến",
      EDITION
    ),
    []
  );
  assert.deepEqual(
    fieldProblems(
      "s1.statLabel",
      "seed · 100K neuro-sensors",
      "vòng seed · 100K cảm biến",
      EDITION
    ),
    []
  );
  assert.match(
    fieldProblems(
      "s1.statLabel",
      "seed · 100K neuro-sensors",
      "vòng seed · 10.000 cảm biến",
      EDITION
    ).join(),
    /missing/
  );
});

test("no valid answer for a field fails loudly, naming the field", async () => {
  const { llm } = fakeLlm({
    m1: { "s1.stat": "nhiều" },
    m2: { "s1.stat": "" },
  });
  await assert.rejects(
    translateScreen({
      script: SCRIPT,
      edition: EDITION,
      models: ["m1", "m2"],
      llm,
      style: STYLE,
      log: () => {},
    }),
    /no valid Vietnamese screen text for s1\.stat/
  );
  await assert.rejects(
    translateScreen({
      script: SCRIPT,
      edition: EDITION,
      models: [],
      llm,
      style: STYLE,
    }),
    /ANYROUTER_API_KEY/
  );
});

test("the cache is reused while the English is unchanged; an edited field alone is translated again", async () => {
  const first = await translateScreen({
    script: SCRIPT,
    edition: EDITION,
    models: ["m1"],
    llm: fakeLlm().llm,
    style: STYLE,
    log: () => {},
  });
  const again = fakeLlm();
  const same = await translateScreen({
    script: SCRIPT,
    edition: EDITION,
    cached: first,
    models: ["m1"],
    llm: again.llm,
    style: STYLE,
  });
  assert.equal(again.calls.length, 0);
  assert.deepEqual(same, first);

  const edited = structuredClone(SCRIPT);
  edited.stories[1].headline = "Models *hide* capabilities";
  const once = fakeLlm({ m1: { "s2.headline": "Mô hình *giấu* năng lực" } });
  const next = await translateScreen({
    script: edited,
    edition: EDITION,
    cached: first,
    models: ["m1"],
    llm: once.llm,
    style: STYLE,
  });
  assert.deepEqual(
    once.calls.map((c) => c.keys),
    [["s2.headline"]]
  );
  assert.equal(next["s2.headline"].vi, "Mô hình *giấu* năng lực");
});

test("field checks: markers, word limits, numbers", () => {
  const p = (key, en, vi) => fieldProblems(key, en, vi, EDITION);
  assert.deepEqual(
    p("s1.headline", SCRIPT.stories[0].headline, GOOD["s1.headline"]),
    []
  );
  assert.match(
    p(
      "s1.headline",
      SCRIPT.stories[0].headline,
      "*Lượng chip Nvidia giảm 44% tại Trung Quốc*"
    ).join(),
    /not none or all/
  );
  assert.match(
    p(
      "s1.headline",
      SCRIPT.stories[0].headline,
      "Lượng chip *Nvidia* *giảm 44%* tại Trung Quốc"
    ).join(),
    /marker/
  );
  assert.match(
    p(
      "s2.kicker",
      "AI safety research",
      "Một nghiên cứu mới về an toàn của AI"
    ).join(),
    /9 words, 1-6/
  );
  assert.match(
    p("s1.stat", "678,000", "678").join(),
    /number 678000 is missing/
  );
});

test("applyScreen swaps only screen text: voice, statWord and focus stay English, the English dateline goes", async () => {
  const fields = await translateScreen({
    script: SCRIPT,
    edition: EDITION,
    models: ["m1"],
    llm: fakeLlm().llm,
    style: STYLE,
    log: () => {},
  });
  const vi = applyScreen(SCRIPT, EDITION, fields);
  assert.equal(vi.stories[0].kicker, GOOD["s1.kicker"]);
  assert.equal(vi.stories[0].category, "Chip");
  assert.equal(vi.stories[1].paper.title, EDITION.stories[1].title_vi);
  assert.equal(vi.stories[1].paper.venue, "arxiv.org");
  assert.equal(vi.thumb.hook, GOOD["thumb.hook"]);
  assert.equal(vi.dateline, undefined);
  for (const [a, b] of vi.stories.map((s, i) => [s, SCRIPT.stories[i]])) {
    assert.deepEqual(a.voice, b.voice);
    assert.equal(a.statWord, b.statWord);
  }
  assert.deepEqual(vi.intro.focus, SCRIPT.intro.focus);
  assert.equal(
    SCRIPT.stories[0].kicker,
    "Nvidia China shipments",
    "the English script is not mutated"
  );

  const edited = structuredClone(SCRIPT);
  edited.stories[0].kicker = "Nvidia in China";
  assert.throws(
    () => applyScreen(edited, EDITION, fields),
    /screen\.visub\.json does not match script\.json \(s1\.kicker\)/
  );
  assert.deepEqual(
    Object.keys(screenFields(SCRIPT, EDITION)).sort(),
    [
      ...Object.keys(GOOD),
      "s1.category",
      "s2.category",
      "s2.paper.title",
    ].sort()
  );
});

const DATE = EDITION.date;
const scratch = scratchRoot();
const DIR = join(scratch.dn, "editions", DATE);
after(scratch.cleanup);

const build = (...args) => {
  const run = runBuild(scratch.dn, [DATE, "--no-voice", "--no-audio", ...args]);
  if (run.status !== 0) throw new Error(run.stderr);
};
const html = (out, name) =>
  readFileSync(join(DIR, out, name, "index.html"), "utf8");
const duration = (page) =>
  page.match(/id="root"[^>]*data-duration="([\d.]+)"/)[1];

test("the visub build shows Vietnamese labels, dateline and screen text, has its own cover, and keeps the English timing", async () => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, "edition.json"), JSON.stringify(EDITION));
  writeFileSync(join(DIR, "script.json"), JSON.stringify(SCRIPT));
  build();
  const enBefore = html("out", "16x9");
  const enCover = html("out", "cover-16x9");

  const cues = parseSrt(readFileSync(join(DIR, "captions.srt"), "utf8"));
  writeFileSync(
    join(DIR, "captions.visub.json"),
    JSON.stringify({
      cues: cues.map((c) => ({
        start: c.start,
        end: c.end,
        en: c.text,
        vi: "chữ Việt",
      })),
    })
  );
  assert.throws(
    () => build("--lang", "visub"),
    /screen\.visub\.json is missing/
  );
  const fields = await translateScreen({
    script: SCRIPT,
    edition: EDITION,
    models: ["m1"],
    llm: fakeLlm().llm,
    style: STYLE,
    log: () => {},
  });
  writeFileSync(
    join(DIR, "screen.visub.json"),
    JSON.stringify({ lang: "vi", fields })
  );
  build("--lang", "visub");

  const page = html("out-visub", "16x9");
  assert.match(page, /<html lang="vi">/);
  for (const label of [
    "BẢN TIN NGÀY",
    "TOP 2 HÔM NAY",
    "Thứ Ba, 5 tháng 1, 1999",
    "nguồn <b>techmeme.com</b>",
    "THÁNG 1 1999",
    "AI;DR MỖI NGÀY",
    "TOP 2 TIN AI",
  ])
    assert.ok(page.includes(label), `visub shows ${label}`);
  assert.ok(
    page.includes(
      'Lượng chip Nvidia <span class="mk">giảm 44%</span> tại Trung Quốc'
    ),
    "the marker sits on the Vietnamese words"
  );
  for (const vi of [
    GOOD["s1.kicker"],
    GOOD["s2.statLabel"],
    GOOD["intro.title"],
    GOOD["outro.title"],
    "Nghiên cứu",
    EDITION.stories[1].title_vi,
    "Bản tin mới mỗi ngày",
  ])
    assert.ok(page.includes(vi), `visub shows ${vi}`);
  for (const en of [
    "DAILY BRIEF",
    "TOP 2 TODAY",
    "Tuesday",
    "Nvidia China shipments",
    "fall 44%",
    "Two stories",
    "What&#39;s happening",
    "Research<",
    ">via ",
  ])
    assert.ok(!page.includes(en), `visub does not show ${en}`);
  assert.equal(
    duration(page),
    duration(enBefore),
    "visub keeps the English timeline"
  );

  const cover = html("out-visub", "cover-16x9");
  assert.ok(
    cover.includes(GOOD["thumb.hook"]) &&
      cover.includes(GOOD["s2.kicker"]) &&
      cover.includes("THÁNG 1 1999")
  );
  assert.ok(!cover.includes("Nvidia loses China share"));

  // The English cut never reads screen.visub.json.
  build();
  assert.equal(html("out", "16x9"), enBefore);
  assert.equal(html("out", "cover-16x9"), enCover);
  for (const en of [
    "DAILY BRIEF",
    "TOP 2 TODAY",
    "Tuesday, January 5, 1999",
    "Nvidia China shipments",
  ])
    assert.ok(enBefore.includes(en), `en shows ${en}`);
});
