#!/usr/bin/env node
// Vietnamese screen text for the visub cut (lang.mjs): the English script's kicker, headline, category, stat,
// statLabel, paper card, intro and outro titles and cover hook, written to screen.visub.json, which build.mjs lays
// over the English script. Voice, statWord, intro.focus, images and layout stay English: the English voice times them.
// A string the edition or the site already has in Vietnamese takes that copy (title → title_vi, text → text_vi,
// category → the Vietnamese mail's CATEGORY_VI in apps/web/worker/mail/render.ts). The rest goes to the visub.mjs
// model chain in the Worker's house style, with the story's title_vi/text_vi as the wording to follow. Each answer is
// checked (the visub.mjs line checks, the *marker* spans, the auto-script.mjs word limits, names the site's
// Vietnamese keeps); a field that fails goes to the next model, and a field no model gets right exits 1.
// The json is the cache: a field whose English is unchanged is never translated again (--force translates all).
// Usage: node scripts/visub-screen.mjs <date> [--force]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { complete, DEFAULT_MODELS, WORD_LIMITS } from "./auto-script.mjs";
import { cutFor } from "./lang.mjs";
import { requireLlmKey } from "./local-llm-key.mjs";
import { envVar } from "./telegram-video.mjs";
import { houseStyle, lineProblems } from "./visub.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const MAIL = resolve(ROOT, "../../apps/web/worker/mail/render.ts");

const STORY_FIELDS = [
  "category",
  "kicker",
  "headline",
  "stat",
  "statLabel",
  "paper.title",
  "paper.abstract",
];
const SHOW_FIELDS = [
  "intro.title",
  "outro.title",
  "outro.follow",
  "thumb.hook",
];

const get = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
function put(o, path, value) {
  const keys = path.split(".");
  keys.slice(0, -1).reduce((v, k) => v[k], o)[keys.at(-1)] = value;
}

/** The screen text a viewer reads, as { key: English }: `s<rank>.<field>` per story, then the show's titles.
 *  A story without its own category shows the edition's. */
export function screenFields(script, edition) {
  const byRank = Object.fromEntries(edition.stories.map((s) => [s.rank, s]));
  const out = {};
  for (const s of script.stories)
    for (const f of STORY_FIELDS) {
      const en =
        f === "category" ? (s.category ?? byRank[s.rank]?.category) : get(s, f);
      if (typeof en === "string" && en.trim()) out[`s${s.rank}.${f}`] = en;
    }
  for (const f of SHOW_FIELDS) {
    const en = get(script, f);
    if (typeof en === "string" && en.trim()) out[f] = en;
  }
  return out;
}

/** The Vietnamese mail's category labels (CATEGORY_VI), read from source. */
export function categoryLabels(file = MAIL) {
  const body = readFileSync(file, "utf8").match(
    /^const CATEGORY_VI: Record<string, string> = \{([\s\S]*?)^\};/m
  )?.[1];
  if (!body) throw new Error(`cannot read CATEGORY_VI from ${file}`);
  return Object.fromEntries(
    [...body.matchAll(/^\s*(?:"([^"]+)"|(\w+)):\s*"([^"]+)",/gm)].map((m) => [
      m[1] ?? m[2],
      m[3],
    ])
  );
}

const storyOf = (key, edition) =>
  edition.stories.find((s) => `s${s.rank}` === key.split(".")[0]);

/** The Vietnamese the edition or the site already has for this English string, else null. */
export function storedVi(key, en, edition, categories) {
  if (key.endsWith(".category") && categories[en]) return categories[en];
  const ed = storyOf(key, edition);
  if (ed && en === ed.title && ed.title_vi) return ed.title_vi;
  if (ed && en === ed.text && ed.text_vi) return ed.text_vi;
  return null;
}

const NAME = /\p{Lu}[\p{L}\p{N}+-]*/gu;
const markers = (t) => [...t.matchAll(/\*([^*]*)\*/g)].map((m) => m[1].trim());

// "100K" may become "100.000" in Vietnamese press style.
const thousands = (t) =>
  t.replace(/(\d+(?:\.\d+)?)K\b/g, (_, n) => String(Number(n) * 1000));
// A label made of names ("Broadcom x Anthropic", "ChatGPT for Mac") may stay as it is.
const onlyNames = (t) => !t.split(/\s+/).some((w) => /^\p{Ll}{4,}/u.test(w));

/** Problems with one translated field (empty = fine). */
export function fieldProblems(key, en, vi, edition) {
  const asIs = typeof vi === "string" && /\d+K\b/.test(vi);
  const p = lineProblems(key, asIs ? en : thousands(en), vi).filter(
    (x) => !(x.endsWith(": not translated") && onlyNames(en))
  );
  if (typeof vi !== "string" || !vi.trim()) return p;
  const field = key.split(".").slice(1).join(".");
  const want = markers(en);
  const have = markers(vi);
  if (
    have.length !== want.length ||
    vi.split("*").length !== en.split("*").length
  )
    p.push(`${key}: ${want.length} *marker* span(s) expected`);
  else if (
    have.some((m) => !m) ||
    (have.length && vi.replace(/\*/g, "").trim() === have.join(" "))
  )
    p.push(`${key}: the marker must cover some words, not none or all`);
  const limit = WORD_LIMITS[field];
  const n = vi.replace(/\*/g, "").trim().split(/\s+/).length;
  if (limit && (n < limit[0] || n > limit[1]))
    p.push(`${key}: ${n} words, ${limit[0]}-${limit[1]} allowed`);
  // A name the site's Vietnamese for this story keeps as written must stay as written.
  const ed = storyOf(key, edition);
  if (ed) {
    const kept = new Set(
      `${ed.title_vi ?? ""} ${ed.text_vi ?? ""}`.match(NAME) ?? []
    );
    for (const name of new Set(en.match(NAME) ?? []))
      if (kept.has(name) && !vi.includes(name))
        p.push(`${key}: "${name}" is missing`);
  }
  return p;
}

const HOW = {
  category: "the story's topic label, one or two words",
  kicker: `who or what, ${WORD_LIMITS.kicker.join("-")} words (each Vietnamese syllable counts as a word)`,
  headline: `the news itself, ${WORD_LIMITS.headline.join("-")} words (each Vietnamese syllable counts as a word); put *stars* around the Vietnamese words that say what the starred English words say`,
  stat: "the giant number or state on screen, 1-4 words; in a giant stat write a magnitude in capitals, as in −20 TỶ USD",
  statLabel: "the small line under the stat, at most 10 words",
  "paper.title": "the title on a typographic card",
  "paper.abstract": "one or two sentences on a typographic card",
  "intro.title": "the opening screen's title",
  "outro.title": "the closing screen's title",
  "outro.follow": "the closing screen's follow line",
  "thumb.hook": "the cover still's hook, 3-7 words",
};

export function promptFor(items, edition, style = houseStyle()) {
  const fields = items.map(({ key, en, fix }) => {
    const ed = storyOf(key, edition);
    const field = ed ? key.split(".").slice(1).join(".") : key;
    const site = ed ? [ed.title_vi, ed.text_vi].filter(Boolean).join(". ") : "";
    return {
      key,
      en,
      what: HOW[field],
      ...(site ? { site_vi: site } : {}),
      ...(fix ? { fix } : {}),
    };
  });
  return [
    {
      role: "system",
      content: `${style.style}\n\n${style.overview}\n\nNow you write the on-screen text of the AI;DR Daily Brief, an English-language TV news video shown with Vietnamese subtitles. Viewers hear English and read Vietnamese, so every label, headline and title on screen is short Vietnamese that says what the English says. "site_vi" is how aidr.today already says the story in Vietnamese: use its wording and terms. Keep every number (Vietnamese press style: "20 triệu USD", "678.000", "44%"), and keep names, products, companies and labels such as H1, Q3 or GPT-5 as written. Keep "AI;DR" and "aidr.today" exactly. A field with "fix" failed these checks on an earlier answer: correct exactly that. Answer with one JSON object only.`,
    },
    {
      role: "user",
      content: `Translate each field's "en" to Vietnamese. Return {"fields": {"<key>": "<Vietnamese>", ...}} with exactly these keys: ${items.map((i) => i.key).join(", ")}.\n\n${JSON.stringify(fields, null, 1)}`,
    },
  ];
}

/**
 * The Vietnamese screen text for an English script. Cached fields with the same English are kept, stored copy is
 * taken as is, and the rest goes to the models in turn, twice over: each call asks only for the fields still
 * missing, with the problems of the last answer for each.
 * `llm(model, messages)` returns the raw model text (injected for tests). Returns { [key]: { en, vi, from } };
 * throws when a field has no valid answer.
 */
export async function translateScreen({
  script,
  edition,
  cached = {},
  categories = categoryLabels(),
  models,
  llm,
  style,
  log = console.log,
}) {
  const out = {};
  const todo = [];
  for (const [key, en] of Object.entries(screenFields(script, edition))) {
    const vi = storedVi(key, en, edition, categories);
    if (vi) out[key] = { en, vi, from: "edition" };
    else if (cached[key]?.en === en && cached[key].from !== "edition")
      out[key] = cached[key];
    else todo.push({ key, en });
  }
  const tried = [];
  const fix = {};
  for (const model of todo.length ? [...models, ...models] : []) {
    const pending = todo.filter((t) => !out[t.key]);
    if (!pending.length) break;
    let bad = [];
    try {
      const text = await llm(
        model,
        promptFor(
          pending.map((t) => ({ ...t, fix: fix[t.key] })),
          edition,
          style
        )
      );
      const answer =
        JSON.parse(text.replace(/^[\s\S]*?(\{)/, "$1").replace(/\}[^}]*$/, "}"))
          .fields ?? {};
      for (const { key, en } of pending) {
        const vi =
          typeof answer[key] === "string" ? answer[key].trim() : answer[key];
        const p = fieldProblems(key, en, vi, edition);
        if (p.length) {
          fix[key] = `${JSON.stringify(vi ?? null)}: ${p.join("; ")}`;
          bad.push(...p);
        } else out[key] = { en, vi, from: model };
      }
    } catch (e) {
      bad = [e.message];
    }
    if (bad.length) {
      tried.push(`${model}: ${bad.slice(0, 4).join("; ")}`);
      log(`! ${tried.at(-1)}`);
    }
  }
  const missing = todo.filter((t) => !out[t.key]).map((t) => t.key);
  if (missing.length)
    throw new Error(
      `no valid Vietnamese screen text for ${missing.join(", ")}:\n  ${tried.join("\n  ") || "no model to translate with (ANYROUTER_API_KEY is not set)"}`
    );
  return out;
}

/**
 * The English script with its screen text in Vietnamese, for build.mjs. Throws when screen.visub.json does not
 * cover the script's current English. The English dateline goes too: the build writes the Vietnamese one.
 */
export function applyScreen(script, edition, fields) {
  const en = screenFields(script, edition);
  const stale = Object.keys(en).find((k) => fields?.[k]?.en !== en[k]);
  if (stale)
    throw new Error(
      `${cutFor("visub").subs.screen} does not match script.json (${stale}): rerun scripts/visub-screen.mjs`
    );
  const out = structuredClone(script);
  delete out.dateline;
  for (const key of Object.keys(en)) {
    const [head, ...rest] = key.split(".");
    const story = /^s\d+$/.test(head)
      ? out.stories.find((s) => `s${s.rank}` === head)
      : null;
    if (story) put(story, rest.join("."), fields[key].vi);
    else put(out, key, fields[key].vi);
  }
  return out;
}

// --- CLI -----------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const date = argv[0];
  if (!date) throw new Error("usage: visub-screen.mjs <date> [--force]");
  const dir = join(ROOT, "editions", date);
  const file = join(dir, cutFor("visub").subs.screen);
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const script = read(join(dir, "script.json"));
  const edition = read(join(dir, "edition.json"));
  const cached =
    !argv.includes("--force") && existsSync(file) ? read(file).fields : {};
  const models = (envVar("ANYROUTER_VIDEO_MODEL") ?? DEFAULT_MODELS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const apiKey = requireLlmKey();
  const baseUrl =
    envVar("ANYROUTER_BASE_URL") ?? "https://anyrouter.dev/api/v1";
  const fields = await translateScreen({
    script,
    edition,
    cached,
    models,
    llm: (model, messages) => complete({ model, messages, apiKey, baseUrl }),
  });
  const fresh = Object.entries(fields).filter(
    ([k, f]) => f.from !== "edition" && f !== cached[k]
  ).length;
  writeFileSync(file, `${JSON.stringify({ lang: "vi", fields }, null, 2)}\n`);
  console.log(
    `✓ editions/${date}/${cutFor("visub").subs.screen}: ${Object.keys(fields).length} fields (${fresh} translated now)`
  );
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) await main();
