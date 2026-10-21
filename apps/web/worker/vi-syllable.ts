/**
 * Vietnamese spelling: which written syllables can exist. A syllable is an
 * optional initial consonant, a vowel nucleus (with its o/u glide), an
 * optional final, and at most one tone mark.
 *
 * The rime table follows standard orthography and was checked against
 * Viet74K (github.com/duyet/vietnamese-wordlist, 73,901 entries): it accepts
 * 144,706 of the 144,977 marked syllables there. The 271 it rejects are
 * loanwords with a consonant cluster ("đrô", "prô", "xtơ") and typos in the
 * list ("cưỡì", "ngườí"). The list itself is not shipped: `VI_MARKED_SYLLABLES`
 * comes from permissive sources (scripts/gen-vi-lexicon.ts).
 */

import { VI_MARKED_SYLLABLES } from "./vi-lexicon.js";

/** Combining marks by code point. The formatter turns escapes in string
 * literals into the invisible marks themselves. */
const marks = (...codes: number[]): ReadonlySet<string> =>
  new Set(codes.map((code) => String.fromCharCode(code)));
/** Huyền, sắc, ngã, hỏi, nặng. */
const TONE_MARKS = marks(0x300, 0x301, 0x303, 0x309, 0x323);
/** Sắc and nặng: the only tones a syllable ending in c, ch, p or t takes. */
const STOP_TONES = marks(0x301, 0x323);
/** Breve, circumflex and horn build ă, â, ê, ô, ơ, ư. Any other mark on a
 * Latin letter (ü, ç) makes a foreign word, not a Vietnamese one. */
const VOWEL_MARKS = marks(0x306, 0x302, 0x31b);

const ONSETS = [
  "ngh",
  "ch",
  "gh",
  "gi",
  "kh",
  "ng",
  "nh",
  "ph",
  "qu",
  "th",
  "tr",
  "b",
  "c",
  "d",
  "đ",
  "g",
  "h",
  "k",
  "l",
  "m",
  "n",
  "p",
  "r",
  "s",
  "t",
  "v",
  "x",
] as const;

/** Each vowel nucleus, with its glide, and the finals it takes ("" is an
 * open syllable). */
const NUCLEUS_FINALS: Readonly<Record<string, readonly string[]>> = {
  a: ["", "c", "ch", "i", "m", "n", "ng", "nh", "o", "p", "t", "u", "y"],
  ă: ["c", "m", "n", "ng", "p", "t"],
  â: ["c", "m", "n", "ng", "p", "t", "u", "y"],
  e: ["", "c", "m", "n", "ng", "o", "p", "t"],
  ê: ["", "c", "ch", "m", "n", "ng", "nh", "p", "t", "u"],
  i: ["", "a", "c", "ch", "m", "n", "nh", "p", "t", "u"],
  iê: ["c", "m", "n", "ng", "p", "t", "u"],
  yê: ["m", "n", "ng", "t", "u"],
  o: ["", "c", "i", "m", "n", "ng", "p", "t"],
  oo: ["c", "ng"],
  ô: ["", "c", "i", "m", "n", "ng", "p", "t"],
  ơ: ["", "i", "m", "n", "p", "t"],
  u: ["", "a", "c", "i", "m", "n", "ng", "p", "t", "y"],
  uô: ["c", "i", "m", "n", "ng", "t"],
  ư: ["", "a", "c", "i", "m", "n", "ng", "t", "u"],
  ươ: ["c", "i", "m", "n", "ng", "p", "t", "u"],
  y: [""],
  oa: ["", "c", "ch", "i", "m", "n", "ng", "nh", "o", "p", "t", "y"],
  oă: ["c", "m", "n", "ng", "p", "t"],
  oe: ["", "m", "n", "o", "t"],
  oau: [""],
  uâ: ["n", "ng", "t", "y"],
  uê: ["", "ch", "n", "nh", "t", "u"],
  uy: ["", "a", "ch", "n", "nh", "p", "t", "u"],
  uyê: ["n", "t"],
  uơ: ["", "i", "n"],
};

const RIMES: ReadonlySet<string> = new Set(
  Object.entries(NUCLEUS_FINALS).flatMap(([nucleus, finals]) =>
    finals.map((final) => nucleus + final)
  )
);

const STOP_FINAL_RE = /(?:c|ch|p|t)$/;

/** The rimes a toneless lowercase syllable can be read as. "gi" before a
 * consonant is g + i ("gìn"); "qu" carries the glide, so "qua" has the rime
 * "oa" and "quy" the rime "uy". */
function rimesOf(base: string): string[] {
  const out = [base];
  for (const onset of ONSETS) {
    if (!base.startsWith(onset)) continue;
    const rest = base.slice(onset.length);
    if (onset === "gi" && !/^[aăâeêoôơuưy]/u.test(rest)) out.push(`i${rest}`);
    else if (onset === "qu")
      out.push(
        /^[aăe]/u.test(rest)
          ? `o${rest}`
          : rest.startsWith("i")
            ? `uy${rest.slice(1)}`
            : `u${rest}`
      );
    else out.push(rest);
  }
  return out;
}

interface Spelling {
  base: string;
  tones: string[];
  foreign: boolean;
}

function spell(word: string): Spelling {
  const chars = [...word.toLowerCase().normalize("NFD")];
  const tones = chars.filter((ch) => TONE_MARKS.has(ch));
  const rest = chars.filter((ch) => !TONE_MARKS.has(ch)).join("");
  const foreign =
    /^[\p{Script=Latin}\p{M}]+$/u.test(rest) &&
    [...rest].some((ch) => /\p{M}/u.test(ch) && !VOWEL_MARKS.has(ch));
  return { base: rest.normalize("NFC"), tones, foreign };
}

function isSyllableBase(base: string, tone: string | undefined): boolean {
  return rimesOf(base).some(
    (rime) =>
      RIMES.has(rime) &&
      (tone === undefined || !STOP_FINAL_RE.test(rime) || STOP_TONES.has(tone))
  );
}

/** "nơron", "ximăng", "ôtô": a loanword written as one token, each part a
 * syllable and no tone mark anywhere. A garble almost always carries a tone
 * ("nơờn", "độngngững"). */
function isTonelessCompound(base: string): boolean {
  const memo = new Map<number, boolean>();
  const from = (start: number): boolean => {
    if (start === base.length) return true;
    const known = memo.get(start);
    if (known !== undefined) return known;
    let ok = false;
    for (let end = start + 1; end <= base.length && !ok; end++) {
      ok =
        end - start < base.length &&
        isSyllableBase(base.slice(start, end), undefined) &&
        from(end);
    }
    memo.set(start, ok);
    return ok;
  };
  return from(0);
}

export function isVietnameseSpelling(word: string): boolean {
  const { base, tones, foreign } = spell(word);
  if (foreign) return true;
  if (tones.length > 1) return false;
  if (isSyllableBase(base, tones[0])) return true;
  return tones.length === 0 && isTonelessCompound(base);
}

const WORD_RE = /[\p{L}\p{M}]+/gu;
const ASCII_RE = /^\p{ASCII}*$/u;
/** "HĐQT", "UBND": every cased letter is a capital. CJK has no case. */
const isAcronym = (word: string) =>
  /\p{Lu}/u.test(word) && word === word.toUpperCase();

/** Lowercase, so a name the lexicon lacks ("Hồng Kông") passes. */
const isUnknownSyllable = (word: string) =>
  word === word.toLowerCase() && !VI_MARKED_SYLLABLES.has(word);

/** Words in a Vietnamese draft that no Vietnamese spelling allows: another
 * script ("t合成", "chiến略", "lầnแรก"), a marked word that is not a
 * syllable ("vượ", "nền tảp", "đặặt", "xây dựers"), or a lowercase syllable
 * no word uses ("nghiễn", "triên"). ASCII words (English, names, kept
 * terms), acronyms, "đ" (đồng) and words the source writes are skipped. */
export function garbledWords(viText: string, sourceText: string): string[] {
  const source = new Set(
    (sourceText.normalize("NFC").match(WORD_RE) ?? []).map((w) =>
      w.toLowerCase()
    )
  );
  const out = new Set<string>();
  for (const word of viText.normalize("NFC").match(WORD_RE) ?? []) {
    if (ASCII_RE.test(word) || source.has(word.toLowerCase())) continue;
    if (word.length === 1 || isAcronym(word)) continue;
    if (!isVietnameseSpelling(word) || isUnknownSyllable(word)) out.add(word);
  }
  return [...out];
}
