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
import {
  keepTermLabel,
  mentionsModelFamily,
  missingProtectedTerms,
} from "./translation-terms.js";
import { VI_COMPOUNDS, VI_STANDALONE } from "./vi-compounds.js";
import { garbledWords } from "./vi-syllable.js";

/** Below this the source is too short for a length ratio to mean much. */
const MIN_SOURCE_CHARS_FOR_RATIO = 200;
/** Vietnamese runs about as long as English; under 0.6 means sentences
 * were dropped (prod median was 0.42 when the prompt said "rephrase
 * freely"). */
export const MIN_VI_EN_LENGTH_RATIO = 0.6;
/** A source summary this long is prose, not a name. In 60 days of prod
 * (4,480 EN→VI rows to 2026-10-15) every summary kept English on purpose
 * was a name of at most 4 words ("Earth AI", "Agents.md in Google Docs"),
 * and the shortest English echo was 10 words. */
const MIN_ECHO_SOURCE_WORDS = 6;

function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;
}

/** English function words, a closed class. A product or release name has
 * none ("vLLM v0.32.0", "Chirp Pong"); a headline sentence has several. */
const ENGLISH_FUNCTION_WORDS = new Set(
  (
    "a an the and or but nor so yet of to in on at by for with from into onto over under about after before " +
    "between through during without within against toward towards than as via up out off " +
    "is are was were be been being has have had do does did will would can could may might must shall should " +
    "it its they their them we our us you your he his him she her i my me this that these those " +
    "who whom whose which what when where why how while if because not no"
  ).split(" ")
);
const MIN_ECHO_TITLE_FUNCTION_WORDS = 2;

const normalizedTitle = (title: string) =>
  title.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** The draft kept the English headline word for word, and that headline
 * is a sentence, not a name: it has at least two English function words. */
function isEnglishTitleEcho(sourceTitle: string, viTitle: string): boolean {
  if (
    !viTitle.trim() ||
    normalizedTitle(viTitle) !== normalizedTitle(sourceTitle)
  )
    return false;
  const words = sourceTitle.toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) ?? [];
  return (
    words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word)).length >=
    MIN_ECHO_TITLE_FUNCTION_WORDS
  );
}

/** The draft returned the English instead of translating it: a prose
 * summary with no Vietnamese diacritics, the same test the English-in-VI
 * alert counts (translation-english.ts), or the English headline unchanged.
 * A headline that is only a name ("llm-echo 0.5") is not judged. When the
 * title is English too, the issue names it, because the repair fixes only
 * what the issue lists. */
function englishEchoIssues(
  source: TranslationText,
  candidate: TranslationText
): string[] {
  if (
    wordCount(source.summary) >= MIN_ECHO_SOURCE_WORDS &&
    candidate.summary.trim() &&
    !looksVietnamese(candidate.summary)
  ) {
    return [
      looksVietnamese(candidate.title)
        ? "the summary is still English; translate it into Vietnamese"
        : "the title and summary are still the English source; translate both into Vietnamese",
    ];
  }
  return isEnglishTitleEcho(source.title, candidate.title)
    ? [
        "the title is still the English headline; write it in Vietnamese and keep only names in English",
      ]
    : [];
}

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

/** A wrong Vietnamese reading of an English term, from prod. Each fires
 * only when the source has the term, no source word licenses the bad
 * phrase, and no Vietnamese text carries a right rendering. */
interface Calque {
  term: string;
  inSource: (text: string) => boolean;
  licensedBy?: RegExp;
  bad: RegExp;
  rightVi?: RegExp;
  use: string;
}

const CALQUES: readonly Calque[] = [
  // Prod 8e8bf17f: "gia đình mô hình", "gia đình foundation model". "Họ mô
  // hình hóa" is "they model".
  {
    term: "model family",
    inSource: mentionsModelFamily,
    bad: /(?<![\p{L}\p{M}])(?:gia đình(?:\s+[\p{L}\p{M}\p{N}-]+){0,2}?\s+(?:mô hình|model)|họ\s+(?:mô hình|model)(?!\s+(?:hóa|hoá)))(?![\p{L}\p{M}])/giu,
    use: "model family",
  },
  // "Khung suy diễn" for "inference engine". Vietnamese readers use the
  // English term; the rendered engine, framework, tool or machine names a
  // different thing.
  {
    term: "inference engine",
    inSource: (text) => /\binference engines?\b/i.test(text),
    bad: /(?<![\p{L}\p{M}])(?:khung|framework|công cụ|động cơ|cỗ máy|bộ máy)\s+suy\s+(?:diễn|luận)(?![\p{L}\p{M}])/giu,
    rightVi: /inference engine/iu,
    use: "inference engine",
  },
  // Prod 7beb3e30: "trí tuệ nhân quả" (causal) for embodied intelligence.
  {
    term: "embodied",
    inSource: (text) => /\bembodied\b/i.test(text),
    licensedBy: /\bcaus/i,
    bad: /nhân quả/giu,
    use: "trí tuệ hiện thân",
  },
  // Prod 7beb3e30: "humanoids" as "con người" (people) in a list of robots.
  {
    term: "humanoid",
    inSource: (text) => /\bhumanoids?\b/i.test(text),
    licensedBy: /\b(?:humans?|humanity|humankind|mankind|people|persons?)\b/i,
    bad: /con người/giu,
    rightVi: /hình người|humanoid/iu,
    use: "robot hình người",
  },
  // Prod 7beb3e30: "tính chung chung chung" (vague) for "the generality".
  // The stutter check misses it: "chung" has no diacritics.
  {
    term: "generality",
    inSource: (text) =>
      /\bgenerali(?:ty|ties|[sz](?:e|es|ed|ing|ation|ations))\b/i.test(text),
    licensedBy: /\b(?:vague\w*|generic\w*|too general|overly general)\b/i,
    bad: /chung chung/giu,
    use: "tính tổng quát",
  },
  // The rest come from 400 stored rows of 2026-10-12..19, each seen in at
  // least three. "Đa dạng" is diverse: 9 rows used it for multimodal.
  {
    term: "multimodal",
    inSource: (text) => /\bmulti-?modal/i.test(text),
    licensedBy: /\b(?:divers\w*|variet\w*|various|varied|wide range)\b/i,
    bad: /đa dạng(?:\s+thức)?/giu,
    use: "đa phương thức",
  },
  // 17 rows; "lý luận" is theory, "lập luận" is argument.
  {
    term: "reasoning",
    inSource: (text) => /\breasoning\b/i.test(text),
    licensedBy:
      /\b(?:argu\w*|theor\w*|legal|court|judges?|ruling|justif\w*)\b/i,
    bad: /lý luận|lập luận/giu,
    use: "suy luận",
  },
  {
    term: "generative",
    inSource: (text) => /\bgenerative\b/i.test(text),
    // "học sinh tạo ra" is "students create".
    bad: /sinh tạo(?!\s+(?:ra|nên|thành|lập))/giu,
    use: "tạo sinh",
  },
  {
    term: "trajectories",
    inSource: (text) => /\btrajector(?:y|ies)\b/i.test(text),
    bad: /quỹ đường/giu,
    use: "quỹ đạo",
  },
  // Model weights, not mass.
  {
    term: "weights",
    inSource: (text) => /\bweights\b/i.test(text),
    licensedBy:
      /\b(?:weighs?|weighing|kg|kilograms?|lbs?|pounds|tons?|tonnes|heav\w*)\b/i,
    bad: /trọng lượng/giu,
    use: "trọng số",
  },
  // "Cục bản" is not a word; "địa phương" is right for local roads and
  // local news, so only AI that runs on one's own machine counts.
  {
    term: "local",
    inSource: (text) =>
      /\blocal\s+(?:AI|artificial|LLMs?|models?|inference|agent\w*|hardware|machines?|compute|devices?|workloads?)\b|\blocally\b/i.test(
        text
      ),
    licensedBy:
      /\blocal\s+(?:roads?|governments?|authorit\w*|officials?|communit\w*|news|elections?|police|residents?|businesses|media|councils?|courts?|markets?)\b/i,
    bad: /cục bản|địa phương/giu,
    use: "cục bộ",
  },
  // "Frontier model" is a keep term, but "frontier AI models", "frontier
  // LLM" and "frontier labs" became "tiên phong" (pioneer) in 8 rows.
  {
    term: "frontier",
    inSource: (text) => /\bfrontier\b/i.test(text),
    licensedBy: /\b(?:pioneer\w*|vanguard|borders?)\b/i,
    bad: /tiên phong|biên giới/giu,
    use: "frontier",
  },
  // A data pipeline is not a pipe.
  {
    term: "pipeline",
    inSource: (text) => /\bpipelines?\b/i.test(text),
    licensedBy: /\b(?:oil|gas|water|fuel|crude|pipes?)\b/i,
    bad: /đường ống/giu,
    use: "pipeline",
  },
];

function calqueIssues(sourceText: string, viText: string): string[] {
  const vi = viText.normalize("NFC");
  const issues: string[] = [];
  for (const calque of CALQUES) {
    if (!calque.inSource(sourceText)) continue;
    if (calque.licensedBy?.test(sourceText)) continue;
    if (calque.rightVi?.test(vi)) continue;
    const found = [
      ...new Set([...vi.matchAll(calque.bad)].map((m) => m[0].toLowerCase())),
    ];
    if (found.length === 0) continue;
    issues.push(
      `"${calque.term}" must not be rendered as ${found
        .map((bad) => `"${bad}"`)
        .join(" or ")}; use "${calque.use}"`
    );
  }
  return issues;
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

/** A product name and the number written with it: "Gemini 3.8", "GPT-4o",
 * "VR72", "GLM-5.3-Flash" (GLM 5.3), "GB200s" (GB200). */
interface VersionedName {
  text: string;
  /** Lowercased: "gemini", "gpt". */
  name: string;
  /** Lowercased number with its suffix letter: "3.8", "4o", "72". */
  version: string;
}

const VERSIONED_NAME_RE =
  /(?<![\p{L}\p{N}$€£.,-])([A-Z][A-Za-z]*)([ -]?)(\d+(?:\.\d+)*)([a-z]?)(?![\p{N}]|[.,]\p{N})/gu;
/** "1.9x", "19.6%", "70B", "3.5 billion": an amount, not a version. */
const AMOUNT_AFTER_RE =
  /^\s*-?(?:%|percent\b|(?:trillion|billion|million|thousand|tn|bn|mn|[TBMK])(?![\p{L}\p{N}]))/iu;

function versionedNames(text: string): VersionedName[] {
  const names: VersionedName[] = [];
  const nfc = text.normalize("NFC");
  for (const match of nfc.matchAll(VERSIONED_NAME_RE)) {
    const [whole, name, joint, digits, suffix] = match;
    if (suffix === "x") continue;
    const after = nfc.slice((match.index ?? 0) + whole.length);
    if (!suffix && AMOUNT_AFTER_RE.test(after)) continue;
    // "GB200s" is the plural of GB200.
    const letter = suffix === "s" ? "" : suffix;
    names.push({
      text: `${name}${joint}${digits}${letter}`,
      name: name.toLowerCase(),
      version: `${digits}${letter}`.toLowerCase(),
    });
  }
  return names;
}

const keyOf = (v: VersionedName) => `${v.name} ${v.version}`;

/** "3.8" written in the Vietnamese text, glued to a name or not ("Qwen3.8").
 * A decimal comma counts: it is an amount the prompt asked to convert. */
function hasVersionNumber(viText: string, version: string): boolean {
  const forms = /^\d+\.\d+$/.test(version)
    ? [version, version.replace(".", ",")]
    : [version];
  return new RegExp(
    `(?<![\\p{N}.,])(?:${forms.map(escapeRegex).join("|")})(?![\\p{N}]|[.,]\\p{N})`,
    "iu"
  ).test(viText.normalize("NFC"));
}

/** A version the translation changed or lost: "Gemini 3.8 Flash" as
 * "Gemini 1.5 Flash" (prod c4c7ba8f, #781), "GPT-6" as "GPT-4o". A swap is
 * the same name with a number the source never writes. A drop counts only
 * for a dotted version in the source title that neither Vietnamese field
 * keeps: a shortened headline whose summary keeps the version reads fine
 * (prod 5a022d30), a summary drop was mostly condensed or clipped text, and
 * an integer ("Gemini 4", "Q2", "FY27") is too often rewritten to judge. */
function versionIssues(
  source: TranslationText,
  candidate: TranslationText
): string[] {
  const inSource = new Set(
    versionedNames(`${source.title}\n${source.summary}`).map(keyOf)
  );
  const viText = `${candidate.title}\n${candidate.summary}`;
  const issues = new Set<string>();
  const fields: [string, string, boolean][] = [
    [source.title, candidate.title, true],
    [source.summary, candidate.summary, false],
  ];
  for (const [src, vi, isTitle] of fields) {
    const viNames = versionedNames(vi);
    const kept = new Set(viNames.map(keyOf));
    for (const want of versionedNames(src)) {
      if (kept.has(keyOf(want))) continue;
      const swap = viNames.find(
        (v) => v.name === want.name && !inSource.has(keyOf(v))
      );
      if (swap) {
        issues.add(
          `keep "${want.text}" as the source writes it, not "${swap.text}"`
        );
      } else if (
        isTitle &&
        want.version.includes(".") &&
        !hasVersionNumber(viText, want.version)
      ) {
        issues.add(
          `the title drops "${want.text}"; keep the name and its version`
        );
      }
    }
  }
  return [...issues];
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
 * a year, a percentage, or a list marker ("và (ii)", prod c4bfc91a) is not.
 * Each hit costs a repair call. */
function isEnglishGloss(before: string, inside: string): boolean {
  const text = inside.trim();
  if (!text || isNumberYearOrPercent(text)) return false;
  if (/\P{ASCII}/u.test(text)) return false;
  if (/^(?:i{1,3}|iv|vi{0,3}|ix|x)$/i.test(text)) return false;
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const significant = text.replace(/\s/g, "");
  if (letters < 2 || letters / significant.length < 0.8) return false;
  // Do not exempt short lowercase words: "(agent)" would slip through with "(beta)".
  if (/^[a-z]+(?:[-'’][a-z]+)*$/.test(text)) return true;
  return /^[A-Z]{2,}$/.test(before) && glossInitials(text) === before;
}

/** A gloss the source itself writes ("SERA (Self-Evaluating Recursive
 * Agents)", prod 1e7f081e) is the author's, and the translation keeps it. */
function glossIssues(viText: string, sourceText: string): string[] {
  const issues: string[] = [];
  const source = sourceText.replace(/\s+/g, " ");
  for (const match of viText.normalize("NFC").matchAll(GLOSS_RE)) {
    const whole = match[0];
    const before = whole.slice(0, whole.lastIndexOf("(")).trim();
    if (!isEnglishGloss(before, match[1] ?? "")) continue;
    const snippet = whole.replace(/\s+/g, " ").trim();
    if (source.includes(snippet)) continue;
    issues.push(
      `"${snippet}" is a parenthetical English gloss; drop the gloss and keep one term`
    );
  }
  return issues;
}

/** Vietnamese reduplications that are correct as written ("từ từ",
 * "người người", "dần dần"). Any other doubled Vietnamese syllable is a
 * generation stutter, unless two words share it (`isCompoundOverlap`). */
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
  "dần",
]);

const SYLLABLE_RE = /[\p{L}\p{M}\p{N}]+/gu;

/** "quy mô mô hình": each copy of the doubled syllable belongs to a
 * neighbour, the first ending a compound and the second starting one or
 * standing alone. */
function isCompoundOverlap(
  before: string,
  word: string,
  after: string
): boolean {
  const left = VI_COMPOUNDS.has(`${before} ${word}`);
  const right = VI_COMPOUNDS.has(`${word} ${after}`);
  const alone = VI_STANDALONE.has(word);
  return (left || right) && (left || alone) && (right || alone);
}

/** A Vietnamese syllable written twice in a row: "thỏa thỏa thuận",
 * "285 triệu triệu USD" (prod 2026-10-08). Only syllables with Vietnamese
 * diacritics count, so English names and kept jargon never trip it. Two
 * words that share a syllable are not a stutter (`isCompoundOverlap`): of
 * the 45 doubled syllables it flagged in the 14 days to 2026-10-20, 35 were
 * ("quy mô mô hình", "bài toán toán học"). */
function stutterIssues(viText: string): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const text = viText.normalize("NFC");
  for (const match of text.matchAll(
    /(?<![\p{L}\p{M}])([\p{L}\p{M}]+)\s+\1(?![\p{L}\p{M}])/giu
  )) {
    const word = (match[1] ?? "").toLowerCase();
    if (!NON_ASCII_RE.test(word) || VI_REDUPLICATION.has(word)) continue;
    const start = match.index ?? 0;
    const before =
      text.slice(0, start).match(SYLLABLE_RE)?.at(-1)?.toLowerCase() ?? "";
    const after =
      text
        .slice(start + match[0].length)
        .match(SYLLABLE_RE)?.[0]
        ?.toLowerCase() ?? "";
    if (isCompoundOverlap(before, word, after)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    issues.push(`"${match[0]}" repeats a word; write "${match[1]}" once`);
  }
  return issues;
}

/** "vượ quá", "nền tảp", "t合成": words no Vietnamese spelling allows. A
 * near miss built from real syllables ("rời rạp", "sụp đảo") passes. */
function garbleIssues(sourceText: string, viText: string): string[] {
  const words = garbledWords(viText, sourceText);
  return words.length === 0
    ? []
    : [
        `${words.map((word) => `"${word}"`).join(", ")} ${words.length === 1 ? "is not a Vietnamese word" : "are not Vietnamese words"}; fix the spelling`,
      ];
}

/** A decimal written as an amount: before %, a currency, a magnitude, or
 * a multiplier, or after "$". */
const VI_DECIMAL_POINT_RE =
  /(?<![\p{L}\p{N}.,-])(\$?)(\d+\.\d+)(?![\p{N}]|[.,]\p{N}|\s*(?:[TBMK]|tn|bn|mn)(?![\p{L}\p{N}]))(?=(\s*(?:%|USD|lần|x|điểm|nghìn|ngàn|tỷ|tỉ|triệu)(?![\p{L}\p{M}]))?)/gu;

/** "55.4%" kept from the source where Vietnamese writes "55,4%". The same
 * "a.b" must be in the source, so a Vietnamese thousands point ("23.000"
 * for "23,000") never counts, and a version ("Opus 5.5", "iOS 27.3") has no
 * amount after it. */
function decimalPointIssues(sourceText: string, viText: string): string[] {
  const issues = new Set<string>();
  for (const match of viText.normalize("NFC").matchAll(VI_DECIMAL_POINT_RE)) {
    const [, dollar, number, unit] = match;
    if (!dollar && !unit) continue;
    // "$1.5 tỷ" is the dollar check's issue.
    if (dollar && unit && !/%|USD|lần|x|điểm/.test(unit)) continue;
    if (
      !new RegExp(`(?<![\\p{N}.])${escapeRegex(number)}(?!\\p{N})`, "u").test(
        sourceText
      )
    )
      continue;
    issues.add(
      `"${number}" uses a decimal point; write "${number.replace(".", ",")}"`
    );
  }
  return [...issues];
}

const VI_DOLLAR_MAGNITUDE_RE =
  /(?<![\p{L}\p{N}])\$\s?(\d+(?:[.,]\d+)?)\s*(trillion|billion|million|nghìn tỷ|ngàn tỷ|tỷ|tỉ|triệu|tn|bn|mn|[TBM])(?![\p{L}\p{N}])/giu;

/** "$2T", "$50M" or "$6,6 tỷ" left in the Vietnamese: house style is
 * "2 nghìn tỷ USD". A letter before "$" is another currency ("NT$"). */
function dollarIssues(viText: string): string[] {
  const issues = new Set<string>();
  for (const match of viText
    .normalize("NFC")
    .matchAll(VI_DOLLAR_MAGNITUDE_RE)) {
    const [whole, digits, unit] = match;
    const magnitude = /^[a-z]{1,2}$|^(?:trillion|billion|million)$/i.test(unit)
      ? magnitudeOf(unit)
      : viMagnitude(unit);
    issues.add(
      `"${whole.trim()}" must be "${digits.replace(".", ",")} ${VI_WORD[magnitude]} USD"`
    );
  }
  return [...issues];
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

export type DraftCheck =
  | "echo"
  | "keep"
  | "avoid"
  | "calque"
  | "magnitude"
  | "version"
  | "gloss"
  | "stutter"
  | "garble"
  | "decimal"
  | "dollar"
  | "titleCase"
  | "length";

/** Issues in one translated item per check, in repair-prompt order.
 * `source` must be what the generator was sent (stripped and clipped). */
export function draftIssuesByCheck(
  source: TranslationText,
  candidate: TranslationText,
  rules: KnowledgeRule[],
  titlesOnly: boolean
): Record<DraftCheck, string[]> {
  const src = titlesOnly ? { title: source.title, summary: "" } : source;
  const cand = titlesOnly ? { title: candidate.title, summary: "" } : candidate;
  const missing = missingProtectedTerms(src, cand).jargon;
  const sourceText = `${src.title}\n${src.summary}`;
  const viText = `${cand.title}\n${cand.summary}`;
  return {
    echo: englishEchoIssues(src, cand),
    keep:
      missing.length > 0
        ? [
            `keep these terms in English: ${missing.map(keepTermLabel).join(", ")}`,
          ]
        : [],
    avoid: avoidIssues(src, cand, rules),
    calque: calqueIssues(sourceText, viText),
    magnitude: magnitudeIssues(sourceText, viText),
    version: versionIssues(src, cand),
    gloss: glossIssues(viText, sourceText),
    stutter: stutterIssues(viText),
    garble: garbleIssues(sourceText, viText),
    decimal: decimalPointIssues(sourceText, viText),
    dollar: dollarIssues(viText),
    titleCase: isTitleCaseVi(cand.title, src.title)
      ? [
          "the title is in Title Case; use Vietnamese sentence case (capitalize only the first word and proper names)",
        ]
      : [],
    length:
      !titlesOnly &&
      src.summary.length >= MIN_SOURCE_CHARS_FOR_RATIO &&
      cand.summary.length / src.summary.length < MIN_VI_EN_LENGTH_RATIO
        ? [
            `the summary is ${Math.round((cand.summary.length / src.summary.length) * 100)}% of the source length; translate every sentence, do not condense`,
          ]
        : [],
  };
}

/** Issues in one translated item, as instructions for the repair prompt. */
export function translationDraftIssues(
  source: TranslationText,
  candidate: TranslationText,
  rules: KnowledgeRule[],
  titlesOnly: boolean
): string[] {
  return Object.values(
    draftIssuesByCheck(source, candidate, rules, titlesOnly)
  ).flat();
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
    ...calqueIssues(sourceText, bullet),
    ...magnitudeIssues(sourceText, bullet),
    ...glossIssues(bullet, sourceText),
    ...stutterIssues(bullet),
  ];
}

/** A repair replaces a draft only when it fixes something without
 * cheating: an English title, or a short summary, echoed from the source
 * and a clause cut out of the draft pass every check above, so each
 * Vietnamese field must stay Vietnamese and the text must keep ≥ 80% of the
 * draft's length. */
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
