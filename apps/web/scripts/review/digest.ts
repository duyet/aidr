/**
 * Scores one TL;DR edition (the `tldr_snapshots` row behind GET /api/public):
 * `bullets_en`, `bullets_vi` and the stories they cite. The automatic rows are
 * pure over plain data; `loadLive` / `loadDate` read the public API and
 * read-only D1 (`wranglerSelect`). No LLM, no writes.
 *
 * Run (cwd: repo root):
 *   pnpm --filter @aidr/web exec tsx scripts/review/digest.ts [--fixture f.json | --date YYYY-MM-DD] [--json out.json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { looksVietnamese } from "../../src/lib/display-title";
import {
  isTitleNearDuplicate,
  normalizeTitleForDedupe,
} from "../../worker/dedupe";
import { primaryItemId } from "../../worker/digest/edition";
import { TLDR_MAX_ITEMS, usefulTldrFloor } from "../../worker/tldr";
import { isEnglishOnlyViTldr } from "../../worker/tldr-lang";
import { draftIssuesByCheck } from "../../worker/translation-draft-check";
import { hasSourceChrome } from "../../worker/translation-terms";
import { wranglerSelect } from "../cf-d1";
import {
  type AutoResult,
  emit,
  type RubricRow,
  SHIP_AT,
  scoreRubric,
} from "./rubric";

export interface DigestBullet {
  text: string;
  item_ids: string[];
}

/** A story as the public API lists it. */
export interface DigestStory {
  id: string;
  url?: string | null;
  title: string;
  title_vi?: string | null;
}

/** The stored item a bullet was written from (D1 `items` + `translations`). */
export interface DigestSource {
  id: string;
  url?: string | null;
  title: string;
  summary?: string | null;
  title_vi?: string | null;
  summary_vi?: string | null;
}

export interface DigestInput {
  date: string;
  bullets_en: DigestBullet[];
  bullets_vi: DigestBullet[];
  stories: DigestStory[];
  sources: DigestSource[];
}

/** The prompt asks for "about 2 sentences or 180-240 characters" (worker/llm.ts,
 * the TL;DR prompt; ALGORITHM.md section 10). The check allows this much slack
 * either side before a bullet counts as a headline or a paragraph. */
export const BULLET_TARGET = { min: 180, max: 240 } as const;
export const BULLET_SLACK = 30;
export const BULLET_BOUNDS = {
  min: BULLET_TARGET.min - BULLET_SLACK,
  max: BULLET_TARGET.max + BULLET_SLACK,
} as const;

export const RUBRIC: RubricRow[] = [
  {
    id: "count",
    points: 1,
    auto: true,
    ask: `1..${TLDR_MAX_ITEMS} bullets per language, and at least usefulTldrFloor(stories) (8 on a normal day)`,
  },
  {
    id: "length",
    points: 1,
    auto: true,
    ask: `every bullet is ${BULLET_BOUNDS.min}-${BULLET_BOUNDS.max} characters (prompt target ${BULLET_TARGET.min}-${BULLET_TARGET.max})`,
  },
  {
    id: "ids",
    points: 1,
    auto: true,
    ask: "every bullet cites item_ids that resolve to a story with a URL",
  },
  {
    id: "dupes",
    points: 1,
    auto: true,
    ask: "no story twice: same item id, same URL, or a near-duplicate headline across bullets",
  },
  {
    id: "parity",
    points: 1,
    auto: true,
    ask: "EN and VI have the same bullet count and the same item_ids in the same order",
  },
  {
    id: "language",
    points: 1,
    auto: true,
    ask: "VI bullets are Vietnamese, EN bullets are not, and neither is a copy of the other or of a headline",
  },
  {
    id: "numbers",
    points: 1,
    auto: true,
    ask: "every number in a bullet is in its source items; VI keeps the magnitude and the decimal comma",
  },
  {
    id: "voice",
    points: 1,
    auto: true,
    ask: "no first person, no page chrome, no [id] citation or emoji in the text",
  },
  {
    id: "lead",
    points: 1,
    ask: "each bullet leads with the news (who did what), then the why; no scene-setting opener",
  },
  {
    id: "facts",
    points: 1,
    ask: "the VI bullet carries the same names, numbers and hedges as the EN bullet with the same ids",
  },
];

type Lang = "en" | "vi";
const LANGS: Lang[] = ["en", "vi"];

const short = (id: string) => id.slice(0, 8);
const label = (lang: Lang, index: number, ids: string[]) =>
  `${lang.toUpperCase()} bullet ${index + 1}${ids[0] ? ` (${short(ids[0])})` : ""}`;

function bulletsOf(input: DigestInput, lang: Lang): DigestBullet[] {
  return lang === "en" ? input.bullets_en : input.bullets_vi;
}

function sourceById(input: DigestInput): Map<string, DigestSource> {
  return new Map(input.sources.map((s) => [s.id, s]));
}

function storyById(input: DigestInput): Map<string, DigestStory> {
  return new Map(input.stories.map((s) => [s.id, s]));
}

/** URL of an id from the stories list, else from the stored item. */
function urlOf(
  id: string,
  stories: Map<string, DigestStory>,
  sources: Map<string, DigestSource>
): string | undefined {
  return stories.get(id)?.url || sources.get(id)?.url || undefined;
}

function titleOf(
  id: string,
  stories: Map<string, DigestStory>,
  sources: Map<string, DigestSource>
): string | undefined {
  return stories.get(id)?.title || sources.get(id)?.title || undefined;
}

// --- numbers -------------------------------------------------------------

const MAGNITUDE_WORDS =
  "nghìn tỷ|ngàn tỷ|trillion|billion|million|thousand|nghìn|ngàn|triệu|tỷ|tỉ|tn|bn|mn";
const NUMBER_RE = new RegExp(
  `(?<![\\p{L}\\p{N}.,])(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)(?:\\s*(${MAGNITUDE_WORDS})(?![\\p{L}])|([tbmkTBMK])(?![\\p{L}])|\\s*(%))?`,
  "giu"
);

function multiplier(unit: string): number {
  const u = unit.toLowerCase();
  if (
    u === "nghìn tỷ" ||
    u === "ngàn tỷ" ||
    u === "trillion" ||
    u === "tn" ||
    u === "t"
  )
    return 1e12;
  if (u === "tỷ" || u === "tỉ" || u === "billion" || u === "bn" || u === "b")
    return 1e9;
  if (u === "triệu" || u === "million" || u === "mn" || u === "m") return 1e6;
  if (u === "nghìn" || u === "ngàn" || u === "thousand" || u === "k")
    return 1e3;
  return 1;
}

/** Values a written number can mean. "1.200" is 1200 in Vietnamese and 1.2 in
 * English, "16,3" is 16.3 in Vietnamese, so both readings count. */
function candidates(raw: string, unit: string | undefined): number[] {
  const factor = unit ? multiplier(unit) : 1;
  const values = new Set<number>();
  const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw);
  if (grouped) values.add(Number(raw.replace(/[.,]/g, "")));
  const separators = raw.match(/[.,]/g)?.length ?? 0;
  if (!grouped || separators === 1) values.add(Number(raw.replace(",", ".")));
  return [...values].map((v) => v * factor);
}

export interface NumberMention {
  text: string;
  values: number[];
}

/** Numbers that need a source: bare single digits ("3 labs", "S-1") are
 * counted from prose and are skipped. */
export function numberMentions(text: string): NumberMention[] {
  const out: NumberMention[] = [];
  for (const m of text.normalize("NFC").matchAll(NUMBER_RE)) {
    const [whole, raw, word, letter, pct] = m;
    const unit = word ?? letter ?? pct;
    if (!unit && /^\d$/.test(raw)) continue;
    out.push({ text: whole.trim(), values: candidates(raw, word ?? letter) });
  }
  return out;
}

const sameValue = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function sourceText(source: DigestSource): string {
  return [source.title, source.summary, source.title_vi, source.summary_vi]
    .filter(Boolean)
    .join("\n");
}

// --- voice ---------------------------------------------------------------

const QUOTED_RE = /["“][^"”]*["”]/g;
const FIRST_PERSON_EN =
  /\b(?:I|I['’](?:m|ve|ll|d)|we|We|we['’](?:re|ve|ll)|[Oo]ur|[Oo]urs|[Mm]y)\b/;
const FIRST_PERSON_VI =
  /(?<![\p{L}])(?:tôi|chúng tôi|chúng ta|của tôi)(?![\p{L}])/iu;
const CITATION_RE = /\[[0-9a-f]{8,}\]/i;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

function voiceIssues(lang: Lang, text: string): string[] {
  const issues: string[] = [];
  const unquoted = text.replace(QUOTED_RE, " ");
  const person = (lang === "en" ? FIRST_PERSON_EN : FIRST_PERSON_VI).exec(
    unquoted
  );
  if (person) issues.push(`first person "${person[0]}"`);
  if (hasSourceChrome(text)) issues.push("source or page chrome in the text");
  if (CITATION_RE.test(text)) issues.push("[id] citation in the text");
  if (EMOJI_RE.test(text)) issues.push("emoji in the text");
  return issues;
}

// --- the automatic rows ---------------------------------------------------

export function autoChecks(input: DigestInput): AutoResult {
  const stories = storyById(input);
  const sources = sourceById(input);
  const result: AutoResult = {
    count: [],
    length: [],
    ids: [],
    dupes: [],
    parity: [],
    language: [],
    numbers: [],
    voice: [],
  };

  const edition = Math.min(input.stories.length, TLDR_MAX_ITEMS);
  const floor = usefulTldrFloor(edition);
  for (const lang of LANGS) {
    const n = bulletsOf(input, lang).length;
    const name = lang.toUpperCase();
    if (n === 0) result.count.push(`${name} has no bullets`);
    else if (n > TLDR_MAX_ITEMS)
      result.count.push(`${name} has ${n} bullets, over ${TLDR_MAX_ITEMS}`);
    else if (n < floor)
      result.count.push(
        `${name} has ${n} bullets, under the floor of ${floor} for ${input.stories.length} stories`
      );
  }

  for (const lang of LANGS) {
    bulletsOf(input, lang).forEach((bullet, i) => {
      const at = label(lang, i, bullet.item_ids);
      const n = bullet.text.length;
      if (n < BULLET_BOUNDS.min || n > BULLET_BOUNDS.max)
        result.length.push(
          `${at} is ${n} characters, outside ${BULLET_BOUNDS.min}-${BULLET_BOUNDS.max}`
        );

      if (bullet.item_ids.length === 0)
        result.ids.push(`${at} cites no item_ids`);
      for (const id of bullet.item_ids) {
        if (!stories.has(id) && !sources.has(id))
          result.ids.push(
            `${at} cites ${short(id)}, which is not in the edition`
          );
        else if (!urlOf(id, stories, sources))
          result.ids.push(`${at} cites ${short(id)}, which has no URL`);
      }

      for (const reason of voiceIssues(lang, bullet.text))
        result.voice.push(`${at}: ${reason}`);
    });
  }

  for (const lang of LANGS) {
    const bullets = bulletsOf(input, lang);
    const seenId = new Map<string, number>();
    const seenUrl = new Map<string, { bullet: number; id: string }>();
    bullets.forEach((bullet, i) => {
      for (const id of new Set(bullet.item_ids)) {
        const first = seenId.get(id);
        if (first !== undefined)
          result.dupes.push(
            `${label(lang, i, bullet.item_ids)} repeats item ${short(id)} from bullet ${first + 1}`
          );
        else seenId.set(id, i);
        const url = urlOf(id, stories, sources);
        const prior = url ? seenUrl.get(url) : undefined;
        if (url && prior && prior.bullet !== i && prior.id !== id)
          result.dupes.push(
            `${label(lang, i, bullet.item_ids)} repeats the URL of ${short(prior.id)} (bullet ${prior.bullet + 1}): ${url}`
          );
        else if (url && !prior) seenUrl.set(url, { bullet: i, id });
      }
    });
    for (let i = 0; i < bullets.length; i++) {
      for (let j = i + 1; j < bullets.length; j++) {
        for (const a of bullets[i].item_ids) {
          for (const b of bullets[j].item_ids) {
            const ta = titleOf(a, stories, sources);
            const tb = titleOf(b, stories, sources);
            if (a !== b && ta && tb && isTitleNearDuplicate(ta, tb))
              result.dupes.push(
                `${lang.toUpperCase()} bullets ${i + 1} and ${j + 1} cover one story: "${ta}" ~ "${tb}"`
              );
          }
        }
      }
    }
  }

  const { bullets_en: en, bullets_vi: vi } = input;
  if (en.length !== vi.length)
    result.parity.push(`EN has ${en.length} bullets, VI has ${vi.length}`);
  for (let i = 0; i < Math.min(en.length, vi.length); i++) {
    if (en[i].item_ids.join(",") !== vi[i].item_ids.join(","))
      result.parity.push(
        `bullet ${i + 1}: EN cites [${en[i].item_ids.map(short).join(", ")}], VI cites [${vi[i].item_ids.map(short).join(", ")}]`
      );
  }

  if (vi.length > 0 && isEnglishOnlyViTldr(vi))
    result.language.push(
      "VI has no Vietnamese text at all (language fallback)"
    );
  en.forEach((bullet, i) => {
    if (looksVietnamese(bullet.text))
      result.language.push(
        `${label("en", i, bullet.item_ids)} contains Vietnamese diacritics`
      );
  });
  vi.forEach((bullet, i) => {
    const at = label("vi", i, bullet.item_ids);
    if (!looksVietnamese(bullet.text))
      result.language.push(`${at} is not Vietnamese`);
    if (en[i] && bullet.text.trim() === en[i].text.trim())
      result.language.push(`${at} is a copy of the EN bullet`);
    for (const id of bullet.item_ids) {
      const titles = [
        titleOf(id, stories, sources),
        stories.get(id)?.title_vi ?? sources.get(id)?.title_vi,
      ];
      const same = titles.find(
        (t) =>
          t &&
          normalizeTitleForDedupe(t) === normalizeTitleForDedupe(bullet.text)
      );
      if (same)
        result.language.push(`${at} is the headline "${same}", not a digest`);
    }
  });

  for (const lang of LANGS) {
    bulletsOf(input, lang).forEach((bullet, i) => {
      const cited = bullet.item_ids
        .map((id) => sources.get(id))
        .filter((s): s is DigestSource => Boolean(s));
      if (cited.length === 0) return;
      const at = label(lang, i, bullet.item_ids);
      const pool = cited.flatMap((s) => numberMentions(sourceText(s)));
      const known = pool.flatMap((m) => m.values);
      for (const mention of numberMentions(bullet.text)) {
        const found = mention.values.some((v) =>
          known.some((k) => sameValue(v, k))
        );
        if (!found)
          result.numbers.push(
            `${at}: "${mention.text}" is not in its source items`
          );
      }
      if (lang === "vi") {
        const found = draftIssuesByCheck(
          {
            title: cited.map((s) => s.title).join("\n"),
            summary: cited.map((s) => s.summary ?? "").join("\n"),
          },
          { title: "", summary: bullet.text },
          [],
          false
        );
        for (const issue of [...found.magnitude, ...found.decimal])
          result.numbers.push(`${at}: ${issue}`);
      }
    });
  }

  return result;
}

// --- loading ---------------------------------------------------------------

function toBullets(raw: unknown): DigestBullet[] {
  const list: unknown = typeof raw === "string" && raw ? JSON.parse(raw) : raw;
  if (!Array.isArray(list)) return [];
  return list.map((entry) => {
    const b = (typeof entry === "string" ? { text: entry } : entry) as {
      text?: unknown;
      item_id?: string;
      item_ids?: unknown;
    };
    const ids = Array.isArray(b.item_ids)
      ? b.item_ids.filter(
          (id): id is string => typeof id === "string" && id !== ""
        )
      : [];
    const first = primaryItemId({
      text: "",
      item_id: b.item_id,
      item_ids: ids,
    });
    return {
      text: String(b.text ?? ""),
      item_ids: ids.length > 0 ? ids : first ? [first] : [],
    };
  });
}

const HEX_ID = /^[0-9a-f]{8,64}$/;

/** Stored items for the cited ids, read-only. */
export function loadSources(ids: string[]): DigestSource[] {
  const unique = [...new Set(ids)].filter((id) => HEX_ID.test(id));
  if (unique.length === 0) return [];
  const list = unique.map((id) => `'${id}'`).join(",");
  const rows = wranglerSelect(
    `SELECT i.id, i.url, i.title, i.summary, tr.title AS title_vi, tr.summary AS summary_vi FROM items i LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi' WHERE i.id IN (${list})`
  );
  return rows.map((r) => ({
    id: String(r.id),
    url: (r.url as string | null) ?? null,
    title: String(r.title ?? ""),
    summary: (r.summary as string | null) ?? null,
    title_vi: (r.title_vi as string | null) ?? null,
    summary_vi: (r.summary_vi as string | null) ?? null,
  }));
}

interface PublicPayload {
  tldr: { date: string; bullets_en: unknown; bullets_vi: unknown };
  stories: DigestStory[];
}

async function fetchPublic(lang: Lang): Promise<PublicPayload> {
  const res = await fetch(`https://aidr.today/api/public?lang=${lang}`);
  if (!res.ok)
    throw new Error(`GET /api/public?lang=${lang} answered ${res.status}`);
  return (await res.json()) as PublicPayload;
}

const idsOf = (bullets: DigestBullet[]) => bullets.flatMap((b) => b.item_ids);

/** Today's edition as the public API serves it, plus the stored items. */
export async function loadLive(): Promise<DigestInput> {
  const [en, vi] = await Promise.all([fetchPublic("en"), fetchPublic("vi")]);
  const bullets_en = toBullets(en.tldr.bullets_en);
  const bullets_vi = toBullets(vi.tldr.bullets_vi);
  const viTitles = new Map(vi.stories.map((s) => [s.id, s.title_vi]));
  return {
    date: en.tldr.date,
    bullets_en,
    bullets_vi,
    stories: en.stories.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      title_vi: s.title_vi ?? viTitles.get(s.id) ?? null,
    })),
    sources: loadSources([...idsOf(bullets_en), ...idsOf(bullets_vi)]),
  };
}

/** A stored edition by its ICT date key. Stories are the cited items. */
export function loadDate(date: string): DigestInput {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad --date ${date}`);
  const rows = wranglerSelect(
    `SELECT bullets_en, bullets_vi FROM tldr_snapshots WHERE date = '${date}'`
  );
  if (rows.length === 0) throw new Error(`no tldr_snapshots row for ${date}`);
  const bullets_en = toBullets(rows[0].bullets_en);
  const bullets_vi = toBullets(rows[0].bullets_vi);
  const sources = loadSources([...idsOf(bullets_en), ...idsOf(bullets_vi)]);
  return {
    date,
    bullets_en,
    bullets_vi,
    stories: sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      title_vi: s.title_vi,
    })),
    sources,
  };
}

export function scoreDigest(input: DigestInput) {
  return scoreRubric(`digest ${input.date}`, RUBRIC, autoChecks(input));
}

async function main(argv: readonly string[]): Promise<void> {
  const flag = (name: string) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const fixture = flag("--fixture");
  const date = flag("--date");
  const input = fixture
    ? (JSON.parse(readFileSync(fixture, "utf8")) as DigestInput)
    : date
      ? loadDate(date)
      : await loadLive();
  const report = scoreDigest(input);
  emit([report], argv);
  if (report.earned + report.open < SHIP_AT) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
