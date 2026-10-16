#!/usr/bin/env node
// Vietnamese subtitles for the English cut (the `visub` cut in lang.mjs): translate the English captions.srt
// into captions.visub.json + captions.visub.srt, one Vietnamese cue per English cue at the same times.
// Cues are 1-4 word fragments, so whole sentences (consecutive cues up to . ! ?) are translated and the
// Vietnamese is split back over the sentence's cues in proportion to the English text. The YouTube title from
// script.json is translated in the same call (the Vietnamese Telegram caption); a title over YouTube's 100 characters
// is asked for once more, shorter, then cut to whole clauses (else "Bản tin AI;DR | <date>"), and never discards the lines.
// Model: the auto-script.mjs chain through anyrouter (videoModels: a key from local-llm-key.mjs, ANYROUTER_VIDEO_MODEL); the house style
// is read from the Worker (VI_STYLE and RULES_OVERVIEW in apps/web/worker/llm.ts), never copied here.
// An answer is checked (same line count, no empty or untranslated line, every number kept, AI;DR and aidr.today
// kept, the text lint) and the next model is tried; no key or no valid answer exits 1.
// The json is the cache: a rerun with the same English cues reuses it, and the same cue texts at new times (a
// re-voiced cut) are retimed without a model call (--force translates again).
// --youtube writes youtube.visub.json instead: the Vietnamese YouTube title (the translated one above), description
// and tags, from the English 16:9 description in posts.md. Each line is translated alone and cached by its text,
// so moved chapter times are not translated again; a line of hashtags stays that many hashtags.
// Usage: node scripts/visub.mjs <date> [--youtube] [--force]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { complete, videoModels } from "./auto-script.mjs";
import { lintText } from "./gate.mjs";
import { cutFor } from "./lang.mjs";
import { requireLlmKey } from "./local-llm-key.mjs";
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
      if (at < 0)
        throw new Error(`SRT block without a time line: ${block.slice(0, 60)}`);
      const [start, end] = lines[at].split("-->").map((s) => s.trim());
      return {
        start,
        end,
        text: lines
          .slice(at + 1)
          .join(" ")
          .trim(),
      };
    });
}

export const formatSrt = (cues) =>
  cues
    .map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text}\n`)
    .join("\n");

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
    let to =
      k === n - 1 ? words.length : Math.round((words.length * acc) / total);
    const lo = from + 1;
    const hi = words.length - (n - 1 - k);
    to = Math.min(Math.max(to, lo), hi);
    if (k < n - 1) {
      const marks = [0, -1, 1, -2, 2]
        .map((d) => to + d)
        .filter((c) => c >= lo && c <= hi && /[,.;:!?]$/.test(words[c - 1]));
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
  if (cached.length !== enCues.length)
    return `${cached.length} cached cues, ${enCues.length} in the English captions`;
  const i = enCues.findIndex(
    (c, k) =>
      cached[k].start !== c.start ||
      cached[k].end !== c.end ||
      cached[k].en !== c.text
  );
  return i < 0 ? null : `cue ${i + 1} differs`;
}

/** A cache moved onto new cue times when only the times changed (same cues, same English text), else null.
 *  A re-voiced cut (a fresh CI runner keeps no voice files) times the same script differently. */
export function retime(cached, enCues) {
  if (
    !Array.isArray(cached) ||
    cached.length !== enCues.length ||
    cached.some((c, k) => c.en !== enCues[k].text)
  )
    return null;
  return cached.map((c, k) => ({
    ...c,
    start: enCues[k].start,
    end: enCues[k].end,
  }));
}

/** The Worker's Vietnamese house style (VI_STYLE with its KEEP_ENGLISH_PROSE, and RULES_OVERVIEW), read from source. */
export function houseStyle(workerDir = WORKER) {
  const llm = readFileSync(join(workerDir, "llm.ts"), "utf8");
  const terms = readFileSync(join(workerDir, "translation-terms.ts"), "utf8");
  const style = llm.match(/^const VI_STYLE = `([\s\S]*?)`;$/m)?.[1];
  const overview = llm.match(
    /^export const RULES_OVERVIEW = `([\s\S]*?)`;$/m
  )?.[1];
  const prose = terms.match(
    /^export const KEEP_ENGLISH_PROSE =\s*"([^"]+)";/m
  )?.[1];
  if (!style || !overview || !prose)
    throw new Error(
      "cannot read VI_STYLE / RULES_OVERVIEW / KEEP_ENGLISH_PROSE from apps/web/worker"
    );
  const filled = style.replace(/\$\{KEEP_ENGLISH_PROSE\}/g, prose);
  if (filled.includes("${"))
    throw new Error("VI_STYLE has an interpolation visub.mjs does not know");
  return { style: filled, overview };
}

// YouTube rejects a longer title; the same title heads the Vietnamese day page and Telegram caption.
const TITLE_MAX = 100;
const chars = (t) => [...t.normalize("NFC")].length;

export function promptFor(lines, title, style = houseStyle()) {
  return [
    {
      role: "system",
      content: `${style.style}\n\n${style.overview}\n\nNow you write Vietnamese subtitles for the AI;DR Daily Brief, an English-language TV news video. Viewers hear the English anchors and read your line at the same time, so each line is short spoken Vietnamese that says what the English line says, in the same order. Keep every number in digits (Vietnamese press style for magnitudes: "60 tỷ USD", "678.000", "44%"), and keep names, products, companies and labels such as H1, Q3 or GPT-5 as written. Keep "AI;DR" and "aidr.today" exactly. Answer with one JSON object only.`,
    },
    {
      role: "user",
      content: `Translate each line. Return {"title": "<the title in Vietnamese, at most ${TITLE_MAX} characters>", "lines": [<exactly ${lines.length} strings, line i translates line i>]}.\n\n${JSON.stringify({ title: title ?? "", lines }, null, 1)}`,
    },
  ];
}

const digits = (t) =>
  (String(t ?? "").match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) =>
    n.replace(/[.,]/g, "")
  );
const flat = (t) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const KEEP = ["AI;DR", "aidr.today"];

/** Problems with one translated line (empty = fine). */
export function lineProblems(label, en, vi) {
  if (typeof vi !== "string" || !vi.trim()) return [`${label}: empty`];
  const p = [];
  const have = new Set(digits(vi));
  for (const n of digits(en))
    if (!have.has(n)) p.push(`${label}: number ${n} is missing`);
  for (const keep of KEEP)
    if (en.includes(keep) && !vi.includes(keep))
      p.push(`${label}: "${keep}" is missing`);
  if (en.split(/\s+/).length >= 3 && flat(en) === flat(vi))
    p.push(`${label}: not translated`);
  p.push(...lintText(label, vi));
  return p;
}

const parseAnswer = (text) =>
  JSON.parse(text.replace(/^[\s\S]*?(\{)/, "$1").replace(/\}[^}]*$/, "}"));

/** Parse and check one model answer (`check` judges each line). Returns { title, lines, problems }.
 *  A title over TITLE_MAX is not a problem here: fitTitle shortens it without discarding the lines. */
export function checkAnswer(text, lines, title, check = lineProblems) {
  const json = parseAnswer(text);
  const out = Array.isArray(json.lines)
    ? json.lines.map((l) => (typeof l === "string" ? l.trim() : l))
    : [];
  if (out.length !== lines.length)
    return { problems: [`${out.length} lines for ${lines.length}`] };
  const problems = lines.flatMap((en, i) => check(`line ${i + 1}`, en, out[i]));
  const viTitle = typeof json.title === "string" ? json.title.trim() : "";
  if (title) problems.push(...lineProblems("title", title, viTitle));
  return { title: title ? viTitle : null, lines: out, problems };
}

/** A translated title's problems, its length included. */
const titleProblems = (en, vi) => [
  ...lineProblems("title", en, vi),
  ...(chars(vi) > TITLE_MAX
    ? [`title: ${chars(vi)} characters, over ${TITLE_MAX}`]
    : []),
];

// A clause starts at a list separator ("…, B", "… và B", "…, cùng B"). Not right after a number or a magnitude word:
// in "60 tỷ và 852 tỷ USD" the unit after the separator belongs to both.
const CLAUSE = /[,;] (?:và|cùng) |[,;] | (?:và|cùng|&) /gu;
const SHARED_UNIT = /\d\S*$|(?:^|\s)(?:tỷ|triệu|nghìn|ngàn)$/u;

/** `title` (NFC) as its clauses and its date part, the part after its last " | " or " — " when that is at most half
 *  of TITLE_MAX: "A, B và C | date" → { clauses: ["A", ", B", " và C"], tail: " | date" }. */
function titleParts(title) {
  const t = title.normalize("NFC").trim();
  const m = t.match(/^(.*\S)(\s+[|—–-]\s+.*)$/);
  const tail = m && chars(m[2]) <= TITLE_MAX / 2 ? m[2] : "";
  const head = tail ? m[1] : t;
  const clauses = [];
  let from = 0;
  for (const { index } of head.matchAll(CLAUSE)) {
    if (SHARED_UNIT.test(head.slice(from, index))) continue;
    clauses.push(head.slice(from, index));
    from = index;
  }
  clauses.push(head.slice(from));
  return { clauses, tail };
}

/** The shortenings of `vi` that drop whole clauses from the end, longest first: each keeps the clauses before it, so a
 *  number keeps its subject, verb and unit or goes with them, and the date part is kept. */
function clauseCuts(vi) {
  const { clauses, tail } = titleParts(vi);
  if (!tail) return [];
  return clauses
    .slice(1)
    .map(
      (_, i) => `${clauses.slice(0, clauses.length - 1 - i).join("")}…${tail}`
    );
}

/** Problems with `cut` as a shortening of the checked title `vi` (empty = fine). It must be within TITLE_MAX and
 *  drop only whole clauses from the end: a number that stays keeps its clause, one that goes takes its clause with
 *  it, so the title says less but nothing false. AI;DR and aidr.today stay. */
export function cutProblems(vi, cut) {
  const p = [];
  if (chars(cut) > TITLE_MAX)
    p.push(`title: ${chars(cut)} characters, over ${TITLE_MAX}`);
  if (!clauseCuts(vi).includes(cut))
    p.push("title: not whole clauses from the start of the title and its date");
  for (const keep of KEEP)
    if (vi.includes(keep) && !cut.includes(keep))
      p.push(`title: "${keep}" is missing`);
  return p;
}

function titlePromptFor(en, vi, style = houseStyle()) {
  return [
    {
      role: "system",
      content: `${style.style}\n\nNow you shorten the Vietnamese YouTube title of the AI;DR Daily Brief, an English-language news video. Keep its numbers, names and date. Answer with one JSON object only.`,
    },
    {
      role: "user",
      content: `This Vietnamese title is ${chars(vi)} characters; YouTube allows at most ${TITLE_MAX}. Rewrite it in at most ${TITLE_MAX} characters. Return {"title": "<the shorter Vietnamese title>"}.\n\n${JSON.stringify({ english: en, vietnamese: vi }, null, 1)}`,
    },
  ];
}

/** A translated title within TITLE_MAX. A longer one goes back to the model that wrote it, once, with the limit and
 *  its length. A retry that fails or is still long gives way to the longest clause cut (cutProblems) that fits, else to
 *  "Bản tin AI;DR" and the date: the title may say less, never something false. The lines already passed and are kept. */
async function fitTitle({ en, vi, model, llm, style, log }) {
  if (chars(vi) <= TITLE_MAX) return vi.normalize("NFC");
  log(
    `! ${model}: title is ${chars(vi)} characters, over ${TITLE_MAX}; asking for a shorter one`
  );
  try {
    const t = String(
      parseAnswer(await llm(model, titlePromptFor(en, vi, style))).title ?? ""
    ).trim();
    const problems = titleProblems(en, t);
    if (!problems.length) return t.normalize("NFC");
    log(`! ${model}: ${problems.join("; ")}`);
  } catch (e) {
    log(`! ${model}: ${e.message}`);
  }
  const cut = clauseCuts(vi).find((c) => !cutProblems(vi, c).length);
  if (cut) {
    log(`! title cut to whole clauses: ${cut}`);
    return cut;
  }
  const fixed = `Bản tin AI;DR${titleParts(vi).tail || titleParts(en).tail}`;
  log(
    `! no cut of the title to whole clauses fits ${TITLE_MAX} characters; posting "${fixed}" for: ${vi.normalize("NFC")}`
  );
  return fixed;
}

/** The first model whose answer `check(text)` passes ({ problems: [] , ...}); throws with what each model got wrong. */
async function firstValid({ what, models, llm, messages, check, log }) {
  if (!models.length) throw new Error("no model to translate with");
  const tried = [];
  for (const model of models) {
    try {
      const a = check(await llm(model, messages));
      if (!a.problems.length) return { model, ...a };
      tried.push(`${model}: ${a.problems.slice(0, 4).join("; ")}`);
    } catch (e) {
      tried.push(`${model}: ${e.message}`);
    }
    log(`! ${tried.at(-1)}`);
  }
  throw new Error(`no valid Vietnamese ${what}:\n  ${tried.join("\n  ")}`);
}

/**
 * Translate English cues. `llm(model, messages)` returns the raw model text (injected for tests).
 * Returns { model, title, cues: [{ start, end, en, vi }] }; throws when no model gives a valid answer.
 */
export async function translateCues({
  cues,
  title,
  models,
  llm,
  style,
  log = console.log,
}) {
  const groups = sentences(cues);
  const lines = groups.map((g) => g.en);
  const a = await firstValid({
    what: "subtitles",
    models,
    llm,
    messages: promptFor(lines, title, style),
    check: (text) => checkAnswer(text, lines, title),
    log,
  });
  const vi = new Array(cues.length);
  groups.forEach((g, i) => {
    splitAcross(
      a.lines[i],
      g.cues.map((k) => cues[k].text)
    ).forEach((t, j) => {
      vi[g.cues[j]] = t;
    });
  });
  return {
    model: a.model,
    title:
      a.title &&
      (await fitTitle({
        en: title,
        vi: a.title,
        model: a.model,
        llm,
        style,
        log,
      })),
    cues: cues.map((c, i) => ({
      start: c.start,
      end: c.end,
      en: c.text,
      vi: vi[i],
    })),
  };
}

// --- YouTube metadata ----------------------------------------------------

/** The English 16:9 title, description and tags from posts.md (the block yt-meta.py --daily reads). */
export function enPost(postsMd) {
  const yt = postsMd
    .match(/<!-- posts:en -->([\s\S]*?)<!-- \/posts:en -->/)?.[1]
    ?.match(/## YouTube \(16:9\)\n([\s\S]*?)(?=\n## |$)/)?.[1];
  const field = (name) =>
    yt
      ?.match(
        new RegExp(
          `\\*\\*${name}\\*\\*[^\\n]*\\n\\n([\\s\\S]*?)(?=\\n\\n\\*\\*|$)`
        )
      )?.[1]
      ?.trim();
  const out = {
    title: field("Title"),
    desc: field("Description"),
    tags: yt?.match(/\*\*Tags:\*\*\s*(.*)/)?.[1]?.trim(),
  };
  if (!out.title || !out.desc || !out.tags)
    throw new Error(
      "posts.md has no English YouTube (16:9) title, description and tags: build the English cut first"
    );
  return out;
}

/** A description line as { head, text, tail }: a chapter time or list number before the text and a link after it
 *  stay as written; only `text` is translated. */
export function splitLine(line) {
  const m = line.match(/^(\d+:\d{2}\s+|\d+\.\s+)?(.*?)(\s*https?:\/\/\S+)?$/);
  return { head: m[1] ?? "", text: m[2], tail: m[3] ?? "" };
}

const HASHTAGS = /^#\S+(\s+#\S+)*$/;

/** Problems with one translated description line: every link kept; a line of hashtags stays that many plain hashtags. */
export function postLineProblems(label, en, vi) {
  if (!HASHTAGS.test(en)) {
    const lost = (en.match(/https?:\/\/\S+/g) ?? []).filter(
      (u) => typeof vi === "string" && !vi.includes(u)
    );
    return [
      ...lineProblems(label, en, vi),
      ...lost.map((u) => `${label}: link ${u} is missing`),
    ];
  }
  const tags = typeof vi === "string" ? vi.trim().split(/\s+/) : [];
  if (tags.length !== en.split(/\s+/).length)
    return [`${label}: ${tags.length} hashtags for ${en.split(/\s+/).length}`];
  const bad = tags.filter((t) => !/^#[A-Za-z0-9_]+$/.test(t));
  return bad.length ? [`${label}: not a plain hashtag: ${bad.join(" ")}`] : [];
}

export function postPromptFor(lines, style = houseStyle()) {
  return [
    {
      role: "system",
      content: `${style.style}\n\n${style.overview}\n\nNow you translate the YouTube description of the AI;DR Daily Brief, an English-language news video, for Vietnamese viewers. Translate each line on its own, in order: a summary line, story headlines, chapter titles and short labels. Keep every number in digits (Vietnamese press style for magnitudes: "60 tỷ USD", "678.000", "44%"), and keep names, products, companies and labels such as H1, Q3 or GPT-5 as written. Keep "AI;DR" and "aidr.today" exactly. A line of hashtags stays that many hashtags, each without spaces, accents or marks, names kept (#Meta stays #Meta). Answer with one JSON object only.`,
    },
    {
      role: "user",
      content: `Translate each line. Return {"lines": [<exactly ${lines.length} strings, line i translates line i>]}.\n\n${JSON.stringify({ lines }, null, 1)}`,
    },
  ];
}

// The Vietnamese-voice cut's extra tags (build.mjs UI vi ytTags).
const VI_TAGS = ["tin AI hôm nay", "trí tuệ nhân tạo"];

/** aidr.today links for Vietnamese readers: the day page and home page with ?lang=vi, as build.mjs writes them. */
export const viLinks = (text) =>
  text.replace(
    /https:\/\/aidr\.today(\/date\/\d{4}-\d{2}-\d{2})?\/?(?=\s|$)/gm,
    (_, day) => `https://aidr.today${day ?? "/"}?lang=vi`
  );

/**
 * Vietnamese YouTube metadata for the visub cut. `en` is enPost(posts.md); `title` the translated title (the
 * Telegram caption), else the English title is translated with the lines. `cached` maps English line texts to
 * Vietnamese; only new texts go to the model (`chain()` → { models, llm }, called only then).
 * Returns { model, lines, title, desc, tags }: lines is the cache for the next run.
 */
export async function translatePost({
  en,
  title,
  cached = {},
  chain,
  style,
  log = console.log,
}) {
  const parts = en.desc.split("\n").map(splitLine);
  const texts = [
    ...new Set([
      ...(title ? [] : [en.title]),
      ...parts.map((p) => p.text).filter((t) => t.trim()),
    ]),
  ];
  const lines = {};
  for (const t of texts) if (Object.hasOwn(cached, t)) lines[t] = cached[t];
  const todo = texts.filter((t) => !Object.hasOwn(lines, t));
  let model = null;
  if (todo.length) {
    const { models, llm } = chain();
    const a = await firstValid({
      what: "YouTube description",
      models,
      llm,
      messages: postPromptFor(todo, style),
      check: (text) =>
        checkAnswer(text, todo, null, (label, enLine, vi) => [
          ...postLineProblems(label, enLine, vi),
          ...(enLine === en.title && [...String(vi)].length > TITLE_MAX
            ? [`${label}: a title over ${TITLE_MAX} characters`]
            : []),
        ]),
      log,
    });
    todo.forEach((t, i) => {
      lines[t] = a.lines[i];
    });
    model = a.model;
  }
  const viTitle = title ?? lines[en.title];
  if ([...viTitle].length > TITLE_MAX)
    throw new Error(
      `the Vietnamese title is over ${TITLE_MAX} characters: ${viTitle}`
    );
  const desc = viLinks(
    parts
      .map((p) => p.head + (p.text.trim() ? lines[p.text] : p.text) + p.tail)
      .join("\n")
  );
  const tags = [
    ...new Set(
      [...en.tags.split(","), ...VI_TAGS].map((t) => t.trim()).filter(Boolean)
    ),
  ].join(", ");
  return { model, lines, title: viTitle, desc, tags };
}

// --- CLI -----------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const date = argv[0];
  if (!date) throw new Error("usage: visub.mjs <date> [--youtube] [--force]");
  const cut = cutFor("visub");
  const dir = join(ROOT, "editions", date);
  const force = argv.includes("--force");
  const chain = () => {
    const apiKey = requireLlmKey();
    const models = videoModels(envVar("ANYROUTER_VIDEO_MODEL"));
    const baseUrl =
      envVar("ANYROUTER_BASE_URL") ?? "https://anyrouter.dev/api/v1";
    return {
      models,
      llm: (model, messages) => complete({ model, messages, apiKey, baseUrl }),
    };
  };
  if (argv.includes("--youtube")) {
    const subsPath = join(dir, cut.subs.json);
    const ytPath = join(dir, cut.subs.youtube);
    const prev =
      existsSync(ytPath) && !force
        ? JSON.parse(readFileSync(ytPath, "utf8"))
        : null;
    const out = await translatePost({
      en: enPost(readFileSync(join(dir, "posts.md"), "utf8")),
      title: existsSync(subsPath)
        ? (JSON.parse(readFileSync(subsPath, "utf8")).title ?? null)
        : null,
      cached: prev?.lines ?? {},
      chain,
    });
    const meta = {
      lang: "vi",
      model: out.model ?? prev?.model,
      at: out.model ? new Date().toISOString() : prev?.at,
      title: out.title,
      desc: out.desc,
      tags: out.tags,
      lines: out.lines,
    };
    writeFileSync(ytPath, `${JSON.stringify(meta, null, 2)}\n`);
    console.log(
      `${out.model ? "✓" : "="} editions/${date}/${cut.subs.youtube}: ${out.model ? `translated with ${out.model}` : "every line cached"}`
    );
    return;
  }
  const srt = join(dir, cutFor("en").captions);
  if (!existsSync(srt))
    throw new Error(`${srt} is missing: build the English cut first`);
  const cues = parseSrt(readFileSync(srt, "utf8"));
  const jsonPath = join(dir, cut.subs.json);
  const cached = existsSync(jsonPath)
    ? JSON.parse(readFileSync(jsonPath, "utf8"))
    : null;
  let subs = cached;
  const moved =
    !force && cached && subsMismatch(cached.cues, cues)
      ? retime(cached.cues, cues)
      : null;
  if (moved) {
    subs = { ...cached, cues: moved };
    writeFileSync(jsonPath, `${JSON.stringify(subs, null, 2)}\n`);
    console.log(
      `= editions/${date}/${cut.subs.json}: same English cues at new times; retimed, not translated again`
    );
  } else if (force || !cached || subsMismatch(cached.cues, cues)) {
    if (cached && !force)
      console.log(
        `  ${cut.subs.json}: ${subsMismatch(cached.cues, cues)}; translating again`
      );
    const { models, llm } = chain();
    const script = JSON.parse(readFileSync(join(dir, "script.json"), "utf8"));
    const out = await translateCues({
      cues,
      title: script.post?.youtubeTitle ?? null,
      models,
      llm,
    });
    subs = {
      lang: "vi",
      model: out.model,
      at: new Date().toISOString(),
      title: out.title,
      cues: out.cues,
    };
    writeFileSync(jsonPath, `${JSON.stringify(subs, null, 2)}\n`);
    console.log(
      `✓ editions/${date}/${cut.subs.json}: ${cues.length} cues from ${out.model}`
    );
  } else
    console.log(
      `= editions/${date}/${cut.subs.json}: cached (${subs.model}); --force to translate again`
    );
  writeFileSync(
    join(dir, cut.subs.srt),
    formatSrt(
      subs.cues.map((c) => ({ start: c.start, end: c.end, text: c.vi }))
    )
  );
  console.log(`✓ editions/${date}/${cut.subs.srt}`);
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) await main();
