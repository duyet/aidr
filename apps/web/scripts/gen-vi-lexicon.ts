#!/usr/bin/env tsx
/**
 * Writes `worker/vi-lexicon.ts`: the marked Vietnamese syllables attested in
 * permissively licensed sources. No GPL word list (Viet74K, Hunspell vi_VN,
 * ibus-bamboo) is read.
 *
 * - Unihan `kVietnamese` readings (Hán-Việt and Nôm). Unicode License v3.
 *   https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
 *   https://www.unicode.org/license.txt
 * - Tatoeba Vietnamese sentences. CC BY 2.0 FR.
 *   https://downloads.tatoeba.org/exports/per_language/vie/vie_sentences.tsv.bz2
 *   https://tatoeba.org/en/terms_of_use
 * - Mozilla Common Voice Vietnamese sentences. CC0 1.0.
 *   https://raw.githubusercontent.com/common-voice/common-voice/main/server/data/vi/sentence-collector.txt
 *   https://github.com/common-voice/common-voice#licensing-and-content-source
 * - Kinh Thánh 1934 (vie1934). Public domain.
 *   https://eBible.org/Scriptures/vie1934_readaloud.zip
 *   https://ebible.org/find/details.php?id=vie1934
 * - C4 multilingual, Vietnamese shards 00000-00004 of 01024. ODC-BY 1.0.
 *   https://huggingface.co/datasets/allenai/c4/resolve/main/multilingual/c4-vi.tfrecord-00000-of-01024.json.gz
 *   https://huggingface.co/datasets/allenai/c4#license
 *
 * A Unihan reading counts once seen. A corpus word counts when it appears at
 * least MIN_CORPUS_COUNT times across the corpora: web text repeats typos
 * ("tiêp", "ộng") about a hundred times in five shards, real rare words
 * ("khăm", "gặng") a little more. Each syllable
 * also gets its other tone placement ("hòa"/"hoà", "thụy"/"thuỵ") and its
 * i/y spelling ("lí"/"lý"), since drafts use both styles. Spellings that fail
 * `isVietnameseSpelling` are left out.
 *
 * Usage (from apps/web, sources downloaded; `.json.gz` files are read as C4
 * JSON lines, anything else as plain text):
 *   NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsx \
 *     scripts/gen-vi-lexicon.ts Unihan_Readings.txt vie_sentences.tsv \
 *     sentence-collector.txt vie1934/*.txt c4-vi.tfrecord-0000[0-4]-*.json.gz
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { isVietnameseSpelling } from "../worker/vi-syllable";

const [unihan, ...corpora] = process.argv.slice(2);
if (!unihan || corpora.length === 0)
  throw new Error("usage: gen-vi-lexicon.ts <Unihan_Readings.txt> <text>...");

const MIN_CORPUS_COUNT = 200;
/** Attested only as a typo or an archaic reading, and a garble drafts keep
 * producing ("chưa đư ra", for "đưa"). */
const EXCLUDED = new Set(["đư"]);
/** Standard spellings the corpora hold too rarely: "nơron" (prod a583c383,
 * 64 hits in C4). */
const INCLUDED = ["nơron"];
const WORD_RE = /\p{L}+/gu;
/** Huyền, sắc, ngã, hỏi, nặng, by code point (the formatter would turn
 * escapes into invisible marks). */
const TONES = [0x300, 0x301, 0x303, 0x309, 0x323].map((c) =>
  String.fromCharCode(c)
);
/** Tones plus breve, circumflex, horn. Any other mark ("š", "č") is not
 * Vietnamese. */
const VI_MARKS = new Set([
  ...TONES,
  ...[0x306, 0x302, 0x31b].map((c) => String.fromCharCode(c)),
]);
const isVietnameseLetters = (word: string) =>
  [...word.normalize("NFD")].every(
    (ch) => /[a-zđ]/u.test(ch) || VI_MARKS.has(ch)
  );

const words = (text: string) =>
  text.normalize("NFC").match(WORD_RE) ?? ([] as string[]);

const attested = new Set<string>();
for (const line of readFileSync(unihan, "utf8").split("\n")) {
  const [, field, readings] = line.split("\t");
  if (field === "kVietnamese" && readings)
    for (const w of words(readings)) attested.add(w.toLowerCase());
}

const counts = new Map<string, number>();
const readCorpus = (file: string): string[] =>
  file.endsWith(".json.gz")
    ? gunzipSync(readFileSync(file))
        .toString("utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => (JSON.parse(line) as { text: string }).text)
    : [readFileSync(file, "utf8")];
for (const file of corpora)
  for (const text of readCorpus(file))
    for (const w of words(text))
      if (w === w.toLowerCase()) counts.set(w, (counts.get(w) ?? 0) + 1);
for (const [w, n] of counts) if (n >= MIN_CORPUS_COUNT) attested.add(w);
for (const w of INCLUDED) attested.add(w);

/** "hòa" ⇄ "hoà", "khỏe" ⇄ "khoẻ", "thụy" ⇄ "thuỵ"; not after "q", whose
 * "u" belongs to the onset. */
function moveTone(word: string): string | undefined {
  const nfd = word.normalize("NFD");
  const tone = [...nfd].find((ch) => TONES.includes(ch));
  if (!tone) return undefined;
  const base = nfd.replace(tone, "").normalize("NFC");
  const m = base.match(/^(.*[^q])?(o|u)(a|e|y)$/u);
  if (!m || (m[2] === "o") === (m[3] === "y")) return undefined;
  const pre = m[1] ?? "";
  const onFirst = (pre + m[2] + tone + m[3]).normalize("NFC");
  const onSecond = (pre + m[2] + m[3] + tone).normalize("NFC");
  return word === onFirst ? onSecond : onFirst;
}

/** "lí" ⇄ "lý", "kĩ" ⇄ "kỹ": a single-letter onset with a bare i/y rime. */
function swapIY(word: string): string | undefined {
  const nfd = word.normalize("NFD");
  const m = nfd.match(/^([hklmstv])([iy])(\p{M}?)$/u);
  if (!m) return undefined;
  return (m[1] + (m[2] === "i" ? "y" : "i") + m[3]).normalize("NFC");
}

const syllables = new Set<string>();
for (const w of attested) {
  for (const form of [w, moveTone(w), swapIY(w)]) {
    if (
      form &&
      !EXCLUDED.has(form) &&
      !/^\p{ASCII}+$/u.test(form) &&
      isVietnameseLetters(form) &&
      isVietnameseSpelling(form)
    )
      syllables.add(form);
  }
}

const sorted = [...syllables].sort();
writeFileSync(
  new URL("../worker/vi-lexicon.ts", import.meta.url),
  `/**
 * Generated by scripts/gen-vi-lexicon.ts. Do not edit.
 * Sources: Unihan kVietnamese (Unicode License v3, notice below); Tatoeba
 * (CC BY 2.0 FR, tatoeba.org contributors); Mozilla Common Voice (CC0 1.0);
 * Kinh Thánh 1934 (public domain); C4 (ODC-BY 1.0, Allen Institute for AI).
 *
 * UNICODE LICENSE V3. COPYRIGHT AND PERMISSION NOTICE
 * Copyright © 1991-2026 Unicode, Inc.
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of data files and any associated documentation (the "Data Files") or
 * software and any associated documentation (the "Software") to deal in the
 * Data Files or Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, and/or sell
 * copies of the Data Files or Software, and to permit persons to whom the
 * Data Files or Software are furnished to do so, provided that either (a)
 * this copyright and permission notice appear with all copies of the Data
 * Files or Software, or (b) this copyright and permission notice appear in
 * associated Documentation.
 * THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
 * KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
 * THIRD PARTY RIGHTS.
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
 * BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
 * OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
 * WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
 * ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
 * FILES OR SOFTWARE.
 * Except as contained in this notice, the name of a copyright holder shall
 * not be used in advertising or otherwise to promote the sale, use or other
 * dealings in these Data Files or Software without prior written
 * authorization of the copyright holder.
 */
export const VI_MARKED_SYLLABLES: ReadonlySet<string> = new Set(
  "${sorted.join(" ")}".split(
    " "
  )
);
`
);
console.log(`${sorted.length} syllables`);
