#!/usr/bin/env node
// Vietnamese subtitles for the English cut (the `visub` cut in lang.mjs): translate the English captions.srt
// into captions.visub.json + captions.visub.srt, one Vietnamese cue per English cue at the same times.
// Cues are 1-4 word fragments, so whole sentences (consecutive cues up to . ! ?) are translated and the
// Vietnamese is split back over the sentence's cues in proportion to the English text. The YouTube title from
// script.json is translated in the same call (the Vietnamese Telegram caption).
// Model: the auto-script.mjs chain through anyrouter (ANYROUTER_API_KEY, ANYROUTER_VIDEO_MODEL); the house style
// is read from the Worker (VI_STYLE and RULES_OVERVIEW in apps/web/worker/llm.ts), never copied here.
// An answer is checked (same line count, no empty or untranslated line, every number kept, AI;DR and aidr.today
// kept, the text lint) and the next model is tried; no key or no valid answer exits 1.
// The json is the cache: a rerun with the same English cues reuses it (--force translates again).
// Usage: node scripts/visub.mjs <date> [--force]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODELS, complete } from "./auto-script.mjs";
import { lintText } from "./gate.mjs";
import { cutFor } from "./lang.mjs";
import { envVar } from "./telegram-video.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER = resolve(ROOT, "../../apps/web/worker");

/** SRT text → [{ start, end, text }] with the timestamps kept as written. */
export function parseSrt(text) {
  return text
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const at = lines.findIndex((l) => l.includes("-->"));
      if (at < 0) throw new Error(`SRT block without a time line: ${block.slice(0, 60)}`);
      const [start, end] = lines[at].split("-->").map((s) => s.trim());
      return { start, end, text: lines.slice(at + 1).join(" ").trim() };
    });
}

export const formatSrt = (cues) => cues.map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text}\n`).join("\n");

/** Consecutive cues up to one that ends a sentence: [{ cues: [index], en }]. */
export function sentences(cues) {
  const out = [];
  let cur = [];
  cues.forEach((c, i) => {
    cur.push(i);
    if (/[.!?]["'”’)]*$/.test(c.text) || i === cues.length - 1) {
      out.push({ cues: cur, en: cur.map((k) => cues[k].text).join(" ") });
      cur = [];
    }
  });
  return out;
}

/** Split a translated sentence over its cues in proportion to the English cue lengths; every cue gets a word.
 *  A cut within two words of a comma or other clause mark moves to it: Vietnamese words are several
 *  space-separated syllables, so a blind cut splits words such as "bản | tin". */
export function splitAcross(vi, enTexts) {
  const words = vi.trim().split(/\s+/).filter(Boolean);
  const n = enTexts.length;
  if (n === 1) return [words.join(" ")];
  // Fewer words than cues (rare): each cue shows the whole line rather than an empty one.
  if (words.length < n) return enTexts.map(() => words.join(" "));
  const weights = enTexts.map((t) => Math.max(1, t.length));
  const total = weights.reduce((a, b) => a + b, 0);
  const out = [];
  let from = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    acc += weights[k];
    let to = k === n - 1 ? words.length : Math.round((words.length * acc) / total);
    const lo = from + 1;
    const hi = words.length - (n - 1 - k);
    to = Math.min(Math.max(to, lo), hi);
    if (k < n - 1) {
      const marks = [0, -1, 1, -2, 2].map((d) => to + d).filter((c) => c >= lo && c <= hi && /[,.;:!?]$/.test(words[c - 1]));
      if (marks.length) to = marks[0];
    }
    out.push(words.slice(from, to).join(" "));
    from = to;
  }
  return out;
}

/** Word timings for a burned cue: the words share [start, end] in proportion to their length. */
export function spreadWords(text, start, end) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = start;
  return words.map((w, k) => {
    const s = t;
    t += ((end - start) * weights[k]) / total;
    return { text: w, s, e: t };
  });
}

/** Why a cache does not belong to these English cues (null = it does). Times and English text must match. */
export function subsMismatch(cached, enCues) {
  if (!Array.isArray(cached)) return "no cues";
  if (cached.length !== enCues.length) return `${cached.length} cached cues, ${enCues.length} in the English captions`;
  const i = enCues.findIndex((c, k) => cached[k].start !== c.start || cached[k].end !== c.end || cached[k].en !== c.text);
  return i < 0 ? null : `cue ${i + 1} differs`;
}

/** The Worker's Vietnamese house style (VI_STYLE with its KEEP_ENGLISH_PROSE, and RULES_OVERVIEW), read from source. */
export function houseStyle(workerDir = WORKER) {
  const llm = readFileSync(join(workerDir, "llm.ts"), "utf8");
  const terms = readFileSync(join(workerDir, "translation-terms.ts"), "utf8");
  const style = llm.match(/^const VI_STYLE = `([\s\S]*?)`;$/m)?.[1];
  const overview = llm.match(/^export const RULES_OVERVIEW = `([\s\S]*?)`;$/m)?.[1];
  const prose = terms.match(/^export const KEEP_ENGLISH_PROSE =\s*"([^"]+)";/m)?.[1];
  if (!style || !overview || !prose) throw new Error("cannot read VI_STYLE / RULES_OVERVIEW / KEEP_ENGLISH_PROSE from apps/web/worker");
  const filled = style.replace(/\$\{KEEP_ENGLISH_PROSE\}/g, prose);
  if (filled.includes("${")) throw new Error("VI_STYLE has an interpolation visub.mjs does not know");
  return { style: filled, overview };
}

export function promptFor(lines, title, style = houseStyle()) {
  return [
    {
      role: "system",
      content: `${style.style}\n\n${style.overview}\n\nNow you write Vietnamese subtitles for the AI;DR Daily Brief, an English-language TV news video. Viewers hear the English anchors and read your line at the same time, so each line is short spoken Vietnamese that says what the English line says, in the same order. Keep every number in digits (Vietnamese press style for magnitudes: "60 tỷ USD", "678.000", "44%"), and keep names, products, companies and labels such as H1, Q3 or GPT-5 as written. Keep "AI;DR" and "aidr.today" exactly. Answer with one JSON object only.`,
    },
    {
      role: "user",
      content: `Translate each line. Return {"title": "<the title in Vietnamese>", "lines": [<exactly ${lines.length} strings, line i translates line i>]}.\n\n${JSON.stringify({ title: title ?? "", lines }, null, 1)}`,
    },
  ];
}

const digits = (t) => (String(t ?? "").match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
const flat = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Problems with one translated line (empty = fine). */
export function lineProblems(label, en, vi) {
  if (typeof vi !== "string" || !vi.trim()) return [`${label}: empty`];
  const p = [];
  const have = new Set(digits(vi));
  for (const n of digits(en)) if (!have.has(n)) p.push(`${label}: number ${n} is missing`);
  for (const keep of ["AI;DR", "aidr.today"]) if (en.includes(keep) && !vi.includes(keep)) p.push(`${label}: "${keep}" is missing`);
  if (en.split(/\s+/).length >= 3 && flat(en) === flat(vi)) p.push(`${label}: not translated`);
  p.push(...lintText(label, vi));
  return p;
}

/** Parse and check one model answer. Returns { title, lines, problems }. */
export function checkAnswer(text, lines, title) {
  const json = JSON.parse(text.replace(/^[\s\S]*?(\{)/, "$1").replace(/\}[^}]*$/, "}"));
  const out = Array.isArray(json.lines) ? json.lines.map((l) => (typeof l === "string" ? l.trim() : l)) : [];
  if (out.length !== lines.length) return { problems: [`${out.length} lines for ${lines.length}`] };
  const problems = lines.flatMap((en, i) => lineProblems(`line ${i + 1}`, en, out[i]));
  const viTitle = typeof json.title === "string" ? json.title.trim() : "";
  if (title) problems.push(...lineProblems("title", title, viTitle));
  return { title: title ? viTitle : null, lines: out, problems };
}

/**
 * Translate English cues. `llm(model, messages)` returns the raw model text (injected for tests).
 * Returns { model, title, cues: [{ start, end, en, vi }] }; throws when no model gives a valid answer.
 */
export async function translateCues({ cues, title, models, llm, style, log = console.log }) {
  if (!models.length) throw new Error("no model to translate with");
  const groups = sentences(cues);
  const lines = groups.map((g) => g.en);
  const messages = promptFor(lines, title, style);
  const tried = [];
  for (const model of models) {
    try {
      const a = checkAnswer(await llm(model, messages), lines, title);
      if (!a.problems.length) {
        const vi = new Array(cues.length);
        groups.forEach((g, i) => {
          splitAcross(a.lines[i], g.cues.map((k) => cues[k].text)).forEach((t, j) => {
            vi[g.cues[j]] = t;
          });
        });
        return { model, title: a.title, cues: cues.map((c, i) => ({ start: c.start, end: c.end, en: c.text, vi: vi[i] })) };
      }
      tried.push(`${model}: ${a.problems.slice(0, 4).join("; ")}`);
    } catch (e) {
      tried.push(`${model}: ${e.message}`);
    }
    log(`! ${tried.at(-1)}`);
  }
  throw new Error(`no valid Vietnamese subtitles:\n  ${tried.join("\n  ")}`);
}

// --- CLI -----------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const date = argv[0];
  if (!date) throw new Error("usage: visub.mjs <date> [--force]");
  const cut = cutFor("visub");
  const dir = join(ROOT, "editions", date);
  const srt = join(dir, cutFor("en").captions);
  if (!existsSync(srt)) throw new Error(`${srt} is missing: build the English cut first`);
  const cues = parseSrt(readFileSync(srt, "utf8"));
  const jsonPath = join(dir, cut.subs.json);
  const cached = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, "utf8")) : null;
  let subs = cached;
  if (argv.includes("--force") || !cached || subsMismatch(cached.cues, cues)) {
    if (cached && !argv.includes("--force")) console.log(`  ${cut.subs.json}: ${subsMismatch(cached.cues, cues)}; translating again`);
    const apiKey = envVar("ANYROUTER_API_KEY");
    if (!apiKey) throw new Error("ANYROUTER_API_KEY is not set: the visub cut needs a model to translate its captions");
    const models = (envVar("ANYROUTER_VIDEO_MODEL") ?? DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean);
    const baseUrl = envVar("ANYROUTER_BASE_URL") ?? "https://anyrouter.dev/api/v1";
    const script = JSON.parse(readFileSync(join(dir, "script.json"), "utf8"));
    const out = await translateCues({
      cues,
      title: script.post?.youtubeTitle ?? null,
      models,
      llm: (model, messages) => complete({ model, messages, apiKey, baseUrl }),
    });
    subs = { lang: "vi", model: out.model, at: new Date().toISOString(), title: out.title, cues: out.cues };
    writeFileSync(jsonPath, `${JSON.stringify(subs, null, 2)}\n`);
    console.log(`✓ editions/${date}/${cut.subs.json}: ${cues.length} cues from ${out.model}`);
  } else console.log(`= editions/${date}/${cut.subs.json}: cached (${subs.model}); --force to translate again`);
  writeFileSync(join(dir, cut.subs.srt), formatSrt(subs.cues.map((c) => ({ start: c.start, end: c.end, text: c.vi }))));
  console.log(`✓ editions/${date}/${cut.subs.srt}`);
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) await main();
