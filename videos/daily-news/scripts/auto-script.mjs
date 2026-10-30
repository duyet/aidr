#!/usr/bin/env node
// Write the day's script.json without an agent, for the scheduled Reel (.github/workflows/daily-reel.yml).
// The edition is the published one the site shows (fetch.mjs → /api/public?lang=en). The model writes the
// screen text and anchor lines through anyrouter (the Worker's LLM path); anything it returns is checked
// (facts: every number must be in the bullet; statWord/focus words must be spoken; title caps; no bait).
// If no model gives a valid script, a deterministic template built from the bullets is used instead.
// Anchors are never chosen by the model: the seeded cast order (cast.mjs) assigns them.
// Length: stories are dropped from the bottom until the estimated length fits --max-seconds (default 80),
// so the 9:16 cut stays inside the 90 s Reel limit (gate.mjs still checks the real file).
// A finished script.json (hand-written by the aidr-daily-news agent) is kept as is unless --force.
// Usage: node scripts/auto-script.mjs [--date YYYY-MM-DD] [--force] [--no-llm] [--max-seconds 80] [--dry-run]
// Env: ANYROUTER_LOCAL_API_KEY locally, ANYROUTER_API_KEY in CI (local-llm-key.mjs; no key → refuses, --no-llm → template), ANYROUTER_BASE_URL, ANYROUTER_VIDEO_MODEL (comma chain).
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { castProblems, hostOrder, loadCast } from "./cast.mjs";
import { lintText, scriptTexts } from "./gate.mjs";
import { readEnvLocal, videoScriptKey } from "./local-llm-key.mjs";
import { MONEY } from "./look.mjs";
import { download } from "./media.mjs";
import { envVar } from "./telegram-video.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const WRANGLER = resolve(ROOT, "../../apps/web/wrangler.toml");
const SCRIPT_MODEL = "openai/gpt-5.6-luna";
const MIN_STORIES = 3;
/** Screen text length in words, [min, max]; the visub cut checks its Vietnamese screen text against it too. */
export const WORD_LIMITS = { kicker: [1, 6], headline: [3, 12] };
/** Spoken pacing in words. A story opens on a short sentence a viewer takes in at once; no sentence runs past one
 *  breath; the intro is a single beat. Only model copy is held to it: the template copies bullet sentences and is
 *  the fallback when every model misses. */
export const PACING = { first: 12, sentence: 18, intro: 14, hook: [3, 7] };

/** Today in Asia/Ho_Chi_Minh, the zone the Worker dates editions in. */
export const vnToday = (now = new Date()) =>
  new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

const words = (t) =>
  String(t ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
// Same normalisation as build.mjs uses to find a spoken word.
const norm = (t) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
const spokenHas = (text, word) =>
  words(text).some((w) => norm(w).startsWith(norm(word)));
const MAGNITUDE = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  trillion: 1e12,
};
// A number with its unit: attached "B"/"%" or the spoken word after it ("billion", "percent").
const QUANTITY =
  /(\d[\d,]*(?:\.\d+)?)(?:\s?(%)|\s?(k|mn|bn|m|b|t)\b|\s+(percent|thousand|million|billion|trillion)\b)?/gi;
/** "$25B", "25 billion dollars", "4.2%" → { num, scale, percent }; one entry per number in the text. */
const quantities = (t) =>
  [...String(t ?? "").matchAll(QUANTITY)].map((m) => {
    const unit = (m[3] ?? m[4] ?? "").toLowerCase();
    const num = Number(m[1].replace(/,/g, ""));
    return {
      num,
      scale: MAGNITUDE[unit] ?? 1,
      value: num * (MAGNITUDE[unit] ?? 1),
      percent: m[2] === "%" || unit === "percent",
    };
  });
const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.abs(b);
/** A stat counts as spoken when the voice says the same amount: $25B ≈ "$25 billion" ≈ "25 billion dollars",
 *  4.2% ≈ "4.2 percent". The amount and the percent flag must match, so a different number still fails.
 *  A bare number ("25", the first spoken word of the stat) matches the digits whatever unit follows. */
export const statSpoken = (voice, statWord) => {
  const wanted = quantities(statWord);
  if (!wanted.length) return spokenHas(voice, statWord);
  const said = quantities(voice);
  return wanted.every((w) =>
    said.some((s) => {
      const bare = w.scale === 1 && !w.percent;
      return bare
        ? same(s.num, w.num) || same(s.value, w.num)
        : s.percent === w.percent && same(s.value, w.value);
    })
  );
};
const UNIT = { K: "thousand", M: "million", B: "billion", T: "trillion" };
export const speakable = (t) =>
  t
    .replace(/\$([\d.,]+)\s?([KMBT])\b/g, (_, n, u) => `$${n} ${UNIT[u]}`)
    .replace(/~/g, "about ");
/** The bullet's first number with its unit ("12%", "5 million"), else its first bare number; the stat when no dollar figure. */
const figure = (t) =>
  t.match(
    /\d[\d,]*(?:\.\d+)?(?:\s?%|\s(?:percent|thousand|million|billion|trillion)\b)/i
  )?.[0] ?? t.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
const money = (t) => t.match(MONEY)?.[0]?.replace(/\s/g, "");
const numbers = (t) =>
  (String(t ?? "").match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) =>
    n.replace(/,/g, "")
  );

const voiceWords = (v) =>
  Array.isArray(v) ? v.map((p) => p.text ?? p).join(" ") : String(v ?? "");

/** Voiced cuts run longer than the reading-speed estimate. Measured on the committed voiced editions
 *  (timeline.total ÷ estimate with gaps): 2026-10-02 1.04, 10-03 1.02, 10-10 1.09; 1.1 keeps a margin. */
export const VOICED_FACTOR = 1.1;

const GREETING =
  /^\s*(?:this is (?:ai\b|aidr|ai;dr)|welcome\b|hello\b|hi[,!.]|hi (?:there|everyone|all|folks)\b|good (?:morning|evening|afternoon)\b|here(?:'s| is) (?:ai\b|aidr|ai;dr))/i;

export function pacingProblems(script) {
  const p = [];
  for (const s of script.stories) {
    const sents = s.voice.flatMap((v) => sentencesOf(v.text));
    const first = words(sents[0]).length;
    if (first > PACING.first)
      p.push(`story ${s.rank}: first sentence has ${first} words`);
    for (const t of sents.slice(1))
      if (words(t).length > PACING.sentence)
        p.push(`story ${s.rank}: a sentence has ${words(t).length} words`);
  }
  const intro = words(script.intro.voice.at(-1)?.text).length;
  if (intro > PACING.intro) p.push(`intro line has ${intro} words`);
  const hook = words(script.thumb?.hook).length;
  const [min, max] = PACING.hook;
  if (hook < min || hook > max) p.push(`thumb.hook has ${hook} words`);
  return p;
}

/** Estimated length (s): build.mjs's per-segment lead/tail, reading speed, the breath between parts
 *  (config.voice.gap), scaled by VOICED_FACTOR. */
export function estimateSeconds(script, config) {
  const wps = config.timing.noVoice.wordsPerSecond.en;
  const parts = (v) => (Array.isArray(v) ? v.length : 1);
  const seg = (kind, v) =>
    config.timing[kind].lead +
    words(voiceWords(v)).length / wps +
    parts(v) * config.voice.gap +
    config.timing[kind].tail;
  const raw =
    seg("intro", script.intro.voice) +
    script.stories.reduce((a, s) => a + seg("story", s.voice), 0) +
    seg("outro", script.outro.voice);
  return raw * VOICED_FACTOR;
}

/** Above this share of the headline's words in the first voice sentence, the screen only repeats the voice. */
export const HEADLINE_OVERLAP = 0.7;

// Lowercase word stems: "open-sources" and "open-sourced" both give "open", "source".
const stems = (t) =>
  String(t ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.replace(/(ing|ed|es|s|e)$/, "") || w);

export function headlineOverlap(headline, sentence) {
  const head = new Set(stems(headline));
  const said = new Set(stems(sentence));
  return head.size
    ? [...head].filter((w) => said.has(w)).length / head.size
    : 0;
}

export function validateScript(script, edition) {
  const p = [];
  const raw = JSON.stringify(script);
  if (/TODO|"_bullet"/.test(raw)) p.push("TODO or _bullet left");
  const byRank = Object.fromEntries(edition.stories.map((s) => [s.rank, s]));
  for (const s of script.stories) {
    const src = byRank[s.rank];
    if (!src) {
      p.push(`story ${s.rank}: not in the edition`);
      continue;
    }
    for (const k of ["kicker", "headline", "stat", "statLabel", "statWord"])
      if (typeof s[k] !== "string" || !s[k].trim())
        p.push(`story ${s.rank}: ${k} missing`);
    if (
      !Array.isArray(s.voice) ||
      !s.voice.length ||
      s.voice.some((v) => !v.text?.trim())
    )
      p.push(`story ${s.rank}: voice missing`);
    for (const [k, [min, max]] of Object.entries(WORD_LIMITS)) {
      const n = words(String(s[k] ?? "").replace(/\*/g, "")).length;
      if (n < min || n > max) p.push(`story ${s.rank}: ${k} has ${n} words`);
    }
    const spans = String(s.headline ?? "").match(/\*[^*]+\*/g) ?? [];
    if (spans.length !== 1)
      p.push(`story ${s.rank}: headline marks ${spans.length} spans, not one`);
    const first = voiceWords(s.voice).split(/(?<=[.!?])\s/)[0];
    const overlap = headlineOverlap(s.headline, first);
    if (overlap > HEADLINE_OVERLAP)
      p.push(
        `story ${s.rank}: headline repeats the first voice sentence (${Math.round(overlap * 100)}% of its words)`
      );
    // The stat sits under the category label and the kicker; one that repeats either says nothing new.
    const bare = (t) =>
      String(t ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    if (
      bare(s.stat) &&
      [s.kicker, src.category].some((t) => bare(t) === bare(s.stat))
    )
      p.push(
        `story ${s.rank}: stat "${s.stat}" repeats the kicker or category`
      );
    // A figure in the bullet is the stat; a topic label ("Policy shift") says less than the number would.
    if (numbers(src.text).length && !numbers(s.stat).length)
      p.push(
        `story ${s.rank}: stat "${s.stat}" is not a figure, but the bullet has one`
      );
    // The headline's marker span and the stat are two spots on one card: a figure in both is said twice.
    const statFigures = quantities(s.stat);
    const doubled = [...String(s.headline).matchAll(/\*(.+?)\*/g)].some((m) =>
      quantities(m[1]).some((q) =>
        statFigures.some(
          (f) => f.percent === q.percent && same(f.value, q.value)
        )
      )
    );
    if (doubled)
      p.push(
        `story ${s.rank}: the headline marker repeats the stat "${s.stat}"`
      );
    if (s.statWord && !statSpoken(voiceWords(s.voice), s.statWord))
      p.push(`story ${s.rank}: statWord "${s.statWord}" is not spoken`);
    // Facts: no number on screen or in the voice that the bullet (or its title) does not have.
    const known = new Set([...numbers(src.text), ...numbers(src.title)]);
    for (const n of numbers(
      [s.kicker, s.headline, s.stat, s.statLabel, voiceWords(s.voice)].join(" ")
    ))
      if (!known.has(n))
        p.push(`story ${s.rank}: number ${n} is not in the bullet`);
  }
  const introLine = script.intro.voice.at(-1)?.text ?? "";
  if (GREETING.test(introLine))
    p.push(
      `intro line opens with a greeting or the show name: "${introLine.slice(0, 40)}"`
    );
  for (const f of script.intro.focus ?? [])
    if (!spokenHas(introLine, f.word))
      p.push(`intro.focus "${f.word}" is not in the intro line`);
  // The intro line and the post copy (the Reel description) may only use numbers from the stories in the
  // video, plus the date ("Oct 10, 2026").
  const inVideo = script.stories.map((s) => byRank[s.rank]).filter(Boolean);
  const allowed = new Set(
    [
      ...inVideo.flatMap((s) => [...numbers(s.text), ...numbers(s.title)]),
      ...numbers(script.date),
    ].map((n) => n.replace(/^0+(?=\d)/, ""))
  );
  const post = script.post ?? {};
  for (const [label, text] of [
    ["intro", introLine],
    ["thumb.hook", script.thumb?.hook],
    ...["hook", "facebook", "tiktok", "youtubeTitle", "shortsTitle"].map(
      (k) => [`post.${k}`, post[k]]
    ),
  ])
    for (const n of numbers(text))
      if (!allowed.has(n.replace(/^0+(?=\d)/, "")))
        p.push(`${label}: number ${n} is not in the stories`);
  if ((script.post.youtubeTitle ?? "").length > 100)
    p.push("post.youtubeTitle over 100 chars");
  if ((script.post.shortsTitle ?? "").length > 92)
    p.push("post.shortsTitle over 92 chars");
  if ((script.post.tiktok ?? "").length > 150)
    p.push("post.tiktok over 150 chars");
  for (const [label, text] of scriptTexts(script))
    p.push(...lintText(label, text));
  const parts = [
    ...script.intro.voice,
    ...script.stories.flatMap((s) => s.voice),
    ...script.outro.voice,
  ];
  p.push(...castProblems(parts));
  return p;
}

const DANGLING = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "of",
  "in",
  "to",
  "for",
  "with",
  "after",
  "by",
  "at",
  "on",
  "that",
  "its",
  "as",
  "from",
  "saying",
  "which",
  "who",
  "is",
  "are",
  "was",
  "has",
  "have",
  "while",
  "than",
  "into",
  "other",
]);
export function phrase(tw, max) {
  const out = tw.slice(0, max);
  while (
    out.length > 2 &&
    DANGLING.has(
      out
        .at(-1)
        .toLowerCase()
        .replace(/[^a-z]/g, "")
    )
  )
    out.pop();
  return out.join(" ").replace(/[,;:—-]+$/, "");
}
const listOf = (xs) =>
  xs.length < 2
    ? xs.join("")
    : `${xs.slice(0, -1).join("; ")} and ${xs.at(-1)}`;

const sentencesOf = (t) =>
  t.split(/(?<=[.!?])\s+(?=[A-Z0-9"“$])/).filter(Boolean);

export function templateStory(s) {
  const title = (s.title ?? s.text).replace(/\s*\([^)]*\)\s*$/, "");
  const tw = words(title);
  const kicker = phrase(tw, 4);
  const sents = sentencesOf(s.text);
  const voice = [sents[0]];
  if (sents[1] && words(sents[0]).length + words(sents[1]).length <= 30)
    voice.push(sents[1]);
  // A title the first sentence already says gives way to the bullet's next sentence, so the screen adds to it.
  const fromTitle = words(phrase(tw, 9));
  const head =
    headlineOverlap(fromTitle.join(" "), sents[0]) > HEADLINE_OVERLAP &&
    sents[1]
      ? words(phrase(words(sents[1]), 9))
      : fromTitle;
  const m = money(s.text) ?? figure(s.text);
  const isFigure = (w) => m && numbers(w).includes(numbers(m)[0]);
  const from = Math.max(
    0,
    head.findIndex((w) => !isFigure(w))
  );
  let end = from;
  while (end < head.length && end < from + 3 && !isFigure(head[end])) end++;
  const headline =
    end > from
      ? [
          ...head.slice(0, from),
          `*${head.slice(from, end).join(" ")}*`,
          ...head.slice(end),
        ].join(" ")
      : head.join(" ");
  const said = m && sents.find((t) => numbers(t).includes(numbers(m)[0]));
  if (said && !voice.includes(said)) voice.push(said);
  return {
    kicker,
    headline,
    stat: m ?? "Today",
    statLabel: s.source ?? "aidr.today",
    statWord: m ? numbers(m)[0] : null,
    voice: voice.map(speakable),
  };
}

const COUNT = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
];

/**
 * Assemble a full script.json from per-story copy (`copy[rank]` = templateStory shape) and post copy.
 * Anchors come from the seeded cast order; build.mjs chooses layouts (look.mjs) once the images are known.
 */
export function assemble({
  edition,
  copy,
  post,
  introLine,
  focus,
  thumbRank,
  thumbHook,
  hostKeys,
}) {
  const date = edition.date;
  const d = new Date(`${date}T12:00:00Z`);
  const DOW = d.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  const MON = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const order = hostOrder(hostKeys, date);
  let turn = 0;
  const host = () => order[turn++ % order.length];
  const intro = [host()];
  const stories = edition.stories.map((s) => {
    const c = copy[s.rank];
    const voice = c.voice.map((text) => ({ anchor: host(), text }));
    const statWord =
      c.statWord || words(voice[0].text)[0].replace(/[^\p{L}\p{N}$-]/gu, "");
    return {
      rank: s.rank,
      category: s.category ?? "AI",
      kicker: c.kicker,
      headline: c.headline,
      stat: c.stat,
      statLabel: c.statLabel,
      statWord,
      images: s.images.map((im) => im.local),
      ...(s.images.length
        ? {}
        : {
            paper: {
              venue: s.source ?? "aidr.today",
              title: s.title ?? c.kicker,
            },
          }),
      voice,
    };
  });
  const signOff = host();
  let closer = host();
  if (closer === intro[0]) closer = host();
  return {
    date,
    dateline: `${DOW}, ${MON} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
    thumb: { story: thumbRank, hook: thumbHook ?? copy[thumbRank].kicker },
    post,
    intro: {
      voice: [{ anchor: intro[0], text: introLine }],
      title: `${COUNT[stories.length] ?? stories.length} stories that matter today`,
      ...(focus?.length ? { focus } : {}),
    },
    stories,
    outro: {
      voice: [
        {
          anchor: signOff,
          text: "That's AI DR for today. Every story, ranked and summarized, at aidr dot today.",
        },
        { anchor: closer, text: "See you tomorrow." },
      ],
      title: "What's happening in AI today?",
    },
  };
}

export function templateScript(edition, hostKeys) {
  const copy = Object.fromEntries(
    edition.stories.map((s) => [s.rank, templateStory(s)])
  );
  const top = edition.stories.slice(0, 3).map((s) => copy[s.rank].kicker);
  const d = new Date(`${edition.date}T12:00:00Z`);
  const short = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const first = edition.stories[0];
  const thumb = edition.stories.find((s) => money(s.text)) ?? first;
  return assemble({
    edition,
    copy,
    hostKeys,
    thumbRank: thumb.rank,
    introLine: `First up: ${copy[first.rank].kicker}.`,
    focus: [
      {
        rank: first.rank,
        word: words(copy[first.rank].kicker)[0].replace(/[^\p{L}\p{N}-]/gu, ""),
      },
    ],
    post: {
      hook: `In AI today: ${listOf(top)}.`,
      hashtags: ["AI", "AINews", "TechNews"],
      tiktok:
        `${listOf(top.slice(0, 2))}, and more. Which story matters most? 👇`.slice(
          0,
          150
        ),
      facebook: `Today in AI: ${listOf(top)}.`,
      youtubeTitle:
        `AI News Today: ${top.slice(0, 2).join("; ")} & more | ${short}`.slice(
          0,
          100
        ),
      shortsTitle: `${top[0]} and more AI stories today`.slice(0, 92),
    },
  });
}

/** The model prompt: facts only from the bullets, digits kept as digits so the check can compare them. */
export function promptFor(edition) {
  const stories = edition.stories.map((s) => ({
    rank: s.rank,
    category: s.category,
    source: s.source,
    title: s.title,
    bullet: s.text,
    image: s.images.length > 0,
  }));
  return [
    {
      role: "system",
      content:
        'You write the AI;DR Daily Brief, a short TV-style AI news video. Facts come only from each story\'s bullet and title: never add a number, name, date or claim. Keep numbers as digits exactly as the bullet writes them ("$870 million" for "$870M" is fine). Plain words, present tense, no hype, no rank cues (never "Number one", "Next up"), no engagement bait. Answer with one JSON object only.',
    },
    {
      role: "user",
      content: `Stories:\n${JSON.stringify(stories, null, 1)}\n\nReturn JSON:\n{\n "stories": [{ "rank": <rank>, "kicker": "2-5 words, who or what", "headline": "5-9 words, the news itself, with one run of *2-4 words* in stars, never the stat's number; it adds to the first voice sentence instead of repeating it: at most ${Math.round(HEADLINE_OVERLAP * 100)}% of its words may be in that sentence", "stat": "the one number that sums the story, e.g. $60B, taken from the bullet; only a bullet with no number gets a state like Public beta; never a topic label, the kicker or the category", "statLabel": "3-8 words explaining the stat", "statWord": "the first spoken word of the stat as it appears in voice, e.g. 60", "voice": ["first sentence: the news in at most ${PACING.first} words, subject and verb first", "second sentence: why it matters or the one detail that makes it land, at most ${PACING.sentence} words"] }],\n "introLine": "at most ${PACING.intro} words, opens straight on today's top news, naming one or two stories; no greeting, no show name, no date",\n "focus": [{ "rank": <rank>, "word": "a word from introLine that names that story" }],\n "thumbRank": <rank of the most surprising story, preferring one with image true>,\n "thumbHook": "${PACING.hook.join("-")} words for the thumbnail: the surprising fact of the thumbRank story, concrete (a name, a number, an action), not a topic label like 'AI safety research', no question",\n "post": { "hook": "one sentence", "facebook": "1-2 sentences naming the top stories", "tiktok": "<=150 chars, ends with a question", "youtubeTitle": "<=100 chars: lead story, & more, the date", "shortsTitle": "<=80 chars", "hashtags": ["AI", "AINews", "...companies, 5-8 total, no #"] }\n}\nEvery story's voice is 14-24 words in total, written to be heard: one fact per sentence, at most one number per sentence, contractions are fine, no lists of three. Date: ${edition.date}.`,
    },
  ];
}

const ids = (spec) =>
  spec
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

/** The Worker's chat chain (ANYROUTER_MODEL in apps/web/wrangler.toml), read from source so the video never keeps a
 *  fallback the Worker has dropped. */
export function workerChatChain(file = WRANGLER) {
  const spec = readFileSync(file, "utf8").match(
    /^ANYROUTER_MODEL\s*=\s*"([^"]+)"/m
  )?.[1];
  if (!spec) throw new Error(`cannot read ANYROUTER_MODEL from ${file}`);
  return ids(spec);
}

/** The video scripts' model chain: `spec` (ANYROUTER_VIDEO_MODEL, a comma list) when set, else gpt-5.6-luna, which
 *  writes the script, then the Worker's chat chain. */
export function videoModels(spec) {
  if (spec != null) return ids(spec);
  return [...new Set([SCRIPT_MODEL, ...workerChatChain()])];
}

/** One streamed chat completion from anyrouter (the request shape apps/web/worker/llm.ts sends). */
export async function complete({
  model,
  messages,
  apiKey,
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = 120_000,
}) {
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://aidr.today",
      "X-Title": "AI;DR",
    },
    body: JSON.stringify({
      model,
      messages,
      // Claude ids reject temperature with a 400 (acceptsTemperature in apps/web/worker/llm.ts).
      ...(model.startsWith("anthropic/") ? {} : { temperature: 0.4 }),
      max_tokens: 8192,
      stream: true,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok)
    throw new Error(
      `anyrouter ${model}: ${res.status} ${(await res.text()).slice(0, 200)}`
    );
  const raw = await res.text();
  let content = "";
  for (const line of raw.split("\n")) {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") continue;
    try {
      content += JSON.parse(data).choices?.[0]?.delta?.content ?? "";
    } catch {}
  }
  return content;
}

export function fromModel(text, edition, hostKeys) {
  const json = JSON.parse(
    text.replace(/^[\s\S]*?(\{)/, "$1").replace(/\}[^}]*$/, "}")
  );
  const copy = {};
  for (const s of edition.stories) {
    const m = json.stories?.find((x) => x.rank === s.rank);
    if (!m) throw new Error(`no copy for story ${s.rank}`);
    const voice = (Array.isArray(m.voice) ? m.voice : [m.voice])
      .filter((v) => typeof v === "string" && v.trim())
      .slice(0, 2);
    copy[s.rank] = {
      kicker: m.kicker,
      headline: m.headline,
      stat: m.stat,
      statLabel: m.statLabel,
      statWord: m.statWord,
      voice: voice.map(speakable),
    };
  }
  const ranks = edition.stories.map((s) => s.rank);
  const post = json.post ?? {};
  const tags = (post.hashtags ?? [])
    .map((h) => String(h).replace(/^#/, ""))
    .filter(Boolean);
  return assemble({
    edition,
    copy,
    hostKeys,
    thumbRank: ranks.includes(json.thumbRank) ? json.thumbRank : ranks[0],
    thumbHook: ranks.includes(json.thumbRank) ? json.thumbHook : undefined,
    introLine: json.introLine,
    focus: (json.focus ?? []).filter((f) => ranks.includes(f.rank)).slice(0, 2),
    post: {
      hook: post.hook,
      hashtags:
        tags.length >= 3 ? tags.slice(0, 8) : ["AI", "AINews", "TechNews"],
      tiktok: post.tiktok,
      facebook: post.facebook,
      youtubeTitle: post.youtubeTitle,
      shortsTitle: post.shortsTitle?.replace(/\s*#Shorts\s*$/i, ""),
    },
  });
}

export function fitLength(edition, maxSeconds, make, config) {
  let ed = edition;
  let script = make(ed);
  while (
    estimateSeconds(script, config) > maxSeconds &&
    ed.stories.length > MIN_STORIES
  ) {
    ed = { ...ed, stories: ed.stories.slice(0, -1) };
    script = make(ed);
  }
  return { edition: ed, script };
}

/**
 * The day's script: the first model answer that is valid and paced; else the first valid one (a long sentence
 * still beats the bullet-copy template); else the template. Returns { script, source, problems }.
 * `llm(edition)` returns the raw model text for one model; injected for tests.
 */
export async function writeScript({
  edition,
  config,
  hostKeys,
  maxSeconds,
  models,
  llm,
  log = console.log,
}) {
  // Pick the stories first (template length), so the model's intro and post copy name only stories in the video.
  const fit = fitLength(
    edition,
    maxSeconds,
    (ed) => templateScript(ed, hostKeys),
    config
  );
  let unpaced = null;
  for (const model of models) {
    try {
      const script = fromModel(
        await llm(model, fit.edition),
        fit.edition,
        hostKeys
      );
      const problems = validateScript(script, fit.edition);
      const est = estimateSeconds(script, config);
      // The model may run long; a little over the budget still fits the 90 s Reel.
      if (est > maxSeconds + 5)
        problems.push(`~${est.toFixed(0)}s is over the ${maxSeconds}s budget`);
      const pacing = pacingProblems(script);
      if (!problems.length && !pacing.length)
        return { script, source: model, problems: [] };
      if (!problems.length) unpaced ??= { script, source: model, problems: [] };
      const all = [...problems, ...pacing];
      log(
        `! ${model}: ${all.length} problem(s): ${all.slice(0, 4).join("; ")}`
      );
    } catch (e) {
      log(`! ${model}: ${e.message}`);
    }
  }
  if (unpaced) return unpaced;
  return {
    script: fit.script,
    source: "template",
    problems: validateScript(fit.script, fit.edition),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const date = flag("--date") ?? vnToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`--date ${date}: YYYY-MM-DD`);
  const force = argv.includes("--force");
  const dry = argv.includes("--dry-run");
  const maxSeconds = Number(flag("--max-seconds") ?? 80);
  const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
  const dir = join(ROOT, "editions", date);
  const scriptPath = join(dir, "script.json");

  if (
    existsSync(scriptPath) &&
    !force &&
    !/TODO|"_bullet"/.test(readFileSync(scriptPath, "utf8"))
  ) {
    console.log(
      `= editions/${date}/script.json is already written; kept (--force to regenerate)`
    );
    await ensureAssets(dir);
    return;
  }
  if (!existsSync(join(dir, "edition.json"))) {
    if (date !== vnToday())
      throw new Error(
        `${date}: no edition.json and the public API only serves today (${vnToday()})`
      );
    execFileSync(process.execPath, [join(ROOT, "scripts/fetch.mjs")], {
      stdio: "inherit",
    });
    if (!existsSync(join(dir, "edition.json"))) {
      const got = readdirSync(join(ROOT, "editions"))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
        .at(-1);
      throw new Error(
        `the published edition is ${got}, not ${date}; the digest for ${date} is not out yet`
      );
    }
  } else await ensureAssets(dir);
  const edition = JSON.parse(readFileSync(join(dir, "edition.json"), "utf8"));
  if (edition.date !== date)
    throw new Error(`edition.json is dated ${edition.date}, expected ${date}`);

  const hostKeys = Object.keys(loadCast(config).hosts);
  const noLlm = argv.includes("--no-llm");
  const keyed = noLlm
    ? { fallback: "--no-llm" }
    : videoScriptKey(process.env, readEnvLocal());
  if (keyed.error) {
    console.error(`error: ${keyed.error}`);
    process.exit(1);
  }
  const apiKey = keyed.key ?? null;
  const models = apiKey ? videoModels(envVar("ANYROUTER_VIDEO_MODEL")) : [];
  if (!models.length)
    console.log(
      `! no model (${keyed.fallback ?? "empty ANYROUTER_VIDEO_MODEL"}): using the template`
    );
  const baseUrl =
    envVar("ANYROUTER_BASE_URL") ?? "https://anyrouter.dev/api/v1";
  const { script, source, problems } = await writeScript({
    edition,
    config,
    hostKeys,
    maxSeconds,
    models,
    llm: (model, ed) =>
      complete({ model, messages: promptFor(ed), apiKey, baseUrl }),
  });
  // Media that failed to download must not reach the build: fall back to the typographic card.
  const byRank = Object.fromEntries(edition.stories.map((s) => [s.rank, s]));
  for (const s of script.stories) {
    s.images = s.images.filter((f) => existsSync(join(dir, f)));
    if (!s.images.length && !s.paper)
      s.paper = {
        venue: byRank[s.rank].source ?? "aidr.today",
        title: byRank[s.rank].title ?? s.kicker,
      };
  }
  if (problems.length)
    throw new Error(
      `the template script is invalid:\n  ${problems.join("\n  ")}`
    );
  const est = estimateSeconds(script, config).toFixed(0);
  console.log(
    `✓ script from ${source}: ${script.stories.length} stories, ~${est}s estimated`
  );
  if (dry) {
    console.log(JSON.stringify(script, null, 2));
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(scriptPath, `${JSON.stringify(script, null, 2)}\n`);
  writeFileSync(
    join(dir, "script.source.json"),
    `${JSON.stringify({ source, estimatedSeconds: Number(est), at: new Date().toISOString() }, null, 2)}\n`
  );
  console.log(`✓ editions/${date}/script.json`);
}

/** A committed edition on a fresh checkout has no assets/ (ignored): download what it lists. */
async function ensureAssets(dir) {
  const edition = JSON.parse(readFileSync(join(dir, "edition.json"), "utf8"));
  mkdirSync(join(dir, "assets"), { recursive: true });
  for (const s of edition.stories)
    for (const im of s.images) {
      if (existsSync(join(dir, im.local))) continue;
      const got = await download(
        dir,
        im.url,
        im.local.replace(/^assets\//, "").replace(/\.\w+$/, "")
      );
      if (got !== im.local)
        console.warn(
          `! ${im.local}: ${got ? `saved as ${got}` : "download failed"}`
        );
    }
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) await main();
