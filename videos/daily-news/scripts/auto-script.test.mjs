// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  complete,
  estimateSeconds,
  fromModel,
  pacingProblems,
  speakable,
  statSpoken,
  templateScript,
  templateStory,
  validateScript,
  videoModels,
  vnToday,
  workerChatChain,
  writeScript,
} from "./auto-script.mjs";
import { castProblems } from "./cast.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(resolve(ROOT, "config.json"), "utf8"));
const edition = JSON.parse(
  readFileSync(resolve(ROOT, "editions/2026-10-10/edition.json"), "utf8")
);
const hosts = ["alex", "allison", "tyler-cruz", "ivanna", "kristen"];
const quiet = () => {};

test("the template script is valid, fact-checked, and has no draft markers publish.mjs would refuse", () => {
  const s = templateScript(edition, hosts);
  assert.deepEqual(validateScript(s, edition), []);
  assert.doesNotMatch(JSON.stringify(s), /TODO|_bullet/);
  assert.deepEqual(
    castProblems([
      ...s.intro.voice,
      ...s.stories.flatMap((x) => x.voice),
      ...s.outro.voice,
    ]),
    []
  );
});

test("a stat that repeats the category label or the kicker is rejected", () => {
  const s = templateScript(edition, hosts);
  const story = s.stories[0];
  const src = edition.stories.find((x) => x.rank === story.rank);
  for (const stat of [src.category, story.kicker.toUpperCase()]) {
    s.stories[0] = { ...story, stat };
    assert.match(
      validateScript(s, edition).join(),
      /repeats the kicker or category/,
      stat
    );
  }
});

test("a headline marks exactly one span, the screen's one focal point", () => {
  const s = templateScript(edition, hosts);
  const story = s.stories[0];
  for (const [headline, n] of [
    ["OpenAI *softens* on *chip controls*", 2],
    ["OpenAI softens on chip controls", 0],
  ]) {
    s.stories[0] = { ...story, headline };
    assert.match(
      validateScript(s, edition).join(),
      new RegExp(`headline marks ${n} spans, not one`),
      headline
    );
  }
});

test("a headline that only restates the first voice sentence is rejected; one that adds to it passes", () => {
  const s = templateScript(edition, hosts);
  const story = s.stories[0];
  const voice = [
    {
      anchor: story.voice[0].anchor,
      text: "DeepSeek has open-sourced DeepInfer, its inference engine. It serves DeepSeek models at scale.",
    },
  ];
  const problems = (headline) => {
    s.stories[0] = { ...story, headline, voice, statWord: null };
    return validateScript(s, edition).join();
  };
  assert.match(
    problems("DeepSeek *open-sources DeepInfer*, its serving engine"),
    /headline repeats the first voice sentence/
  );
  assert.doesNotMatch(
    problems("The engine behind *DeepSeek's own chat*"),
    /headline repeats/
  );
});

test("a topic label is not a stat when the bullet has a figure; a label is fine when it has none", () => {
  const s = templateScript(edition, hosts);
  const withFigure = s.stories.findIndex((x) => /\d/.test(x.stat));
  const without = s.stories.findIndex((x) => !/\d/.test(x.stat));
  assert.ok(withFigure >= 0 && without >= 0, "the fixture has both kinds");
  s.stories[withFigure] = { ...s.stories[withFigure], stat: "Policy shift" };
  assert.match(
    validateScript(s, edition).join(),
    /stat "Policy shift" is not a figure, but the bullet has one/
  );
  s.stories[withFigure] = templateScript(edition, hosts).stories[withFigure];
  s.stories[without] = { ...s.stories[without], stat: "Policy shift" };
  assert.deepEqual(validateScript(s, edition), []);
});

test("a headline marker that holds the stat's figure is rejected, in any written form of it", () => {
  const s = templateScript(edition, hosts);
  const i = s.stories.findIndex((x) => x.stat === "$870M");
  assert.ok(i >= 0, "the fixture has a $870M story");
  for (const headline of [
    "*$870M bet* on AI coding",
    "A *$870 million* bet on coding",
  ]) {
    s.stories[i] = { ...s.stories[i], headline };
    assert.match(
      validateScript(s, edition).join(),
      /headline marker repeats the stat "\$870M"/,
      headline
    );
  }
  s.stories[i] = {
    ...s.stories[i],
    headline: "A *big bet* on $870M of coding",
  };
  assert.deepEqual(validateScript(s, edition), []);
});

test("the intro is one line that opens on the news: no greeting, no show name, no date line", () => {
  const s = templateScript(edition, hosts);
  assert.equal(s.intro.voice.length, 1);
  assert.doesNotMatch(s.intro.voice[0].text, /this is|ai dr|welcome/i);
  assert.match(s.intro.voice[0].text, /^First up: /);
});

test("a model intro that opens with a greeting or the show name is rejected", () => {
  const s = templateScript(edition, hosts);
  for (const bad of [
    "This is AI DR, your AI news for Friday.",
    "Welcome back to AI DR.",
    "Hello, here is today's AI news.",
    "Good morning, AI news.",
  ]) {
    s.intro.voice = [{ anchor: s.intro.voice[0].anchor, text: bad }];
    assert.match(
      validateScript(s, edition).join(),
      /opens with a greeting or the show name/,
      bad
    );
  }
  for (const ok of [
    "Nvidia leads a busy day.",
    "This is the biggest week for chips.",
    "Hi-tech chips lead today.",
    "Here is Anthropic's new model.",
  ]) {
    s.intro.voice = [{ anchor: s.intro.voice[0].anchor, text: ok }];
    assert.doesNotMatch(
      validateScript(s, edition).join(),
      /greeting or the show name/,
      ok
    );
  }
});

test("a failing model falls back to the template, trimmed to fit the Reel length", async () => {
  const llm = async () => {
    throw new Error("anyrouter 503");
  };
  const { script, source } = await writeScript({
    edition,
    config,
    hostKeys: hosts,
    maxSeconds: 80,
    models: ["m1", "m2"],
    llm,
    log: quiet,
  });
  assert.equal(source, "template");
  assert.ok(estimateSeconds(script, config) <= 80);
  assert.ok(
    script.stories.length >= 3 && script.stories.length < edition.stories.length
  );
});

test("a model that invents a number is rejected (facts come only from the bullet)", async () => {
  const answer = {
    stories: edition.stories.map((s) => ({
      rank: s.rank,
      kicker: "Some company",
      headline: "*Big news* about something today",
      stat: "$99B",
      statLabel: "made up",
      statWord: "99",
      voice: ["Some company has $99 billion."],
    })),
    introLine: "Big news today.",
    post: {
      hook: "h",
      facebook: "f",
      youtubeTitle: "t",
      shortsTitle: "s",
      tiktok: "k",
      hashtags: ["AI", "AINews", "X"],
    },
  };
  const { source } = await writeScript({
    edition,
    config,
    hostKeys: hosts,
    maxSeconds: 200,
    models: ["m"],
    llm: async () => JSON.stringify(answer),
    log: quiet,
  });
  assert.equal(source, "template");
  assert.match(
    validateScript(
      fromModel(JSON.stringify(answer), edition, hosts),
      edition
    ).join(),
    /number 99 is not in the bullet/
  );
});

test("a valid model answer is used; anchors come from the cast, not the model", async () => {
  const three = { ...edition, stories: edition.stories.slice(0, 3) };
  const answer = {
    stories: answerWith({
      voice: ["This story is in the bullet.", "It matters for builders."],
    }).stories,
    introLine: "Stocks slide today.",
    focus: [{ rank: 1, word: "stocks" }],
    thumbRank: 2,
    post: {
      hook: "Hook.",
      facebook: "Today in AI.",
      youtubeTitle: "AI News Today | Oct 10, 2026",
      shortsTitle: "AI today #Shorts",
      tiktok: "What do you think?",
      hashtags: ["#AI", "AINews", "OpenAI"],
    },
  };
  const { script, source } = await writeScript({
    edition: three,
    config,
    hostKeys: hosts,
    maxSeconds: 200,
    models: ["m"],
    llm: async () => `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``,
    log: quiet,
  });
  assert.equal(source, "m");
  assert.equal(script.post.shortsTitle, "AI today");
  assert.deepEqual(script.post.hashtags, ["AI", "AINews", "OpenAI"]);
  assert.equal(script.thumb.story, 2);
  assert.ok(
    script.stories.every((s) => s.voice.every((v) => hosts.includes(v.anchor)))
  );
});

const three = { ...edition, stories: edition.stories.slice(0, 3) };
// The stat is the bullet's figure when it has one (validateScript rejects a label then), spoken in a closing sentence.
const statOf = (s) => {
  const { stat } = templateStory(s);
  return /\d/.test(stat)
    ? {
        stat,
        statWord: stat.match(/\d[\d,.]*/)[0],
        said: `It says ${speakable(stat)}.`,
      }
    : { stat: "Today", statWord: "This", said: "" };
};
const answerWith = ({ voice, thumbHook }) => ({
  stories: three.stories.map((s) => {
    const { stat, statWord, said } = statOf(s);
    return {
      rank: s.rank,
      kicker: "AI news",
      headline: "*A real headline* for this story",
      stat,
      statLabel: "the state of play",
      statWord,
      voice: said ? [voice[0], said] : voice,
    };
  }),
  introLine: "Stocks slide today.",
  thumbRank: 2,
  thumbHook,
  post: {
    hook: "Hook.",
    facebook: "Today in AI.",
    youtubeTitle: "AI News Today | Oct 10, 2026",
    shortsTitle: "AI today",
    tiktok: "What do you think?",
    hashtags: ["AI", "AINews", "OpenAI"],
  },
});
const paced = answerWith({
  voice: ["This story is in the bullet.", "It matters for builders."],
  thumbHook: "Chips slide in one day",
});
const breathless = answerWith({
  voice: [
    "This story is in the bullet and it keeps going with clause after clause until nobody can follow it.",
  ],
  thumbHook: "AI news",
});

test("a story opens on a short sentence, the intro is one beat, and the cover hook is a phrase, not a label", () => {
  const ok = fromModel(JSON.stringify(paced), three, hosts);
  assert.deepEqual(pacingProblems(ok), []);
  assert.equal(ok.thumb.hook, "Chips slide in one day");
  const bad = fromModel(JSON.stringify(breathless), three, hosts);
  bad.intro.voice[0].text =
    "Stocks slide today as chips fall, rates rise, and every lab ships a model at once.";
  const problems = pacingProblems(bad).join();
  assert.match(problems, /story 1: first sentence has 19 words/);
  assert.match(problems, /intro line has 16 words/);
  assert.match(problems, /thumb.hook has 2 words/);
});

test("a paced model answer beats an earlier one that is valid but breathless", async () => {
  const answers = { m1: breathless, m2: paced };
  const { script, source } = await writeScript({
    edition: three,
    config,
    hostKeys: hosts,
    maxSeconds: 200,
    models: ["m1", "m2"],
    llm: async (m) => JSON.stringify(answers[m]),
    log: quiet,
  });
  assert.equal(source, "m2");
  assert.equal(script.thumb.hook, "Chips slide in one day");
});

test("a valid but breathless model answer still beats the bullet-copy template", async () => {
  const { source } = await writeScript({
    edition: three,
    config,
    hostKeys: hosts,
    maxSeconds: 200,
    models: ["m1", "m2"],
    llm: async (m) => (m === "m1" ? JSON.stringify(breathless) : "not json"),
    log: quiet,
  });
  assert.equal(source, "m1");
});

test("a cover hook with a number the stories lack is rejected", () => {
  const s = fromModel(
    JSON.stringify({ ...paced, thumbHook: "Chips slide 99 percent" }),
    three,
    hosts
  );
  assert.match(
    validateScript(s, three).join(),
    /thumb.hook: number 99 is not in the stories/
  );
});

test("speakable reads money units; vnToday is UTC+7", () => {
  assert.equal(
    speakable("raised ~$870M at a $7.5B valuation"),
    "raised about $870 million at a $7.5 billion valuation"
  );
  assert.equal(vnToday(new Date("2026-10-10T18:00:00Z")), "2026-10-11");
  assert.equal(vnToday(new Date("2026-10-10T16:00:00Z")), "2026-10-10");
});

test("a stat counts as spoken in any equivalent spoken form, but a different number does not", () => {
  const spoken = [
    ["$25B", "Anthropic raised 25 billion dollars this week."],
    ["$25B", "Anthropic raised $25 billion this week."],
    ["$25B", "It raised $25,000,000,000 in a round."],
    ["$25B", "It raised twenty. Then $25B came in."],
    ["25", "A $25 billion round."],
    ["4.2%", "Growth hit 4.2 percent."],
    ["4.2 percent", "Growth hit 4.2% in a year."],
    ["1.5M", "Over 1.5 million users joined."],
    ["1,500", "Over 1.5 thousand users joined."],
    ["$300K", "A 300 THOUSAND dollar grant."],
  ];
  for (const [stat, voice] of spoken)
    assert.ok(statSpoken(voice, stat), `${stat} in "${voice}"`);
  const notSpoken = [
    ["$25B", "Anthropic raised $250 billion."],
    ["$25B", "Anthropic raised 25 million dollars."],
    ["$25B", "Anthropic raised $52 billion."],
    ["4.2%", "Growth hit 4.2 billion."],
    ["4.2%", "Growth hit 4.3 percent."],
    ["25%", "Growth hit 25 users."],
  ];
  for (const [stat, voice] of notSpoken)
    assert.equal(statSpoken(voice, stat), false, `${stat} in "${voice}"`);
});

test("the video model chain is gpt-5.6-luna, then the Worker's chat chain read from wrangler.toml", () => {
  const dir = mkdtempSync(join(tmpdir(), "aidr-chain-"));
  try {
    const toml = join(dir, "wrangler.toml");
    writeFileSync(
      toml,
      '# ANYROUTER_MODEL = "commented/out"\nANYROUTER_MODEL = "a/one, b/two,anthropic/claude-x"\nANYROUTER_TLDR_MODEL = "c/three"\n'
    );
    assert.deepEqual(workerChatChain(toml), [
      "a/one",
      "b/two",
      "anthropic/claude-x",
    ]);
    writeFileSync(toml, 'ANYROUTER_TLDR_MODEL = "c/three"\n');
    assert.throws(() => workerChatChain(toml), /ANYROUTER_MODEL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const chain = videoModels(null);
  assert.deepEqual(chain, [
    "openai/gpt-5.6-luna",
    ...workerChatChain().filter((m) => m !== "openai/gpt-5.6-luna"),
  ]);
  assert.ok(chain.length >= 3, "at least two fallbacks after the head");
  assert.deepEqual(videoModels(" x/one , y/two "), ["x/one", "y/two"]);
});

test("a Claude id is asked without temperature, which it rejects with a 400", async () => {
  const bodies = {};
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies[body.model] = body;
    return new Response('data: {"choices":[{"delta":{"content":"{}"}}]}\n');
  };
  for (const model of ["anthropic/claude-sonnet-5-5", "google/gemma-latest"])
    assert.equal(
      await complete({
        model,
        messages: [],
        apiKey: "k",
        baseUrl: "http://x",
        fetchImpl,
      }),
      "{}"
    );
  assert.equal("temperature" in bodies["anthropic/claude-sonnet-5-5"], false);
  assert.equal(bodies["google/gemma-latest"].temperature, 0.4);
});
