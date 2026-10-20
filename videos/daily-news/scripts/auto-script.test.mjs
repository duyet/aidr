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
  speakable,
  statSpoken,
  templateScript,
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
    stories: three.stories.map((s) => ({
      rank: s.rank,
      kicker: "AI news",
      headline: "*A real headline* for this story",
      stat: "Today",
      statLabel: "the state of play",
      statWord: "This",
      voice: ["This story is in the bullet.", "It matters for builders."],
    })),
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

// 2026-10-16: the video chain was gpt-5.6-luna then gemini-3-flash, and AnyRouter refused gemini (#875).
test("the video model chain is gpt-5.6-luna, then the Worker's chat chain read from wrangler.toml, paid Claude last", () => {
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
  assert.match(chain.at(-1), /^anthropic\//, "the paid model is tried last");
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
