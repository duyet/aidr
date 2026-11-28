/**
 * Port of apps/web/src/lib/highlight.ts and keyword-highlight.ts — same
 * needles, word-boundary rule, and 3-highlight cap as the news homepage, plus
 * the number/entity split the digest and the story rows paint.
 */

const MAX_HIGHLIGHTS = 3;

const isLetter = (ch) => /\p{L}/u.test(ch);

export const TITLE_KEYWORDS = [
  "Hugging Face",
  "OpenRouter",
  "Anthropic",
  "DeepMind",
  "DeepSeek",
  "Microsoft",
  "OpenAI",
  "Nvidia",
  "Alibaba",
  "Mistral",
  "Stability",
  "Perplexity",
  "Together",
  "Fireworks",
  "SpaceX",
  "Stripe",
  "Amazon",
  "Apple",
  "Claude",
  "Gemini",
  "Google",
  "Codex",
  "Copilot",
  "Cursor",
  "Windsurf",
  "Composer",
  "Ollama",
  "vLLM",
  "Llama",
  "Qwen",
  "Grok",
  "Kimi",
  "Gemma",
  "Phi",
  "GLM",
  "Fable",
  "Astra",
  "Meta",
  "xAI",
  "GPT",
  "MCP",
  "RAG",
];

/** Runtime-learned keywords from topic frequency (the feed's learnedKeywords). */
let learnedKeywordsCache = [];

export function setLearnedKeywords(keywords) {
  learnedKeywordsCache = (Array.isArray(keywords) ? keywords : []).filter(
    (k) => typeof k === "string" && k.trim().length > 0
  );
}

export function tagsForHighlight(itemTags) {
  const seen = new Set();
  const out = [];
  const tags = Array.isArray(itemTags) ? itemTags : [];
  for (const tag of [...tags, ...TITLE_KEYWORDS, ...learnedKeywordsCache]) {
    const key = String(tag ?? "")
      .trim()
      .toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function highlightTitle(title, tags) {
  if (!title || !tags || tags.length === 0) {
    return [{ text: title, highlighted: false }];
  }

  const needleTag = new Map();
  for (const tag of tags) {
    const trimmed = String(tag ?? "").trim();
    if (!trimmed) continue;
    if (!needleTag.has(trimmed)) needleTag.set(trimmed, trimmed);
    const spaced = trimmed.replace(/[-_]+/g, " ");
    if (spaced !== trimmed && !needleTag.has(spaced)) {
      needleTag.set(spaced, trimmed);
    }
  }
  const sorted = [...needleTag.keys()].sort((a, b) => b.length - a.length);

  const lowerTitle = title.toLowerCase();
  const ranges = [];
  const matchedTags = new Set();

  for (const needle of sorted) {
    if (matchedTags.size >= MAX_HIGHLIGHTS) break;
    const lowerNeedle = needle.toLowerCase();
    if (!lowerNeedle) continue;
    let searchFrom = 0;
    while (matchedTags.size < MAX_HIGHLIGHTS) {
      const idx = lowerTitle.indexOf(lowerNeedle, searchFrom);
      if (idx === -1) break;
      const end = idx + lowerNeedle.length;
      const borderedByLetter =
        (idx > 0 && isLetter(lowerTitle[idx - 1])) ||
        (end < lowerTitle.length && isLetter(lowerTitle[end]));
      const overlaps = ranges.some((r) => idx < r.end && end > r.start);
      if (!borderedByLetter && !overlaps) {
        const originalTag = needleTag.get(needle) ?? needle;
        ranges.push({ start: idx, end, tag: originalTag });
        matchedTags.add(lowerNeedle);
        break;
      }
      searchFrom = idx + 1;
    }
  }

  if (ranges.length === 0) return [{ text: title, highlighted: false }];

  ranges.sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) {
      segments.push({ text: title.slice(cursor, r.start), highlighted: false });
    }
    segments.push({
      text: title.slice(r.start, r.end),
      highlighted: true,
      tag: r.tag,
    });
    cursor = r.end;
  }
  if (cursor < title.length) {
    segments.push({ text: title.slice(cursor), highlighted: false });
  }
  return segments;
}

/** Digest and story text: numbers with a unit become `num`, names `entity`. */
const MAX_NUMBERS = 4;

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu;

const NUM = String.raw`\d+(?:[.,]\d+)*`;
const APPROX = String.raw`[~≈]\s?`;
const CUR_PREFIX = String.raw`(?:US\$|\$|€|£|¥)\s?`;
const SCALE_LETTER = String.raw`[kmbt](?![\p{L}\p{N}])`;
const SCALE_WORD = String.raw`(?:nghìn tỷ|ngàn tỷ|nghìn tỉ|ngàn tỉ|nghìn|ngàn|triệu|tỷ|tỉ|thousand|million|billion|trillion|bn|mn)(?![\p{L}\p{N}])`;
const CUR_WORD = String.raw`(?:USD|VND|EUR|đô la(?: Mỹ)?|đô|đồng)(?![\p{L}\p{N}])`;
const PERCENT = String.raw`(?:\s?%|\s(?:phần trăm|percent)(?![\p{L}\p{N}]))`;
const MULTIPLIER = String.raw`[x×](?![\p{L}\p{N}])`;

const NUMBER_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}_\-./:@#])` +
    `(?<approx>${APPROX})?` +
    `(?<cur>${CUR_PREFIX})?` +
    `${NUM}` +
    `(?:(?<letter>${SCALE_LETTER})|(?<mult>${MULTIPLIER}))?` +
    `(?:\\s(?<scale>${SCALE_WORD}))?` +
    `(?:\\s(?<curword>${CUR_WORD}))?` +
    `(?<pct>${PERCENT})?` +
    String.raw`(?![\p{L}\p{N}])`,
  "giu"
);

function urlRanges(text) {
  return [...text.matchAll(URL_RE)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
}

function overlaps(a, list) {
  return list.some((b) => a.start < b.end && a.end > b.start);
}

/** Money, percentages and scaled or approximate numbers, in text order. */
export function numberRanges(text) {
  const urls = urlRanges(text);
  const out = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    if (out.length >= MAX_NUMBERS) break;
    const g = m.groups ?? {};
    const marked =
      g.approx || g.cur || g.letter || g.mult || g.scale || g.curword || g.pct;
    if (!marked) continue;
    const range = { start: m.index, end: m.index + m[0].length };
    if (overlaps(range, urls)) continue;
    out.push(range);
  }
  return out;
}

/** Whole-word, case-insensitive: does `needle` appear in `text` spelled with
 * a capital letter? Topic tags are stored lowercase; only the ones the text
 * spells like a name are entities. */
function appearsAsName(text, needle) {
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  let from = 0;
  while (n) {
    const at = lower.indexOf(n, from);
    if (at < 0) return false;
    const end = at + n.length;
    const before = at > 0 ? text[at - 1] : "";
    const after = end < text.length ? text[end] : "";
    const glued = /\p{L}/u.test(before) || /\p{L}/u.test(after);
    if (!glued && /\p{Lu}/u.test(text.slice(at, end))) return true;
    from = at + 1;
  }
  return false;
}

export function entityRanges(text, tags) {
  const urls = urlRanges(text);
  let masked = text;
  for (const u of urls) {
    masked =
      masked.slice(0, u.start) +
      " ".repeat(u.end - u.start) +
      masked.slice(u.end);
  }
  const candidates = tagsForHighlight(tags).filter((tag) =>
    appearsAsName(masked, tag.trim())
  );
  const out = [];
  let cursor = 0;
  for (const seg of highlightTitle(masked, candidates)) {
    const start = cursor;
    cursor += seg.text.length;
    if (seg.highlighted && /\p{Lu}/u.test(seg.text)) {
      out.push({ start, end: cursor });
    }
  }
  return out;
}

/**
 * Splits `text` into plain, number and entity segments. Numbers win an
 * overlap, URLs are never highlighted, and the segments join back to `text`.
 */
export function highlightKeywords(text, tags = []) {
  if (!text) return [{ text, kind: null }];
  const ranges = numberRanges(text).map((r) => ({ ...r, kind: "num" }));
  for (const r of entityRanges(text, tags)) {
    if (!overlaps(r, ranges)) ranges.push({ ...r, kind: "entity" });
  }
  if (ranges.length === 0) return [{ text, kind: null }];
  ranges.sort((a, b) => a.start - b.start);
  const out = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) {
      out.push({ text: text.slice(cursor, r.start), kind: null });
    }
    out.push({ text: text.slice(r.start, r.end), kind: r.kind });
    cursor = r.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), kind: null });
  return out;
}
