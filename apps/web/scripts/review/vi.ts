#!/usr/bin/env tsx
/**
 * Scored review of today's Vietnamese edition: the stories and VI TL;DR
 * bullets of GET /api/public?lang=vi, with the stored vi_title / vi_summary
 * from D1. It reuses the worker's own draft gate; no LLM call, no write.
 *
 * Usage (repo root):
 *   pnpm --filter @aidr/web exec tsx scripts/review/vi.ts [--fixture <json>] [--json <out>]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sentSource } from "../../worker/llm";
import {
  type DraftCheck,
  draftIssuesByCheck,
} from "../../worker/translation-draft-check";
import {
  type KnowledgeRule,
  loadActiveRules,
} from "../../worker/translation-knowledge";
import { wranglerSelect, wranglerSelectEnv } from "../cf-d1";
import { type AutoResult, emit, type RubricRow, scoreRubric } from "./rubric";

const BASE = "https://aidr.today";

export const RUBRIC: RubricRow[] = [
  {
    id: "vi_garble",
    points: 2,
    auto: true,
    ask: "No garbled word or bad syllable in a VI title, summary, or bullet (vi-syllable)",
  },
  {
    id: "vi_numbers",
    points: 1,
    auto: true,
    ask: "Magnitudes, decimals, $ figures, and versions match the source",
  },
  {
    id: "vi_calque_gloss",
    points: 1,
    auto: true,
    ask: "No calque, English gloss in parentheses, or banned term from a knowledge rule",
  },
  {
    id: "vi_doubled_case",
    points: 0.5,
    auto: true,
    ask: "No doubled word and no Title Case headline",
  },
  {
    id: "vi_untranslated",
    points: 0.5,
    auto: true,
    ask: "No English headline or summary left untranslated",
  },
  {
    id: "vi_length",
    points: 0.5,
    auto: true,
    ask: "Each VI summary keeps at least 60% of the English length",
  },
  {
    id: "vi_title_present",
    points: 1,
    auto: true,
    ask: "Every edition story has a VI title and every VI bullet differs from its English twin (no fallback)",
  },
  {
    id: "vi_keep_terms",
    points: 1,
    auto: true,
    ask: "KEEP_ENGLISH_TERMS in the source survive in the VI title and summary",
  },
  {
    id: "vi_native",
    points: 1,
    ask: "Reads like a Vietnamese tech journalist, sentence by sentence, not a calque of English syntax",
  },
  {
    id: "vi_facts",
    points: 1.5,
    ask: "Who did what, every name, number, and hedge is kept; nothing is added",
  },
];

export interface ViItem {
  id: string;
  enTitle: string;
  enSummary: string | null;
  /** Null when the story has no Vietnamese title. */
  viTitle: string | null;
  viSummary: string | null;
}

export interface ViBullet {
  text: string;
  /** The English bullet at the same position, when there is one. */
  enText: string | null;
  itemIds: string[];
}

export interface ViInput {
  items: ViItem[];
  bullets: ViBullet[];
  rules: KnowledgeRule[];
}

const ROW_CHECKS: Record<string, readonly DraftCheck[]> = {
  vi_garble: ["garble"],
  vi_numbers: ["magnitude", "decimal", "dollar", "version"],
  vi_calque_gloss: ["calque", "gloss", "avoid"],
  vi_doubled_case: ["stutter", "titleCase"],
  vi_untranslated: ["echo"],
  vi_length: ["length"],
  vi_keep_terms: ["keep"],
};

/** The checks that apply to a digest bullet, as in `tldrBulletIssues`, plus
 * garble. Echo, length, version, keep, and title case are about full items. */
const BULLET_CHECKS: readonly DraftCheck[] = [
  "avoid",
  "calque",
  "magnitude",
  "decimal",
  "dollar",
  "gloss",
  "stutter",
  "garble",
];

const short = (id: string) => id.slice(0, 8);

export function autoChecks(input: ViInput): AutoResult {
  const result: AutoResult = Object.fromEntries(
    RUBRIC.filter((row) => row.auto).map((row) => [row.id, [] as string[]])
  );
  const rowOf = (check: DraftCheck): string | undefined =>
    Object.entries(ROW_CHECKS).find(([, checks]) =>
      checks.includes(check)
    )?.[0];
  const record = (
    label: string,
    issues: Record<DraftCheck, string[]>,
    only?: readonly DraftCheck[]
  ) => {
    for (const check of Object.keys(issues) as DraftCheck[]) {
      const row = rowOf(check);
      if (!row || (only && !only.includes(check))) continue;
      for (const issue of issues[check])
        result[row]?.push(`${label}: ${issue}`);
    }
  };

  for (const item of input.items) {
    const label = `story ${short(item.id)}`;
    if (!item.viTitle?.trim()) {
      result.vi_title_present?.push(`${label}: no Vietnamese title`);
      continue;
    }
    const titlesOnly = !item.enSummary?.trim() || !item.viSummary?.trim();
    const sent = sentSource(
      {
        i: 0,
        title: item.enTitle,
        summary: item.enSummary ?? undefined,
      },
      titlesOnly
    );
    record(
      label,
      draftIssuesByCheck(
        { title: sent.title, summary: sent.summary ?? "" },
        { title: item.viTitle, summary: item.viSummary ?? "" },
        input.rules,
        titlesOnly
      )
    );
  }

  const byId = new Map(input.items.map((item) => [item.id, item]));
  input.bullets.forEach((bullet, index) => {
    const label = `bullet ${index + 1} (${bullet.itemIds.map(short).join(", ")})`;
    if (bullet.enText !== null && bullet.text.trim() === bullet.enText.trim()) {
      result.vi_title_present?.push(
        `${label}: VI bullet is the English text unchanged`
      );
      return;
    }
    const sourceText = bullet.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is ViItem => Boolean(item))
      .map((item) => `${item.enTitle}\n${item.enSummary ?? ""}`)
      .join("\n");
    record(
      label,
      draftIssuesByCheck(
        { title: "", summary: sourceText },
        { title: "", summary: bullet.text },
        input.rules,
        false
      ),
      BULLET_CHECKS
    );
  });
  return result;
}

interface PublicBullet {
  text: string;
  item_ids?: string[];
}
interface PublicEdition {
  tldr: { bullets_en?: PublicBullet[]; bullets_vi?: PublicBullet[] };
  stories: { id: string; title: string; title_vi: string | null }[];
}

interface StoredRow {
  id: string;
  en_title: string;
  en_summary: string | null;
  vi_title: string | null;
  vi_summary: string | null;
}

export async function loadViInput(): Promise<ViInput> {
  const response = await fetch(`${BASE}/api/public?lang=vi`);
  if (!response.ok) {
    throw new Error(`GET /api/public?lang=vi answered ${response.status}`);
  }
  const edition = (await response.json()) as PublicEdition;
  const bulletsVi = edition.tldr.bullets_vi ?? [];
  const bulletsEn = edition.tldr.bullets_en ?? [];
  const ids = [
    ...new Set([
      ...edition.stories.map((story) => story.id),
      ...bulletsVi.flatMap((bullet) => bullet.item_ids ?? []),
    ]),
  ];
  if (ids.length === 0) throw new Error("today's VI edition has no stories");
  if (!ids.every((id) => /^[0-9a-f]{64}$/.test(id))) {
    throw new Error("an edition item id is not 64 hex characters");
  }
  const rows = wranglerSelect(
    `SELECT i.id, i.title AS en_title, i.summary AS en_summary, t.title AS vi_title, t.summary AS vi_summary
     FROM items i LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
     WHERE i.id IN (${ids.map((id) => `'${id}'`).join(",")})`
  ) as unknown as StoredRow[];
  const stored = new Map(rows.map((row) => [row.id, row]));
  const items = ids.map((id): ViItem => {
    const row = stored.get(id);
    const story = edition.stories.find((s) => s.id === id);
    if (!row) throw new Error(`item ${short(id)} is not in D1`);
    return {
      id,
      enTitle: row.en_title,
      enSummary: row.en_summary,
      viTitle: story ? story.title_vi : row.vi_title,
      viSummary: row.vi_summary,
    };
  });
  const rules = await loadActiveRules(wranglerSelectEnv());
  return {
    items,
    bullets: bulletsVi.map((bullet, index) => ({
      text: bullet.text,
      enText: bulletsEn[index]?.text ?? null,
      itemIds: bullet.item_ids ?? [],
    })),
    rules,
  };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at >= 0 ? argv[at + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fixture = flagValue(argv, "--fixture");
  const input = fixture
    ? (JSON.parse(readFileSync(fixture, "utf8")) as ViInput)
    : await loadViInput();
  emit([scoreRubric("vi", RUBRIC, autoChecks(input))], argv);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
