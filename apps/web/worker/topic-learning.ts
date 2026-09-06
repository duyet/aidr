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

export async function ensureTopicLearningSchema(db: D1Database): Promise<void> {
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
  ]);
  if (CODNAMES.has(normalizeTopicName(topic))) return true;
  return false;
}

/**
 * Pulls versioned model / product names from a headline so trending can
 * show "GPT-6 Astra" / "Fable 5.1" instead of only generic score tags.
 */
export function extractTitleEntities(title: string): string[] {
  if (!title.trim()) return [];
  const patterns: RegExp[] = [
    // GPT-6 Astra, GPT-5.6 Sol, GLM-5.3-Flash, o3-pro, DeepSeek-V3.2
    /\b((?:GPT|Claude|Gemini|Grok|Llama|Qwen|Fable|Codex|Composer|Phi|Gemma|GLM|Kimi|Olmo|DeepSeek|o[1-4])[- ]?\d+(?:\.\d+)*(?:[- ](?:Flash|Pro|Max|Mini|Nano|Ultra|Sol|Astra|Opus|Sonnet|Haiku|Code|Thinking|V\d|[A-Z][a-zA-Z0-9]+))?)\b/gi,
    // Claude Opus 5 / Claude Sonnet 4.6 / Claude Code
    /\b(Claude(?:\s+(?:Opus|Sonnet|Haiku|Code))(?:\s+\d+(?:\.\d+)*)?)\b/gi,
    // Muse Spark 1.3 Max
    /\b(Muse\s+Spark(?:\s+\d+(?:\.\d+)*)?(?:\s+Max)?)\b/gi,
    // Fable 5.1 (family + version without GPT-style hyphen)
    /\b(Fable\s+\d+(?:\.\d+)*)\b/gi,
    // Opus 5 / Sonnet 4.6 when Claude is omitted
    /\b((?:Opus|Sonnet|Haiku)\s+\d+(?:\.\d+)*)\b/gi,
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    for (const match of title.matchAll(re)) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      const key = trendingKey(raw);
      if (!key || seen.has(key)) continue;
      // Drop bare "Claude" / "GPT" if somehow captured without a version —
      // patterns above require a digit or a product qualifier.
      if (!/\d/.test(key) && !/-/.test(key) && !/\s/.test(raw)) continue;
      seen.add(key);
      out.push(raw);
    }
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

/** Active learned keywords for title highlight / trending fallback. */
export async function loadLearnedKeywords(
  db: D1Database,
  limit = 80
): Promise<string[]> {
  try {
    await ensureTopicLearningSchema(db);
    const { results } = await db
      .prepare(
        `SELECT keyword FROM learned_keywords
         WHERE status = 'active'
         ORDER BY hit_count DESC, last_seen DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<{ keyword: string }>();
    return (results ?? []).map((r) => r.keyword);
  } catch {
    return [];
  }
}

/** Per-topic counts for a calendar day (Asia/Ho_Chi_Minh). */
export async function loadTopicDailyCounts(
  db: D1Database,
  day: string
): Promise<Map<string, number>> {
  try {
    await ensureTopicLearningSchema(db);
    const { results } = await db
      .prepare("SELECT topic, count FROM topic_daily WHERE day = ?")
      .bind(day)
      .all<{ topic: string; count: number }>();
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
    const specific = isSpecificTrendingTopic(tag);
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
  let picked =
    hotSpecific.length > 0
      ? hotSpecific
      : specificPool.slice(0, Math.min(floor, specificPool.length));

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

/**
 * Merge item tags + title-extracted model names into trending counts,
 * keeping the nicest display label per key.
 */
export function collectTrendingCandidates(
  items: { title: string; tags: string[]; published_at: number }[],
  sinceEpochSec: number
): { counts: Map<string, number>; displayByKey: Map<string, string> } {
  const counts = new Map<string, number>();
  const displayByKey = new Map<string, string>();

  const bump = (display: string) => {
    const key = trendingKey(display);
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
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
    for (const tag of it.tags) {
      if (LEARNING_THEME_DENYLIST.has(normalizeTopicName(tag))) continue;
      bump(displayKeywordFromTopic(tag));
    }
    for (const ent of extractTitleEntities(it.title)) bump(ent);
  }

  return { counts, displayByKey };
}
