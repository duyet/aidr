import { highlightTitle, tagsForHighlight } from "./highlight";

/**
 * Keyword highlights for the story page (DESIGN.md "Keyword highlights"):
 * numbers, money and percentages become `num`, companies, products and
 * people become `entity`. Pure, so the title and the AI;DR summary render
 * the same spans on the server and the client.
 *
 * Number policy: a number is highlighted only when it carries a unit or a
 * marker, so bare years, dates, counts and version digits ("GPT-5", "2026",
 * "8 sources") stay plain. Units: a currency sign ($, US$, €, £, ¥), a
 * percent, a scale word (nghìn, triệu, tỷ, nghìn tỷ, thousand, million,
 * billion, trillion, bn), an attached scale letter ($11B, 128K), a currency
 * word (USD, VND, đô la), a multiplier (10x), or a leading "~" / "≈".
 */

export type KeywordKind = "num" | "entity";

export interface KeywordSegment {
  text: string;
  kind: KeywordKind | null;
}

/** DESIGN.md: "Use at most a few per title or paragraph". */
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

/**
 * Named groups say which markers matched, so a bare number can be dropped.
 * The lookbehind keeps digits glued to a word or a path out ("GPT-5",
 * "Qwen3-235B", "/p31", "v1.2"); `\b` is ASCII-only and would break on
 * Vietnamese letters, so boundaries are explicit Unicode classes.
 */
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

interface Range {
  start: number;
  end: number;
  kind: KeywordKind;
}

function urlRanges(text: string): Array<{ start: number; end: number }> {
  return [...text.matchAll(URL_RE)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
}

function overlaps(
  a: { start: number; end: number },
  list: ReadonlyArray<{ start: number; end: number }>
): boolean {
  return list.some((b) => a.start < b.end && a.end > b.start);
}

/** Money, percentages and scaled or approximate numbers, in text order. */
export function numberRanges(
  text: string
): Array<{ start: number; end: number }> {
  const urls = urlRanges(text);
  const out: Array<{ start: number; end: number }> = [];
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

/** Whole-word, case-insensitive: does `needle` appear in `text` written
 * with a capital letter? Topic tags are stored lowercase ("openai",
 * "funding"); only the ones the text spells like a name are entities. */
function appearsAsName(text: string, needle: string): boolean {
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

/** Entity ranges from the shared title highlighter, with URLs masked. */
export function entityRanges(
  text: string,
  tags: string[]
): Array<{ start: number; end: number }> {
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
  const out: Array<{ start: number; end: number }> = [];
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
 * overlap, URLs are never highlighted, and the segments join back to
 * `text` exactly.
 */
export function highlightKeywords(
  text: string,
  tags: string[] = []
): KeywordSegment[] {
  if (!text) return [{ text, kind: null }];
  const ranges: Range[] = numberRanges(text).map((r) => ({
    ...r,
    kind: "num",
  }));
  for (const r of entityRanges(text, tags)) {
    if (!overlaps(r, ranges)) ranges.push({ ...r, kind: "entity" });
  }
  if (ranges.length === 0) return [{ text, kind: null }];
  ranges.sort((a, b) => a.start - b.start);
  const out: KeywordSegment[] = [];
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
