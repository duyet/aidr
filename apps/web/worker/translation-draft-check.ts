/**
 * Deterministic EN→VI draft check, run right after generation (translate
 * and TL;DR) so a known-bad draft gets one repair attempt before it is
 * stored. The semantic review in `translation-qa.ts` runs later and may
 * not run at all when the reviewer chain is down.
 *
 * Every check here is high-precision on purpose: each issue costs a repair
 * call, so noisy signals (missing proper names, generic number anchors)
 * stay in the review guard instead.
 */

import { looksVietnamese } from "./tldr-lang.js";
import {
  type KnowledgeRule,
  knowledgeViolations,
} from "./translation-knowledge.js";
import type { TranslationText } from "./translation-review.js";
import { missingProtectedTerms } from "./translation-terms.js";

/** Below this the source is too short for a length ratio to mean much. */
const MIN_SOURCE_CHARS_FOR_RATIO = 200;
/** Vietnamese runs about as long as English; under 0.6 means sentences
 * were dropped (prod median was 0.42 when the prompt said "rephrase
 * freely"). */
export const MIN_VI_EN_LENGTH_RATIO = 0.6;

function pairOf(source: TranslationText, candidate: TranslationText) {
  return {
    source,
    candidate,
    sourceLang: "en" as const,
    targetLang: "vi" as const,
    direction: "en-vi" as const,
  };
}

function avoidIssues(
  source: TranslationText,
  candidate: TranslationText,
  rules: KnowledgeRule[]
): string[] {
  return knowledgeViolations(pairOf(source, candidate), rules).map(
    (rule) =>
      `"${rule.source_term}" must not be rendered as ${rule.bad_vi
        .map((bad) => `"${bad}"`)
        .join(" or ")}${rule.vi_term ? `; use "${rule.vi_term}"` : ""}`
  );
}

const EN_MAGNITUDE_RE =
  /(\d+(?:[.,]\d+)?)\s*(trillion|billion|million|tn|bn|mn|[TBM])(?![\p{L}\p{N}])/giu;

function magnitudeOf(unit: string): "trillion" | "billion" | "million" {
  const u = unit.toLowerCase();
  if (u === "t" || u === "tn" || u === "trillion") return "trillion";
  if (u === "b" || u === "bn" || u === "billion") return "billion";
  return "million";
}

const VI_WORD: Record<"trillion" | "billion" | "million", string> = {
  trillion: "nghìn tỷ",
  billion: "tỷ",
  million: "triệu",
};

function viMagnitude(word: string): "trillion" | "billion" | "million" {
  const w = word.toLowerCase();
  if (w.includes("nghìn") || w.includes("ngàn")) return "trillion";
  return w === "tỷ" || w === "tỉ" ? "billion" : "million";
}

/** "$20B" written as "20 triệu USD". Only digits followed by a Vietnamese
 * magnitude word are compared, so "7B" or "235B" kept verbatim pass. */
function magnitudeIssues(sourceText: string, viText: string): string[] {
  const issues: string[] = [];
  for (const match of sourceText.matchAll(EN_MAGNITUDE_RE)) {
    const [whole, digits, unit] = match;
    const at = match.index ?? 0;
    // A bare letter is money only next to "$"/USD; "7B" and "235B" are
    // model sizes the Vietnamese keeps verbatim.
    if (
      unit.length === 1 &&
      !/\$\s*$/.test(sourceText.slice(Math.max(0, at - 2), at)) &&
      !/^\s*(?:usd|dollars?)\b/i.test(sourceText.slice(at + whole.length))
    )
      continue;
    const expected = magnitudeOf(unit);
    const viDigits = digits.replace(".", ",");
    const viRe = new RegExp(
      `(?<![\\p{N}.,])(?:${escapeRegex(digits)}|${escapeRegex(viDigits)})\\s*(nghìn tỷ|ngàn tỷ|tỷ|tỉ|triệu)(?![\\p{L}\\p{M}])`,
      "giu"
    );
    for (const vi of viText.normalize("NFC").matchAll(viRe)) {
      if (viMagnitude(vi[1]) !== expected) {
        issues.push(
          `"${whole.trim()}" must be "${viDigits} ${VI_WORD[expected]}", not "${vi[0]}"`
        );
        break;
      }
    }
  }
  return issues;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GLOSS_RE = /[\p{L}\p{M}][\p{L}\p{M}\p{N}'’]*\s*\(([^)]*)\)/gu;

function isNumberYearOrPercent(text: string): boolean {
  return /^[+-]?(?:\d+(?:[.,]\d+)*)%?$/.test(text.replace(/\s/g, ""));
}

/** First letters of a parenthetical expansion. Hyphen parts each contribute
 * one letter: "Retrieval-Augmented Generation" → RAG. */
function glossInitials(text: string): string {
  let initials = "";
  for (const word of text.split(/\s+/)) {
    for (const part of word.split(/[-'’]/)) {
      const letter = part.match(/[A-Za-z]/);
      if (letter) initials += letter[0].toUpperCase();
    }
  }
  return initials;
}

/** "tác nhân (agent)", "bầy (swarm)", "RAG (Retrieval-Augmented Generation)".
 * An all-lowercase interior is a gloss. A Title Case interior is a gloss
 * only when the word before the parenthesis is an all-caps acronym whose
 * initials match (RAG, CCC). A bare label ("USD", "NYSE", "Anthropic"), a
 * place or product name ("New York", "Claude Code", "Sam Altman"), a number,
 * a year, or a percentage is not. Each hit costs a repair call. */
function isEnglishGloss(before: string, inside: string): boolean {
  const text = inside.trim();
  if (!text || isNumberYearOrPercent(text)) return false;
  if (/\P{ASCII}/u.test(text)) return false;
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const significant = text.replace(/\s/g, "");
  if (letters < 2 || letters / significant.length < 0.8) return false;
  // Do not exempt short lowercase words: "(agent)" would slip through with "(beta)".
  if (/^[a-z]+(?:[-'’][a-z]+)*$/.test(text)) return true;
  return /^[A-Z]{2,}$/.test(before) && glossInitials(text) === before;
}

function glossIssues(viText: string): string[] {
  const issues: string[] = [];
  for (const match of viText.normalize("NFC").matchAll(GLOSS_RE)) {
    const whole = match[0];
    const before = whole.slice(0, whole.lastIndexOf("(")).trim();
    if (!isEnglishGloss(before, match[1] ?? "")) continue;
    const snippet = whole.replace(/\s+/g, " ").trim();
    issues.push(
      `"${snippet}" is a parenthetical English gloss; drop the gloss and keep one term`
    );
  }
  return issues;
}

/** Vietnamese reduplications that are correct as written ("từ từ",
 * "người người"). Any other doubled Vietnamese syllable is a generation
 * stutter. */
const VI_REDUPLICATION = new Set([
  "từ",
  "người",
  "nhà",
  "ngày",
  "đâu",
  "nơi",
  "năm",
  "tháng",
  "đời",
  "mãi",
  "xa",
  "lâu",
]);

/** A Vietnamese syllable written twice in a row: "thỏa thỏa thuận",
 * "285 triệu triệu USD" (prod 2026-10-08). Only syllables with Vietnamese
 * diacritics count, so English names and kept jargon never trip it. */
function stutterIssues(viText: string): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const match of viText
    .normalize("NFC")
    .matchAll(/(?<![\p{L}\p{M}])([\p{L}\p{M}]+)\s+\1(?![\p{L}\p{M}])/giu)) {
    const word = (match[1] ?? "").toLowerCase();
    if (!NON_ASCII_RE.test(word) || VI_REDUPLICATION.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    issues.push(`"${match[0]}" repeats a word; write "${match[1]}" once`);
  }
  return issues;
}

const VI_WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*/gu;
const NON_ASCII_RE = /\P{ASCII}/u;

/** "Nscale Huy Động 3,36 Tỷ USD Trước Khi Niêm Yết". Words copied from the
 * English source (names, kept jargon) and the first word of each clause are
 * not counted. Title Case means at least three counted Vietnamese words are
 * capitalized and none of them is lowercase, so an institution inside a
 * sentence-case headline ("Bộ Tư pháp Hoa Kỳ kiện OpenAI") passes. */
export function isTitleCaseVi(viTitle: string, sourceTitle: string): boolean {
  const sourceWords = new Set(
    (sourceTitle.match(VI_WORD_RE) ?? []).map((w) => w.toLowerCase())
  );
  let vietnamese = 0;
  let capitalized = 0;
  for (const clause of viTitle.normalize("NFC").split(/[:—–|]/)) {
    const words = clause.match(VI_WORD_RE) ?? [];
    for (const word of words.slice(1)) {
      if (sourceWords.has(word.toLowerCase())) continue;
      // English-looking leftovers (all ASCII, no Vietnamese diacritics) are
      // usually names the source spelled differently; skip them.
      if (!NON_ASCII_RE.test(word) && !/^[A-Z][a-z]+$/.test(word)) continue;
      vietnamese++;
      if (/^\p{Lu}/u.test(word)) capitalized++;
    }
  }
  return capitalized >= 3 && capitalized === vietnamese;
}

/** Issues in one translated item, as instructions for the repair prompt.
 * `source` must be what the generator was sent (stripped and clipped). */
export function translationDraftIssues(
  source: TranslationText,
  candidate: TranslationText,
  rules: KnowledgeRule[],
  titlesOnly: boolean
): string[] {
  const src = titlesOnly ? { title: source.title, summary: "" } : source;
  const cand = titlesOnly ? { title: candidate.title, summary: "" } : candidate;
  const issues: string[] = [];
  const missing = missingProtectedTerms(src, cand).jargon;
  if (missing.length > 0) {
    issues.push(
      `keep these terms in English: ${missing
        .map((t) => (t === "fine-tun" ? "fine-tune" : t))
        .join(", ")}`
    );
  }
  issues.push(...avoidIssues(src, cand, rules));
  const viText = `${cand.title}\n${cand.summary}`;
  issues.push(...magnitudeIssues(`${src.title}\n${src.summary}`, viText));
  issues.push(...glossIssues(viText));
  issues.push(...stutterIssues(viText));
  if (isTitleCaseVi(cand.title, src.title)) {
    issues.push(
      "the title is in Title Case; use Vietnamese sentence case (capitalize only the first word and proper names)"
    );
  }
  if (
    !titlesOnly &&
    src.summary.length >= MIN_SOURCE_CHARS_FOR_RATIO &&
    cand.summary.length / src.summary.length < MIN_VI_EN_LENGTH_RATIO
  ) {
    issues.push(
      `the summary is ${Math.round((cand.summary.length / src.summary.length) * 100)}% of the source length; translate every sentence, do not condense`
    );
  }
  return issues;
}

/** Issues in one Vietnamese TL;DR bullet against the items it cites. A
 * bullet is a digest: calques, magnitudes, parenthetical glosses, and
 * doubled words. */
export function tldrBulletIssues(
  sourceText: string,
  bullet: string,
  rules: KnowledgeRule[]
): string[] {
  const source = { title: "", summary: sourceText };
  const candidate = { title: "", summary: bullet };
  return [
    ...avoidIssues(source, candidate, rules),
    ...magnitudeIssues(sourceText, bullet),
    ...glossIssues(bullet),
    ...stutterIssues(bullet),
  ];
}

/** A repair replaces a draft only when it fixes something without
 * cheating: an English echo of the source or a clause cut out of the draft
 * passes every check above, so each Vietnamese field must stay Vietnamese
 * and the text must keep ≥ 80% of the draft's length. */
export function acceptsRepair(
  draft: readonly string[],
  repair: readonly string[],
  draftIssues: number,
  repairIssues: number
): boolean {
  if (repairIssues >= draftIssues) return false;
  if (
    draft.some(
      (text, i) => looksVietnamese(text) && !looksVietnamese(repair[i] ?? "")
    )
  )
    return false;
  return repair.join("").length >= 0.8 * draft.join("").length;
}
