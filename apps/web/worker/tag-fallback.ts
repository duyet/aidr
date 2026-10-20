/**
 * Tags for a story the scorer left with none (#770). Jev picks one entity
 * and one theme from fixed lists and drops `none`, so a story about a
 * company outside its nine entities (Samsung, Apple, Airbnb) or Vietnamese
 * public-sector news used to publish with `tags = []` and drop out of
 * `?tag=` pages and trending chips.
 *
 * Deterministic, no model call. Every tag returned is an existing
 * `topics` canonical (a row whose `name` is its own `canonical`), so
 * `normalizeTopics` resolves it without the mapping call it makes for
 * unseen names. A wrong tag is worse than none, so a rule stayed only where
 * hand-labelled production rows showed it right (ALGORITHM.md, "Fallback
 * tags").
 */
import { dedupeNormalized, normalizeTopicName } from "./topics.js";
import type { Env } from "./types.js";

/** `topics.name` → `topics.canonical`. */
export type KnownTopics = ReadonlyMap<string, string>;

export interface TaggableStory {
  title: string;
  sourceId: string;
}

/** Jev's range: one entity, one theme, one builder tag. */
export const FALLBACK_MAX_TAGS = 3;

/** Canonicals a headline may name. Labs, companies, products, a few people
 * and countries. Generic words that are also topics ("model", "cloud",
 * "memory", "sales") are left out: a headline uses them as plain words. */
const FALLBACK_ENTITIES: ReadonlySet<string> = new Set(
  `openai anthropic google meta xai microsoft amazon nvidia deepseek
  huggingface alibaba perplexity mistral apple tesla softbank amd oracle
  stripe openrouter waymo xiaomi spacex deepmind google-deepmind huawei
  palantir coreweave intel salesforce tsmc broadcom github samsung tencent
  bytedance nebius shopify cloudflare sk-hynix mediatek ibm qualcomm micron
  paypal minimax zhipu stepfun sakana-ai cerebras asml mozilla airbnb
  accenture uber tiktok lumentum heygen
  claude gpt grok gemini qwen codex glm copilot llama gemma kimi cursor vllm
  ollama langchain bedrock sagemaker tpu ios android
  sam-altman elon-musk jensen-huang zuckerberg trump
  china taiwan japan south-korea russia vietnam iran europe uk ukraine`
    .trim()
    .split(/\s+/)
);

/** Headline names for an entity under another name. `topics` has alias rows
 * too, but the mapping model wrote them and some are wrong for a headline
 * (`autonomous-vehicles` → waymo, `huggingnews` → huggingface), so only
 * these are trusted. */
const ENTITY_ALIASES: Readonly<Record<string, string>> = {
  alphabet: "google",
  aws: "amazon",
  chatgpt: "gpt",
  "hugging-face": "huggingface",
  iphone: "apple",
  starship: "spacex",
};

/** Theme canonicals and the words that name them, English and Vietnamese.
 * `security`, `energy`, `research` and `stock-market` keyword rules were
 * measured and dropped: under half of their tags were right. */
const THEME_KEYWORDS: readonly (readonly [topic: string, words: RegExp])[] = [
  ["agent", /\bAI agents?\b|\bagentic\b/i],
  ["llm", /\bLLMs?\b|\blarge language models?\b/i],
  ["open-source", /\bopen[- ]source\b|mã nguồn mở/i],
  ["chips", /\b(chips?|chipmak\w*|semiconductors?|HBM|GPUs?)\b|bán dẫn/i],
  ["data-center", /\bdata[- ]cent(er|re)s?\b|trung tâm dữ liệu/i],
  ["robotics", /\b(robots?|robotics?|humanoids?)\b/i],
  [
    "funding",
    /\b[Rr]ais(es?|ed) \$|\b[Ff]unding [Rr]ound\b|\bSeries [A-F]\b|gọi vốn/,
  ],
  ["regulation", /\bregulat(ions?|ors?|ory)\b|\blawmakers\b|\bAI Act\b/i],
  [
    "layoffs",
    /\blay(s|ing)? off\b|\bjob cuts\b|\bcuts? [\d,.]+%? (of )?(its )?(\w+ )?(staff|jobs|workers|employees)\b|sa thải/i,
  ],
  ["healthcare", /\bhealth ?care\b|\bhospitals?\b|\bpatients?\b|(^|\s)y tế/i],
  ["education", /\beducation\b|giáo dục/i],
  ["smartphone", /\bsmartphones?\b|điện thoại/i],
  ["innovation", /đổi mới sáng tạo/i],
  ["vietnam", /\bViệt Nam\b|\bVietnam(ese)?\b/],
  ["economy", /\binflation\b|\bGDP\b|\btrade deficit\b|\beconom(y|ic)\b/i],
];

/** Sources whose every story is a paper. */
const SOURCE_THEMES: Readonly<Record<string, string>> = {
  "arxiv-research": "research",
  "hf-papers": "research",
};

/** Every theme the fallback can name. Fallback tags reach `topic_daily`, so
 * each must stay out of learned keywords and trending chips
 * (`LEARNING_THEME_DENYLIST`), except `vietnam`, which is a country. */
export const FALLBACK_THEMES: readonly string[] = [
  ...THEME_KEYWORDS.map(([topic]) => topic),
  ...Object.values(SOURCE_THEMES),
];

const LONGEST_NAME_WORDS = 3;

/** A headline word that can be part of a name: ASCII, with a capital
 * ("iPhone", "AMD", "Samsung"). Vietnamese words never qualify, so their
 * stripped form ("Việt" → "vit") cannot match a topic. */
const NAME_WORD = /^(?=.*[A-Z])[A-Za-z0-9][A-Za-z0-9.+&-]*$/;

function headlineWords(title: string): string[] {
  return title
    .split(/[\s,:;!?()[\]"“”|/—–]+/)
    .map((word) => word.replace(/['’]s$/, "").replace(/^['‘]|['’.]$/g, ""))
    .filter(Boolean);
}

/** Entity canonicals the headline names, in headline order. At each word the
 * longest known name wins, so "Google DeepMind" is one tag, not three. */
function headlineEntities(title: string, known: KnownTopics): string[] {
  const words = headlineWords(title);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = 0;
    for (let n = Math.min(LONGEST_NAME_WORDS, words.length - i); n > 0; n--) {
      const gram = words.slice(i, i + n);
      if (!gram.every((word) => NAME_WORD.test(word))) continue;
      const name = normalizeTopicName(gram.join(" "));
      const canonical =
        ENTITY_ALIASES[name] ?? (known.get(name) === name ? name : undefined);
      if (!canonical || !FALLBACK_ENTITIES.has(canonical)) continue;
      out.push(canonical);
      matched = n;
      break;
    }
    i += matched || 1;
  }
  return out;
}

/** Up to `FALLBACK_MAX_TAGS` canonicals for a story with no scorer tags:
 * entities the headline names, then themes, then the source's theme. Only
 * names `known` holds as their own canonical are returned. */
export function fallbackTags(
  story: TaggableStory,
  known: KnownTopics
): string[] {
  const candidates = [
    ...headlineEntities(story.title, known),
    ...THEME_KEYWORDS.filter(([, words]) => words.test(story.title)).map(
      ([topic]) => topic
    ),
    ...(SOURCE_THEMES[story.sourceId] ? [SOURCE_THEMES[story.sourceId]] : []),
  ];
  const tags: string[] = [];
  for (const topic of candidates) {
    if (tags.length === FALLBACK_MAX_TAGS) break;
    if (known.get(topic) === topic && !tags.includes(topic)) tags.push(topic);
  }
  return tags;
}

/** The scorer's tags, deduped, or the deterministic fallback when it gave
 * none, so no story is stored untagged where `fallbackTags` names something. */
export function scoredOrFallbackTags(
  story: TaggableStory & { tags: readonly string[] },
  known: KnownTopics
): string[] {
  const scored = dedupeNormalized(story.tags);
  return scored.length > 0 ? scored : fallbackTags(story, known);
}

export const KNOWN_TOPICS_SQL = "SELECT name, canonical FROM topics";

export function knownTopicsFromRows(
  rows: readonly Record<string, unknown>[]
): KnownTopics {
  return new Map(rows.map((row) => [String(row.name), String(row.canonical)]));
}

export async function loadKnownTopics(db: Env["DB"]): Promise<KnownTopics> {
  const { results } = await db.prepare(KNOWN_TOPICS_SQL).all();
  return knownTopicsFromRows(results ?? []);
}
