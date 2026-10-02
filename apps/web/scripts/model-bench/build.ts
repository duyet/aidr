/**
 * Builds the model-bench datasets from production D1 with read-only SELECTs
 * (`wrangler d1 execute aidr --remote`). One file per step under
 * `scripts/fixtures/bench/<step>.json`.
 *
 * Every case says where its reference label came from:
 *   gold:<source>    a human decision (hand-labelled importance band,
 *                    accepted reader suggestion, active knowledge rule)
 *   silver:<column>  a stored pipeline output; agreement with it measures
 *                    "how close to the current prod model", not quality.
 *
 * No user ids, names, ip hashes or emails are selected.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REVIEW_QUEUE_BUILDERS } from "./build-review-queue";
import { buildDraftRepair } from "./steps-repair";
import { buildRuleExtraction } from "./steps-rules";

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, "../..");
export const benchDir = path.resolve(here, "../fixtures/bench");

export function d1<T>(sql: string): T[] {
  if (!/^\s*(SELECT|WITH)\b/i.test(sql))
    throw new Error("model-bench build only runs SELECTs");
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "aidr",
      "--remote",
      "--json",
      "--command",
      sql,
    ],
    { cwd: webDir, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
  );
  const parsed = JSON.parse(out.slice(out.indexOf("["))) as {
    results: T[];
  }[];
  return parsed[0]?.results ?? [];
}

const parseTags = (raw: string | null): string[] => {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/** Round-robin merge, so `--limit N` still samples every stratum. */
export function interleave<T>(...groups: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < groups.flat().length; i++)
    for (const g of groups) if (i < g.length) out.push(g[i]);
  return out;
}

const ids = (list: string[]) =>
  list.map((id) => `'${id.replace(/'/g, "")}'`).join(",");

export function write(step: string, labelSources: string[], cases: unknown[]) {
  mkdirSync(benchDir, { recursive: true });
  const file = path.join(benchDir, `${step}.json`);
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        step,
        builtAt: new Date().toISOString().slice(0, 10),
        labelSources,
        count: cases.length,
        cases,
      },
      null,
      2
    )}\n`
  );
  console.log(
    `${step}: ${cases.length} cases → ${path.relative(webDir, file)}`
  );
}

interface ItemRow {
  id: string;
  source_id: string;
  title: string;
  summary: string | null;
  status: string;
  llm_relevance: number | null;
  llm_importance: number | null;
  llm_quality: number | null;
  category: string | null;
  tags: string | null;
}

const ITEM_COLS =
  "id, source_id, title, substr(coalesce(summary,''),1,1200) AS summary, status, llm_relevance, llm_importance, llm_quality, category, tags";

/** score + jev share inputs: the 50 hand-banded importance items (gold
 * band) plus rejected and low-relevance published rows (silver relevance). */
function buildScore() {
  const evalItems = JSON.parse(
    readFileSync(path.join(here, "../fixtures/importance-eval.json"), "utf-8")
  ) as { id: string; expectedBand: [number, number] }[];
  const bands = new Map(evalItems.map((e) => [e.id, e.expectedBand]));
  const banded = d1<ItemRow>(
    `SELECT ${ITEM_COLS} FROM items WHERE id IN (${ids([...bands.keys()])})`
  );
  const rejected = d1<ItemRow>(
    `SELECT ${ITEM_COLS} FROM items WHERE status = 'rejected' AND llm_relevance IS NOT NULL ORDER BY fetched_at DESC LIMIT 15`
  );
  // Alternating keeps relevance labels mixed under --limit.
  const cases = interleave(banded, rejected).map((r) => ({
    id: r.id,
    source: r.source_id,
    title: r.title,
    summary: r.summary ?? "",
    current: {
      status: r.status,
      relevance: r.llm_relevance,
      importance: r.llm_importance,
      quality: r.llm_quality,
      category: r.category,
      tags: parseTags(r.tags),
    },
    gold: bands.has(r.id) ? { importanceBand: bands.get(r.id) } : {},
    silver: { relevant: r.status !== "rejected", category: r.category },
    labelSource: bands.has(r.id)
      ? "gold:importance-eval band; silver:items.status/category"
      : "silver:items.status=rejected",
  }));
  write(
    "score",
    [
      "gold:importance-eval.json",
      "silver:items.status",
      "silver:items.category",
    ],
    cases
  );
}

interface KnowledgeRow {
  id: string;
  kind: string;
  source_term: string;
  vi_term: string | null;
  bad_vi: string;
  note: string | null;
  status: string;
}

/** EN→VI: accepted reader suggestions and items the active knowledge rules
 * cover are gold checks; the rest compare with the stored VI (silver). */
function buildTranslateEnVi() {
  const rules = d1<KnowledgeRow>(
    "SELECT id, kind, source_term, vi_term, bad_vi, note, status FROM translation_knowledge WHERE status = 'active'"
  );
  const suggestions = d1<{
    item_id: string;
    field: string;
    suggestion: string;
    applied_text: string | null;
  }>(
    "SELECT item_id, field, suggestion, applied_text FROM translation_suggestions WHERE status = 'accepted'"
  );
  type Row = ItemRow & {
    vi_title: string | null;
    vi_summary: string | null;
    qa_rating: number | null;
  };
  const cols = `i.id, i.source_id, i.title, substr(coalesce(i.summary,''),1,1200) AS summary, t.title AS vi_title, substr(coalesce(t.summary,''),1,1600) AS vi_summary, t.qa_rating`;
  const join =
    "FROM items i JOIN translations t ON t.item_id = i.id AND t.lang = 'vi' AND t.source_lang = 'en'";
  const fromSuggestions = d1<Row>(
    `SELECT ${cols} ${join} WHERE i.id IN (${ids(suggestions.map((s) => s.item_id))})`
  );
  const ruleTerms = rules.map((r) =>
    r.source_term.toLowerCase().replace(/'/g, "")
  );
  const fromRules = ruleTerms.length
    ? d1<Row>(
        `SELECT ${cols} ${join} WHERE i.status = 'published' AND (${ruleTerms
          .map(
            (t) =>
              `lower(i.title || ' ' || coalesce(i.summary,'')) LIKE '%${t}%'`
          )
          .join(" OR ")}) ORDER BY i.published_at DESC LIMIT 12`
      )
    : [];
  const recent = d1<Row>(
    `SELECT ${cols} ${join} WHERE i.status = 'published' AND t.qa_rating >= 0.8 AND length(i.summary) > 80 ORDER BY i.published_at DESC LIMIT 30`
  );
  const seen = new Set<string>();
  const cases = [];
  for (const r of [...fromSuggestions, ...fromRules, ...recent]) {
    if (seen.has(r.id) || cases.length >= 45) continue;
    seen.add(r.id);
    const s = suggestions.find((x) => x.item_id === r.id);
    cases.push({
      id: r.id,
      source: r.source_id,
      title: r.title,
      summary: r.summary ?? "",
      reference: { title: r.vi_title ?? "", summary: r.vi_summary ?? "" },
      qaRating: r.qa_rating,
      gold: s
        ? { readerSuggestion: s.suggestion, appliedText: s.applied_text }
        : {},
      labelSource: s
        ? "gold:translation_suggestions accepted"
        : fromRules.some((x) => x.id === r.id)
          ? "gold:translation_knowledge active rule"
          : "silver:translations.vi qa_rating>=0.8",
    });
  }
  write(
    "translate-en-vi",
    [
      "gold:translation_suggestions",
      "gold:translation_knowledge",
      "silver:translations",
    ],
    cases
  );
  writeFileSync(
    path.join(benchDir, "knowledge-rules.json"),
    `${JSON.stringify(
      rules.map((r) => ({ ...r, bad_vi: r.bad_vi, hits: 0 })),
      null,
      2
    )}\n`
  );
}

/** VI→EN: Vietnamese-source items and the stored English candidate. */
function buildTranslateViEn() {
  const rows = d1<{
    id: string;
    source_id: string;
    title: string;
    summary: string;
    en_title: string;
    en_summary: string;
    qa_rating: number | null;
  }>(
    `SELECT i.id, i.source_id, i.title, substr(coalesce(i.summary,''),1,1200) AS summary, t.title AS en_title, substr(coalesce(t.summary,''),1,1600) AS en_summary, t.qa_rating
     FROM items i JOIN translations t ON t.item_id = i.id AND t.lang = 'en' AND t.source_lang = 'vi'
     WHERE i.source_lang = 'vi' AND t.title IS NOT NULL ORDER BY i.published_at DESC LIMIT 40`
  );
  write(
    "translate-vi-en",
    ["silver:translations.en"],
    rows.map((r) => ({
      id: r.id,
      source: r.source_id,
      title: r.title,
      summary: r.summary,
      reference: { title: r.en_title, summary: r.en_summary },
      qaRating: r.qa_rating,
      labelSource: "silver:translations.en",
    }))
  );
}

/** Review: stored EN→VI pairs the prod reviewer rated high or low. */
function buildReview() {
  const q = (where: string) =>
    d1<{
      id: string;
      title: string;
      summary: string;
      vi_title: string;
      vi_summary: string;
      qa_rating: number;
    }>(
      `SELECT i.id, i.title, substr(coalesce(i.summary,''),1,1200) AS summary, t.title AS vi_title, substr(coalesce(t.summary,''),1,1600) AS vi_summary, t.qa_rating
       FROM items i JOIN translations t ON t.item_id = i.id AND t.lang = 'vi' AND t.source_lang = 'en'
       WHERE ${where} AND t.title IS NOT NULL ORDER BY t.qa_at DESC LIMIT 20`
    );
  const cases = interleave(q("t.qa_rating >= 0.9"), q("t.qa_rating < 0.7")).map(
    (r) => ({
      id: r.id,
      source: { title: r.title, summary: r.summary },
      candidate: { title: r.vi_title, summary: r.vi_summary },
      qaRating: r.qa_rating,
      silver: { passes: r.qa_rating >= 0.7 },
      labelSource: "silver:translations.qa_rating",
    })
  );
  write("review", ["silver:translations.qa_rating"], cases);
}

/** TL;DR: the items each recent edition cited, and the stored bullets. */
function buildTldr() {
  const snaps = d1<{ date: string; bullets_en: string; bullets_vi: string }>(
    "SELECT date, bullets_en, bullets_vi FROM tldr_snapshots WHERE bullets_en IS NOT NULL ORDER BY date DESC LIMIT 20"
  );
  const cases = snaps.map((s) => {
    const en = JSON.parse(s.bullets_en) as {
      text: string;
      item_ids: string[];
    }[];
    const vi = JSON.parse(s.bullets_vi ?? "[]") as {
      text: string;
      item_ids: string[];
    }[];
    const cited = [...new Set(en.flatMap((b) => b.item_ids ?? []))];
    const items = d1<{
      id: string;
      title: string;
      summary: string;
      title_vi: string | null;
    }>(
      `SELECT i.id, i.title, substr(coalesce(i.summary,''),1,600) AS summary, t.title AS title_vi
       FROM items i LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
       WHERE i.id IN (${ids(cited)}) ORDER BY i.rank_score DESC`
    );
    return {
      id: s.date,
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        summary: i.summary,
        ...(i.title_vi ? { title_vi: i.title_vi } : {}),
      })),
      reference: { bullets_en: en, bullets_vi: vi },
      labelSource: "silver:tldr_snapshots (published edition)",
    };
  });
  write("tldr", ["silver:tldr_snapshots"], cases);
}

/** Cluster: a canonical with its merged members (distinct titles, so the
 * merge came from the LLM, not URL dedupe) plus same-window published
 * stories that were kept separate. */
function buildCluster() {
  const canon = d1<{ id: string; title: string; published_at: number }>(
    `SELECT c.id, c.title, c.published_at FROM items c
     WHERE c.status = 'published' AND (SELECT count(*) FROM items m WHERE m.duplicate_of = c.id AND m.status = 'merged' AND lower(m.title) != lower(c.title)) >= 1
     ORDER BY c.published_at DESC LIMIT 30`
  );
  const cases = canon.map((c) => {
    const members = d1<{ title: string; url: string; source_id: string }>(
      `SELECT title, url, source_id FROM items WHERE duplicate_of = '${c.id}' AND status = 'merged' AND lower(title) != lower('${c.title.replace(/'/g, "''")}') LIMIT 3`
    );
    const others = d1<{ title: string; url: string; source_id: string }>(
      `SELECT title, url, source_id FROM items WHERE status = 'published' AND id != '${c.id}' AND published_at BETWEEN ${c.published_at - 43200} AND ${c.published_at + 43200} ORDER BY rank_score DESC LIMIT 3`
    );
    const newItems = [...members, ...others].map((m, i) => ({
      i,
      title: m.title,
      url: m.url,
      source: m.source_id,
    }));
    return {
      id: c.id,
      newItems,
      existing: [{ id: c.id, title: c.title }],
      silver: { sameStory: members.map((_, i) => i) },
      labelSource: "silver:items.duplicate_of",
    };
  });
  write("cluster", ["silver:items.duplicate_of"], cases);
}

/** Topics: variant → canonical rows (silver) plus identity rows. */
function buildTopics() {
  const mapped = d1<{ name: string; canonical: string }>(
    "SELECT name, canonical FROM topics WHERE name != canonical ORDER BY count DESC LIMIT 30"
  );
  const identity = d1<{ name: string; canonical: string }>(
    "SELECT name, canonical FROM topics WHERE name = canonical AND count <= 2 ORDER BY last_seen DESC LIMIT 20"
  );
  const canonicals = d1<{ canonical: string }>(
    "SELECT canonical FROM topics GROUP BY canonical ORDER BY sum(count) DESC LIMIT 150"
  ).map((r) => r.canonical);
  // Identity rows must not appear as existing canonicals, or the prompt
  // already contains the answer; the pipeline only asks about unseen names.
  const asked = new Set([...mapped, ...identity].map((r) => r.name));
  const cases = [...mapped, ...identity].map((r) => ({
    id: r.name,
    name: r.name,
    silver: { canonical: r.canonical },
    labelSource: "silver:topics.canonical",
  }));
  writeFileSync(
    path.join(benchDir, "topics-canonicals.json"),
    `${JSON.stringify(
      canonicals.filter((c) => !asked.has(c)),
      null,
      2
    )}\n`
  );
  write("topics", ["silver:topics.canonical"], cases);
}

export const BUILDERS: Record<string, () => void | Promise<void>> = {
  score: buildScore,
  "translate-en-vi": buildTranslateEnVi,
  "translate-vi-en": buildTranslateViEn,
  review: buildReview,
  tldr: buildTldr,
  cluster: buildCluster,
  topics: buildTopics,
  ...REVIEW_QUEUE_BUILDERS,
  "draft-repair": () => buildDraftRepair(),
  "rule-extraction": () => buildRuleExtraction(),
};
