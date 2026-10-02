import type { DbReader } from "../src/lib/db";
import { normalizeTopicName } from "./topics.js";

/** Mirrors migrations/0017_topic_learning.sql so learning works before
 * `wrangler d1 migrations apply`. Also widens the HN Algolia query and
 * seeds the Lobsters source. */
const TOPIC_LEARNING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS topic_daily (
  day TEXT NOT NULL,
  topic TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, topic)
);
CREATE INDEX IF NOT EXISTS idx_topic_daily_day ON topic_daily (day);
CREATE INDEX IF NOT EXISTS idx_topic_daily_topic ON topic_daily (topic);
CREATE TABLE IF NOT EXISTS learned_keywords (
  keyword TEXT PRIMARY KEY,
  source_topic TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_learned_keywords_status
  ON learned_keywords (status, hit_count DESC);
UPDATE sources
SET config = '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek OR Qwen OR Mistral OR Llama OR Grok OR Cursor OR Copilot OR Nvidia OR HuggingFace OR ollama OR vLLM OR MCP OR agentic OR OpenRouter"}'
WHERE id = 'hn';
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('lobsters', 'Lobsters', 'lobsters', '{"tags":["ai","ml","vibecoding"]}', 1);
`;

let schemaReady = false;

export async function ensureTopicLearningSchema(db: DbReader): Promise<void> {
  if (schemaReady) return;
  const statements = TOPIC_LEARNING_SCHEMA_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((sql) => db.prepare(sql));
  await db.batch(statements);
  schemaReady = true;
}

/** Test helper — Worker isolate is long-lived; tests share the module. */
export function resetTopicLearningSchemaCache(): void {
  schemaReady = false;
}

/** Calendar day key in Asia/Ho_Chi_Minh (same as TL;DR / digest). */
export function learningDayKey(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

/** Themes we never promote into title-highlight keywords. */
export const LEARNING_THEME_DENYLIST = new Set([
  "llm",
  "agent",
  "multi-agent",
  "harness",
  "inference",
  "open-source",
  "fine-tuning",
  "benchmark",
  "reasoning",
  "safety",
  "regulation",
  "funding",
  "chips",
  "gpu",
  "infra",
  "robotics",
  "coding",
  "rag",
  "mcp",
  "research",
  "products",
  "models",
  "industry",
  "legal",
  "releases",
  "agents",
  "ai",
  "ml",
  "news",
  "tech",
  "software",
  "startup",
  "paper",
  "arxiv",
  "defense",
  "security",
  "enterprise",
  "geopolitics",
  "hardware",
  "api",
  "ipo",
  "marketplace",
  "agi",
  "transformer",
  "update",
  // Business / newsroom themes the tagger emits as hyphenated tags.
  "industry-news",
  "stock-sales",
  "executive-departures",
  "partnerships",
  "partnership",
  "acquisition",
  "acquisitions",
  "earnings",
  "lawsuit",
  "lawsuits",
  "layoffs",
  "valuation",
  "investment",
  "data-center",
  "data-centers",
  "ai-agents",
  "outage",
  "policy",
  "llms",
  "agentic",
  // Builder categories and the themes the tagger pairs with them.
  "tools",
  "frameworks",
  "framework",
  "data",
  "devtools",
  "data-engineering",
  "vector-database",
  "embedding",
  "mlops",
  "eval",
]);

/**
 * Entity-like topic names worth learning as highlight keywords: short
 * kebab tokens that are not generic themes. Multi-segment names like
 * "claude-code" or "gpt-5" qualify; pure themes do not.
 */
export function isLearnableEntityTopic(topic: string): boolean {
  const name = normalizeTopicName(topic);
  if (!name || name.length < 2 || name.length > 40) return false;
  if (LEARNING_THEME_DENYLIST.has(name)) return false;
  // Pure numeric / single-letter noise.
  if (/^\d+$/.test(name) || /^[a-z]$/.test(name)) return false;
  return true;
}

/** Soft key for trending chips — keeps version dots ("fable-5.1"). */
export function trendingKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** True when the tag looks like a specific model/product, not a theme/lab filler. */
export function isSpecificTrendingTopic(topic: string): boolean {
  const key = trendingKey(topic);
  if (!key || LEARNING_THEME_DENYLIST.has(normalizeTopicName(topic)))
    return false;
  // Versioned: GPT-6, Fable 5.1, GLM-5.3-Flash, Muse Spark 1.3
  if (/\d/.test(key)) return true;
  // Multi-token products: claude-code, gpt-6-astra, muse-spark
  if (key.includes("-") && isLearnableEntityTopic(topic)) return true;
  // Known short product/codename chips (not mega-labs like openai).
  const CODNAMES = new Set([
    "astra",
    "fable",
    "composer",
    "codex",
    "windsurf",
    "cursor",
    "openrouter",
    "ollama",
    "vllm",
    "claude-code",
    // Builder frameworks named by one word.
    "langgraph",
    "langsmith",
    "crewai",
    "autogen",
    "mastra",
    "llamaindex",
    "dspy",
    "sglang",
  ]);
  if (CODNAMES.has(normalizeTopicName(topic))) return true;
  return false;
}

/** Tier words that may follow a version number ("Grok 4.1 Fast"). */
const VERSION_VARIANTS = new Set([
  "flash",
  "pro",
  "max",
  "mini",
  "nano",
  "ultra",
  "lite",
  "turbo",
  "plus",
  "fast",
  "preview",
  "thinking",
  "instant",
  "air",
  "omni",
  "coder",
  "code",
  // Curated codenames seen after a version (GPT-6 Astra, GPT-5.6 Luna,
  // Gemini 4 Argon).
  "sol",
  "astra",
  "luna",
  "argon",
]);

/**
 * Pulls versioned model / product names from a headline so trending can
 * show "GPT-6 Astra" / "Fable 5.1" instead of only generic score tags.
 */
export function extractTitleEntities(title: string): string[] {
  if (!title.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const key = trendingKey(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };

  // GPT-6 Astra, GPT-5.6 Sol, GLM-5.3-Flash, o3-pro, DeepSeek-V3.2. Only
  // closed-list tier words extend the name, so "GLM-5.3 nearly" and
  // "Grok 4.7 Tops" stay "GLM-5.3" / "Grok 4.7".
  const family =
    /\b((?:GPT|Claude|Gemini|Grok|Llama|Qwen|Fable|Codex|Composer|Phi|Gemma|GLM|Kimi|Olmo|DeepSeek|o[1-4])[- ]?\d+(?:\.\d+)*)(?:([- ])([A-Za-z][a-zA-Z0-9]*))?\b/gi;
  for (const match of title.matchAll(family)) {
    const base = match[1]!;
    const suffix = match[3];
    add(
      suffix && VERSION_VARIANTS.has(suffix.toLowerCase())
        ? `${base}${match[2]}${suffix}`
        : base
    );
  }

  const patterns: RegExp[] = [
    // Claude Opus 5 / Claude Sonnet 4.6 / Claude Code
    /\b(Claude(?:\s+(?:Opus|Sonnet|Haiku|Code))(?:\s+\d+(?:\.\d+)*)?)\b/gi,
    // Muse Spark 1.3 Max
    /\b(Muse\s+Spark(?:\s+\d+(?:\.\d+)*)?(?:\s+Max)?)\b/gi,
    // Fable 5.1 (family + version without GPT-style hyphen)
    /\b(Fable\s+\d+(?:\.\d+)*)\b/gi,
    // Opus 5 / Sonnet 4.6 when Claude is omitted
    /\b((?:Opus|Sonnet|Haiku)\s+\d+(?:\.\d+)*)\b/gi,
    // Builder frameworks and platforms that carry no version or inner capital
    /\b(Workers\s+AI|Llama\s+Stack|Pydantic\s+AI|Semantic\s+Kernel|Mastra|DSPy|SGLang)\b/gi,
    // OpenAI Agents SDK / Cloudflare Agents SDK / Vercel AI SDK
    /\b((?:(?:OpenAI|Cloudflare|Claude|Google|Vercel|Microsoft)\s+)?(?:Agents?|AI)\s+SDK)\b/gi,
    // Workers AI model ids: "@cf/meta/llama-4-scout" → "llama-4-scout"
    /@(?:cf|hf)\/[\w.-]+\/([\w.-]+)/gi,
  ];

  for (const re of patterns) {
    for (const match of title.matchAll(re)) {
      const raw = match[1]?.trim();
      if (raw) add(raw);
    }
  }
  for (const name of extractVersionedNames(title)) add(name);
  for (const name of extractMixedCaseNames(title)) add(name);
  for (const name of extractLaunchObjects(title)) add(name);
  const lead = extractLeadingName(title);
  if (lead) add(lead);
  // "Gemini 4" inside "Gemini 4 Argon", "Opus 5" inside "Claude Opus 5".
  const keys = out.map(trendingKey);
  return out.filter((_, i) =>
    keys.every(
      (other, j) =>
        j === i ||
        (!other.startsWith(`${keys[i]}-`) && !other.endsWith(`-${keys[i]}`))
    )
  );
}

/** Capitalised headline words that never start or continue a product name:
 * function words, headline verbs, months, and counters ("Top 10"). */
const NAME_STOPWORDS = new Set(
  `a an the and or of for with on in to at by from via vs versus after before
  over into as is are was be can will now new its their your our his her how
  why what when who first next last top record phase part series level stage
  round step day week chapter episode season section article page volume
  issue number no gen launches launch launched releases release released
  unveils unveil ships ship debuts debut introduces introducing introduce
  announces announce adds add beats beat outperforms outperform deploys
  deploy plans plan cuts cut opens open sets set hits hit lifts lift past
  replaces replace says say brings bring builds build integrates integrate
  tops top trails trail falls fall joins join raises raise acquires acquire
  buys buy targets target holds hold shares share drops drop partners gets
  get wins win leads lead makes make takes take uses use fires fire hires
  hire weighs reports report expands expand rolls roll tests test pays pay
  delivers deliver spends spend jumps jump surges surge reaches reach
  passes pass hosts host vote votes more less than about nearly up multi
  try order orders challenges fixes cancels halts scraps tops
  jan feb mar apr may jun jul aug
  sep sept oct nov dec january february march april june july august
  september october november december q1 q2 q3 q4 h1 h2`.split(/\s+/)
);

/** Labs / companies: a boundary, not part of a product name
 * ("Google Gemini 4" → "Gemini 4", "NVIDIA Rubin NVL72" → "Rubin NVL72"). */
const LAB_NAMES = new Set([
  "openai",
  "anthropic",
  "google",
  "deepmind",
  "nvidia",
  "microsoft",
  "meta",
  "apple",
  "xai",
  "spacexai",
  "spacex",
  "tesla",
  "alibaba",
  "baidu",
  "tencent",
  "bytedance",
  "zhipu",
  "huawei",
  "samsung",
  "intel",
  "amd",
  "ibm",
  "github",
  "deepseek",
  "langchain",
  "softbank",
  "huggingface",
  "youtube",
  "linkedin",
]);

/** Units and counters that make a number a size, not a version. */
const NUMBER_UNIT =
  /^(%|x|[kmbt]|gb|tb|mb|ms|tokens?|params?|parameters?|days?|hours?|weeks?|months?|years?|minutes?|seconds?|million|billion|trillion|percent|times|people|users|sites|of)$/i;

interface TitleToken {
  word: string;
  possessive: boolean;
  /** Ends a phrase: trailing punctuation, a possessive, or a dash after. */
  boundary: boolean;
}

function tokenizeTitle(title: string): TitleToken[] {
  const tokens: TitleToken[] = [];
  for (const raw of title.split(/\s+/)) {
    if (!raw) continue;
    if (/^[-–—|/]+$/.test(raw)) {
      const prev = tokens[tokens.length - 1];
      if (prev) prev.boundary = true;
      continue;
    }
    let word = raw.replace(/^[("'‘“[]+/, "").replace(/[)"'’”\],:;.!?]+$/, "");
    const possessive = /['’]s$/i.test(word);
    if (possessive) word = word.slice(0, -2);
    if (!word) continue;
    tokens.push({
      word,
      possessive,
      boundary:
        possessive || word.length < raw.replace(/^[("'‘“[]+/, "").length,
    });
  }
  return tokens;
}

const isNameWord = (w: string) =>
  /^[A-Z]/.test(w) &&
  // "Prompting", "Following", "Including": headline gerunds, not names.
  !/^[A-Z][a-z]{3,}ing$/.test(w) &&
  !NAME_STOPWORDS.has(w.toLowerCase()) &&
  !LAB_NAMES.has(w.toLowerCase());

/** Letters only Vietnamese uses among Latin scripts. */
const VIETNAMESE_LETTERS =
  /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

/** "4", "5.6", "V3" — a bare release number, not a count ("100") or year. */
const isBareVersion = (w: string) =>
  /^[vV]?\d+(?:\.\d+)*$/.test(w) && !/^\d{3,}$/.test(w);

/** "GPT-5.6", "LFM2.5-2.6B", "AI5", "Boreal-H3", "TwIL-LM3-Pro". */
const isAttachedVersion = (w: string) =>
  /^[A-Z][A-Za-z]*(?:-[A-Za-z]+)*-?[A-Za-z]?\d[\w.-]*$/.test(w) &&
  !/^[A-Z]\d+[A-Z]?$/.test(w) &&
  !NAME_STOPWORDS.has(w.toLowerCase());

/**
 * Generic "Name + version" rule: 1–3 capitalised words before a bare
 * version ("FLUX 3", "Grok Imagine Video 1.5 Lite", "Cosmos 3"), or a
 * token that carries its own version ("GLM-5.3", "Rubin NVL72"), plus
 * closed-list tier words after it.
 */
function extractVersionedNames(title: string): string[] {
  const tokens = tokenizeTitle(title);
  // Vietnamese headlines capitalise ordinary nouns ("Hacker 17 tuổi"), so
  // only self-versioned tokens and curated families count there.
  const vietnamese = VIETNAMESE_LETTERS.test(title);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const bare = isBareVersion(tok.word);
    if (bare ? vietnamese : !isAttachedVersion(tok.word)) continue;
    if (bare) {
      const next = tokens[i + 1]?.word ?? "";
      if (!tok.boundary && NUMBER_UNIT.test(next)) continue;
    }
    // "GPT-6.1" names itself; walking left would take in headline verbs
    // ("Cancels GPT-6 Astra").
    let start = i;
    while (
      bare &&
      start > 0 &&
      i - start < 3 &&
      !tokens[start - 1]!.boundary &&
      isNameWord(tokens[start - 1]!.word)
    ) {
      start--;
    }
    if (bare && start === i) continue;
    let end = i;
    while (
      end + 1 < tokens.length &&
      end - i < 2 &&
      !tokens[end]!.boundary &&
      VERSION_VARIANTS.has(tokens[end + 1]!.word.toLowerCase()) &&
      /^[A-Z]/.test(tokens[end + 1]!.word)
    ) {
      end++;
    }
    out.push(
      tokens
        .slice(start, end + 1)
        .map((t) => t.word)
        .join(" ")
    );
  }
  return out;
}

const LAUNCH_VERB =
  /^(launches|unveils|ships|debuts|introduces|introducing|releases|announces|opens)$/i;

/** Generic heads that follow a launch verb without naming a product. */
const GENERIC_OBJECT =
  /^(ai|agents?|models?|lab|tools?|apps?|features?|platform|plans?|bill|program|fund|probe|service|beta|sweeping|major|own|its)$/i;

/** "LiteLLM Launches Lens to…", "NVIDIA Releases Kumo Tabular: …",
 * "Shopify debuts Canvas, …": a short name right after a launch verb that
 * ends the phrase (punctuation or a lowercase word follows). */
function extractLaunchObjects(title: string): string[] {
  const tokens = tokenizeTitle(title);
  const out: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i]!.boundary || !LAUNCH_VERB.test(tokens[i]!.word)) continue;
    let end = i;
    while (
      end + 1 < tokens.length &&
      end - i < 3 &&
      (end === i || !tokens[end]!.boundary) &&
      isNameWord(tokens[end + 1]!.word)
    ) {
      end++;
    }
    const words = tokens.slice(i + 1, end + 1);
    // "Artifacts Beta" → "Artifacts": the release stage is not the name.
    if (words.length > 1 && /^(beta|alpha|preview)$/i.test(words.at(-1)!.word))
      words.pop();
    if (words.length === 0 || words.length > 2) continue;
    if (GENERIC_OBJECT.test(words[0]!.word)) continue;
    const after = tokens[end + 1];
    if (
      after &&
      !tokens[end]!.boundary &&
      /^[A-Z]/.test(after.word) &&
      !NAME_STOPWORDS.has(after.word.toLowerCase())
    )
      continue;
    out.push(words.map((t) => t.word).join(" "));
  }
  return out;
}

/** Kicker words that open a headline with a colon but name nothing. */
const HEADLINE_KICKERS =
  /^(show|ask|tell|launch|update|breaking|exclusive|opinion|analysis|review|interview|report|quoting|ai|llms?|agents?|podcast|video|watch|explainer|guide|tutorial|paper|thread)$/i;

/** "GPT-Synopsys: Frontier Intelligence…", "TomasuLLM: Out-of-Order…" —
 * a one- or two-word name before the headline's first colon. */
function extractLeadingName(title: string): string | null {
  const match = /^([^\s:]+(?:\s[^\s:]+)?):\s/.exec(title.trim());
  if (!match) return null;
  const words = match[1]!.split(" ");
  if (
    words.some(
      (w) => !isNameWord(w) || HEADLINE_KICKERS.test(w) || ORG_SUFFIX.test(w)
    )
  )
    return null;
  return match[1]!;
}

const ORG_SUFFIX =
  /^(foundation|labs?|inc|corp|corporation|ltd|llc|institute|university|group|holdings|ventures|capital)$/i;

/** "LangSmith", "DoGBench", "ChatGPT": an inner capital after a lowercase
 * letter is a coined product name. MoE / MoEs and "McDonald" are not. */
const isMixedCase = (w: string) =>
  /^[A-Z][A-Za-z0-9]*[a-z][A-Z]/.test(w) &&
  !/^[A-Z][a-z][A-Z]s?$/.test(w) &&
  !/^Ma?c[A-Z]/.test(w);

/** Coined mixed-case names plus up to two capitalised words after them
 * ("SynthID Bio", "NeMo Agent Toolkit"). Labs and possessives are skipped. */
function extractMixedCaseNames(title: string): string[] {
  const tokens = tokenizeTitle(title);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.possessive || !isMixedCase(tok.word) || !isNameWord(tok.word))
      continue;
    let end = i;
    while (
      end + 1 < tokens.length &&
      end - i < 2 &&
      !tokens[end]!.boundary &&
      isNameWord(tokens[end + 1]!.word) &&
      !/\d/.test(tokens[end + 1]!.word)
    ) {
      end++;
    }
    // Title Case runs on ("MongoDB Stock Plummets 15%"): keep the extension
    // only when the phrase ends right after it.
    const after = tokens[end + 1];
    if (
      end > i &&
      !tokens[end]!.boundary &&
      after &&
      /^[A-Z0-9$]/.test(after.word) &&
      !NAME_STOPWORDS.has(after.word.toLowerCase())
    ) {
      end = i;
    }
    // "TypeSafe AI's Jev": the run is an owner, not the product.
    if (tokens.slice(i + 1, end + 1).some((t) => t.possessive)) {
      i = end;
      continue;
    }
    // "OpenID Foundation", "Acme Labs": an organisation, not a product.
    if (tokens.slice(i + 1, end + 2).some((t) => ORG_SUFFIX.test(t.word))) {
      i = end + 1;
      continue;
    }
    out.push(
      tokens
        .slice(i, end + 1)
        .map((t) => t.word)
        .join(" ")
    );
    i = end;
  }
  return out;
}

/** Display form for a kebab topic: "claude-code" → "Claude Code", "gpt" → "GPT"
 * when short and all-caps-ish; otherwise title-case each segment. */
export function displayKeywordFromTopic(topic: string): string {
  // Preserve versioned display when the input still has dots/spaces.
  if (/[.\s]/.test(topic) && /\d/.test(topic)) {
    return topic
      .trim()
      .split(/\s+/)
      .map((part) => {
        if (
          /^(gpt|llm|mcp|rag|xai|aws|api|ui|ux|ml|ai|vlm|tts|stt|ocr)$/i.test(
            part
          )
        )
          return part.toUpperCase();
        if (/^\d/.test(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }
  const name = normalizeTopicName(topic);
  const knownDisplay: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    huggingface: "Hugging Face",
    deepseek: "DeepSeek",
    openrouter: "OpenRouter",
    claude: "Claude",
    gemini: "Gemini",
    nvidia: "Nvidia",
    google: "Google",
    microsoft: "Microsoft",
    copilot: "Copilot",
    cursor: "Cursor",
    windsurf: "Windsurf",
    grok: "Grok",
    meta: "Meta",
    xai: "xAI",
    mistral: "Mistral",
    qwen: "Qwen",
    llama: "Llama",
    fable: "Fable",
    astra: "Astra",
  };
  if (knownDisplay[name]) return knownDisplay[name];
  const knownUpper = new Set([
    "gpt",
    "llm",
    "mcp",
    "rag",
    "xai",
    "aws",
    "api",
    "ui",
    "ux",
    "ml",
    "ai",
    "vlm",
    "tts",
    "stt",
    "ocr",
    "glm",
  ]);
  const parts = name.split("-").filter(Boolean);
  // gpt-6-astra → GPT-6 Astra (keep numeric segments tight to prior family)
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (knownUpper.has(part)) {
      out.push(part.toUpperCase());
      continue;
    }
    if (/^\d/.test(part)) {
      // Attach version to previous token with a hyphen when previous was a family.
      if (out.length > 0 && /^(GPT|GLM|PHI|OCR)$/i.test(out[out.length - 1]!)) {
        out[out.length - 1] = `${out[out.length - 1]}-${part}`;
      } else {
        out.push(part);
      }
      continue;
    }
    out.push(part.charAt(0).toUpperCase() + part.slice(1));
  }
  return out.join(" ");
}

export interface TopicCount {
  topic: string;
  count: number;
}

/**
 * Upserts today's per-topic occurrence counts. Counts are additive within
 * the day so multiple normalize passes in one calendar day accumulate.
 */
export async function recordTopicDaily(
  db: D1Database,
  topics: TopicCount[],
  day: string
): Promise<void> {
  if (topics.length === 0) return;
  const stmts = topics.map(({ topic, count }) =>
    db
      .prepare(
        `INSERT INTO topic_daily (day, topic, count)
         VALUES (?, ?, ?)
         ON CONFLICT(day, topic) DO UPDATE SET
           count = count + excluded.count`
      )
      .bind(day, topic, count)
  );
  await db.batch(stmts);
}

/**
 * Promotes recurring entity topics into `learned_keywords` when today's
 * frequency clears the bar, or when growth vs yesterday is clear.
 * Returns the keywords newly activated or reinforced this run.
 */
export async function promoteEmergingTopics(
  db: D1Database,
  opts: {
    day: string;
    yesterday: string;
    nowMs: number;
    /** Minimum today's count to consider promotion. */
    minToday?: number;
    /** Minimum today/yesterday ratio when yesterday > 0. */
    minGrowthRatio?: number;
  }
): Promise<string[]> {
  const minToday = opts.minToday ?? 2;
  const minGrowthRatio = opts.minGrowthRatio ?? 1.5;

  const { results: todayRows } = await db
    .prepare("SELECT topic, count FROM topic_daily WHERE day = ?")
    .bind(opts.day)
    .all<{ topic: string; count: number }>();

  const { results: yesterdayRows } = await db
    .prepare("SELECT topic, count FROM topic_daily WHERE day = ?")
    .bind(opts.yesterday)
    .all<{ topic: string; count: number }>();

  const yesterdayByTopic = new Map(
    (yesterdayRows ?? []).map((r) => [r.topic, r.count])
  );

  const promoted: string[] = [];
  const stmts: D1PreparedStatement[] = [];

  for (const row of todayRows ?? []) {
    if (!isLearnableEntityTopic(row.topic)) continue;
    const yesterday = yesterdayByTopic.get(row.topic) ?? 0;
    const growing =
      yesterday === 0
        ? row.count >= minToday
        : row.count >= minToday && row.count / yesterday >= minGrowthRatio;
    // Brand-new today with a single strong hit still learns once count≥3.
    const strongNew = yesterday === 0 && row.count >= 3;
    if (!growing && !strongNew) continue;

    const keyword = displayKeywordFromTopic(row.topic);
    stmts.push(
      db
        .prepare(
          `INSERT INTO learned_keywords
             (keyword, source_topic, first_seen, last_seen, hit_count, status)
           VALUES (?, ?, ?, ?, ?, 'active')
           ON CONFLICT(keyword) DO UPDATE SET
             source_topic = excluded.source_topic,
             last_seen = excluded.last_seen,
             hit_count = hit_count + excluded.hit_count,
             status = 'active'`
        )
        .bind(keyword, row.topic, opts.nowMs, opts.nowMs, row.count)
    );
    promoted.push(keyword);
  }

  if (stmts.length > 0) await db.batch(stmts);
  return promoted;
}

/** Prepared SELECT for active learned keywords. Exported at statement
 * level so read paths (the feed) can ride it in the same `db.batch` as
 * other queries — one D1 round-trip instead of one per SELECT. Callers
 * must run `ensureTopicLearningSchema` first (module-cached). */
export function learnedKeywordsStmt(
  db: DbReader,
  limit = 80
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT keyword FROM learned_keywords
       WHERE status = 'active'
       ORDER BY hit_count DESC, last_seen DESC
       LIMIT ?`
    )
    .bind(limit);
}

/** Prepared SELECT for one day's per-topic counts — same batching note
 * as `learnedKeywordsStmt`. */
export function topicDailyCountsStmt(
  db: DbReader,
  day: string
): D1PreparedStatement {
  return db
    .prepare("SELECT topic, count FROM topic_daily WHERE day = ?")
    .bind(day);
}

/** Active learned keywords for title highlight / trending fallback. */
export async function loadLearnedKeywords(
  db: DbReader,
  limit = 80
): Promise<string[]> {
  try {
    await ensureTopicLearningSchema(db);
    const { results } = await learnedKeywordsStmt(db, limit).all<{
      keyword: string;
    }>();
    return (results ?? []).map((r) => r.keyword);
  } catch {
    return [];
  }
}

/** Per-topic counts for a calendar day (Asia/Ho_Chi_Minh). */
export async function loadTopicDailyCounts(
  db: DbReader,
  day: string
): Promise<Map<string, number>> {
  try {
    await ensureTopicLearningSchema(db);
    const { results } = await topicDailyCountsStmt(db, day).all<{
      topic: string;
      count: number;
    }>();
    return new Map((results ?? []).map((r) => [r.topic, r.count]));
  } catch {
    return new Map();
  }
}

/**
 * Capture today's topic frequencies from a normalize pass and promote
 * emerging entity tags into learned keywords. Optional titles also
 * contribute versioned model names extracted from headlines.
 */
export async function captureAndLearnTopics(
  db: D1Database,
  canonicalTagsByItem: Map<string, string[]>,
  nowMs: number,
  titlesByItem?: Map<string, string>
): Promise<{ day: string; promoted: string[] }> {
  const day = learningDayKey(nowMs);
  const yesterdayMs = nowMs - 24 * 60 * 60 * 1000;
  const yesterday = learningDayKey(yesterdayMs);

  const counts = new Map<string, number>();
  for (const [id, tags] of canonicalTagsByItem) {
    for (const tag of tags) {
      const name = normalizeTopicName(tag);
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const title = titlesByItem?.get(id);
    if (!title) continue;
    for (const ent of extractTitleEntities(title)) {
      const name = trendingKey(ent);
      if (!name || !isLearnableEntityTopic(name)) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const topics = [...counts.entries()].map(([topic, count]) => ({
    topic,
    count,
  }));

  try {
    await ensureTopicLearningSchema(db);
    await recordTopicDaily(db, topics, day);
    const promoted = await promoteEmergingTopics(db, {
      day,
      yesterday,
      nowMs,
    });
    return { day, promoted };
  } catch (error) {
    console.error("captureAndLearnTopics failed:", error);
    return { day, promoted: [] };
  }
}

/**
 * Rank trending tags with a growth boost for topics rising vs yesterday.
 * Prefers specific models/products (GPT-6 Astra, Fable 5.1) over generic
 * themes (llm, agent) so the homepage chip row reads as emerging names.
 */
export function rankTrendingWithGrowth(
  todayCounts: Map<string, number>,
  yesterdayCounts: Map<string, number>,
  opts?: {
    hotMin?: number;
    floor?: number;
    cap?: number;
    /** When true (default), drop theme denylist tags from the primary list. */
    entitiesOnly?: boolean;
    /** Keys extracted from headlines (`collectTrendingCandidates`): a
     * coined single-word name like "chatgpt" is specific only by origin. */
    entityKeys?: ReadonlySet<string>;
  }
): { tag: string; count: number }[] {
  const hotMin = opts?.hotMin ?? 2;
  const floor = opts?.floor ?? 8;
  const cap = opts?.cap ?? 16;
  const entitiesOnly = opts?.entitiesOnly ?? true;

  const scored = [...todayCounts.entries()].map(([tag, count]) => {
    const yesterdayKey = trendingKey(tag);
    const yesterday =
      yesterdayCounts.get(tag) ??
      yesterdayCounts.get(yesterdayKey) ??
      yesterdayCounts.get(normalizeTopicName(tag)) ??
      0;
    const growth =
      yesterday === 0 ? (count >= hotMin ? 1.25 : 1) : count / yesterday;
    const growthBoost = growth >= 1.5 ? 1.35 : growth >= 1.2 ? 1.15 : 1;
    const key = trendingKey(tag);
    // With origins known, an LLM tag like "daily-active-users" is specific
    // only when a headline also names it or it carries a version.
    const specific = opts?.entityKeys
      ? opts.entityKeys.has(key) ||
        (isSpecificTrendingTopic(tag) && (/\d/.test(key) || !key.includes("-")))
      : isSpecificTrendingTopic(tag);
    const versionBoost = /\d/.test(trendingKey(tag))
      ? 1.55
      : specific
        ? 1.2
        : 1;
    const themePenalty =
      entitiesOnly && LEARNING_THEME_DENYLIST.has(normalizeTopicName(tag))
        ? 0
        : 1;
    return {
      tag,
      count,
      specific,
      score: count * growthBoost * versionBoost * themePenalty,
    };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.specific) - Number(a.specific) ||
      b.count - a.count
  );

  // Specific models/products first (GPT-6 Astra, Fable 5.1); labs only fill.
  const specificPool = scored.filter((t) => t.score > 0 && t.specific);
  const hotSpecific = specificPool
    .filter((t) => t.count >= hotMin)
    .slice(0, cap);
  // Single-mention models/products still beat bare labs as filler.
  let picked =
    hotSpecific.length >= floor
      ? hotSpecific
      : [...hotSpecific, ...specificPool.filter((t) => t.count < hotMin)].slice(
          0,
          floor
        );

  if (picked.length < floor && entitiesOnly) {
    const filler = scored.filter(
      (t) =>
        t.score > 0 &&
        !t.specific &&
        !picked.some((p) => p.tag === t.tag) &&
        isLearnableEntityTopic(t.tag)
    );
    picked = [...picked, ...filler].slice(
      0,
      Math.min(Math.max(floor, picked.length), cap)
    );
  } else if (!entitiesOnly && picked.length < floor) {
    picked = scored
      .filter((t) => t.score > 0)
      .slice(0, Math.min(floor, scored.length));
  }

  return picked.slice(0, cap).map(({ tag, count }) => ({ tag, count }));
}

/** How much a story contributes to a trending chip. Merged multi-source
 * items count as corroboration, not as a single mention. */
export function trendingSourceWeight(sourceCount?: number): number {
  const n = sourceCount ?? 1;
  return Math.max(1, Math.min(Math.floor(n), 8));
}

export function collectTrendingCandidates(
  items: {
    title: string;
    tags: string[];
    published_at: number;
    sourceCount?: number;
  }[],
  sinceEpochSec: number
): {
  counts: Map<string, number>;
  displayByKey: Map<string, string>;
  entityKeys: Set<string>;
} {
  const counts = new Map<string, number>();
  const displayByKey = new Map<string, string>();
  const entityKeys = new Set<string>();

  const bump = (display: string, weight: number) => {
    const key = trendingKey(display);
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + weight);
    const prev = displayByKey.get(key);
    if (
      !prev ||
      (isSpecificTrendingTopic(display) && !isSpecificTrendingTopic(prev)) ||
      (/\d/.test(display) && !/\d/.test(prev)) ||
      display.length > prev.length
    ) {
      displayByKey.set(key, display);
    }
  };

  for (const it of items) {
    if (it.published_at < sinceEpochSec) continue;
    const weight = trendingSourceWeight(it.sourceCount);
    for (const tag of it.tags) {
      if (LEARNING_THEME_DENYLIST.has(normalizeTopicName(tag))) continue;
      bump(displayKeywordFromTopic(tag), weight);
    }
    for (const ent of extractTitleEntities(it.title)) {
      bump(ent, weight);
      entityKeys.add(trendingKey(ent));
    }
  }

  return { counts, displayByKey, entityKeys };
}
