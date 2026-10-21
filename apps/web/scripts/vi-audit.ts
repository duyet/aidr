#!/usr/bin/env tsx
/**
 * Read-only dry run of the VI draft gate over stored translations: how many
 * rows each check would send back for repair. Nothing is written anywhere.
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/vi-audit.ts [--days 7] [--ids] [--json <out>]
 *   pnpm exec tsx scripts/vi-audit.ts --file rows.json [--ids] [--json <out>]
 *
 * Rows come from production D1 (SELECT only, through `wranglerSelect`):
 * published English items of the last N days with their Vietnamese
 * translation, plus the active `translation_knowledge` rules. `--file` reads
 * the same columns (`id, en_title, en_summary, vi_title, vi_summary`) from a
 * JSON array instead, with no knowledge rules. Each source goes through
 * `sentSource`, as in the translate step; a row with no summary on either
 * side is judged as a title-only translation.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { sentSource } from "../worker/llm";
import {
  type DraftCheck,
  draftIssuesByCheck,
} from "../worker/translation-draft-check";
import {
  type KnowledgeRule,
  loadActiveRules,
} from "../worker/translation-knowledge";
import { wranglerSelect, wranglerSelectEnv } from "./cf-d1";

interface StoredRow {
  id: string;
  en_title: string;
  en_summary: string | null;
  vi_title: string;
  vi_summary: string | null;
}

interface Args {
  days: number;
  file: string | null;
  ids: boolean;
  json: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { days: 7, file: null, ids: false, json: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--ids") args.ids = true;
    else if (flag === "--days") args.days = Number(argv[++i]);
    else if (flag === "--file") args.file = argv[++i] ?? null;
    else if (flag === "--json") args.json = argv[++i] ?? null;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!Number.isInteger(args.days) || args.days < 1) {
    throw new Error("--days takes a whole number of days");
  }
  return args;
}

function loadRows(args: Args): StoredRow[] {
  if (args.file) return JSON.parse(readFileSync(args.file, "utf8"));
  return wranglerSelect(
    `SELECT i.id, i.title AS en_title, i.summary AS en_summary, t.title AS vi_title, t.summary AS vi_summary
     FROM items i JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
     WHERE i.status = 'published' AND i.source_lang = 'en'
       AND i.published_at > strftime('%s', 'now') - ${args.days * 86400}
     ORDER BY i.published_at DESC`
  ) as unknown as StoredRow[];
}

async function loadRules(args: Args): Promise<KnowledgeRule[]> {
  if (args.file) return [];
  return loadActiveRules(wranglerSelectEnv());
}

function auditRow(
  row: StoredRow,
  rules: KnowledgeRule[]
): Record<DraftCheck, string[]> {
  const titlesOnly = !row.en_summary?.trim() || !row.vi_summary?.trim();
  const sent = sentSource(
    { i: 0, title: row.en_title, summary: row.en_summary ?? undefined },
    titlesOnly
  );
  return draftIssuesByCheck(
    { title: sent.title, summary: sent.summary ?? "" },
    { title: row.vi_title ?? "", summary: row.vi_summary ?? "" },
    rules,
    titlesOnly
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = loadRows(args);
  const rules = await loadRules(args);
  const byCheck = new Map<DraftCheck, string[]>();
  const flagged: { id: string; issues: Record<DraftCheck, string[]> }[] = [];
  for (const row of rows) {
    const issues = auditRow(row, rules);
    const failed = (Object.keys(issues) as DraftCheck[]).filter(
      (check) => issues[check].length > 0
    );
    for (const check of failed) {
      byCheck.set(check, [...(byCheck.get(check) ?? []), row.id]);
    }
    if (failed.length > 0) flagged.push({ id: row.id, issues });
  }
  const source = args.file ?? `production D1, last ${args.days} days`;
  console.log(
    `${rows.length} VI rows (${source}), ${rules.length} knowledge rules`
  );
  console.log(`${flagged.length} rows would go back for repair`);
  for (const [check, ids] of [...byCheck].sort(
    (a, b) => b[1].length - a[1].length
  )) {
    const only = ids.filter((id) => {
      const row = flagged.find((f) => f.id === id);
      return (
        row &&
        Object.entries(row.issues).every(
          ([other, list]) => other === check || list.length === 0
        )
      );
    }).length;
    console.log(
      `  ${check.padEnd(10)} ${String(ids.length).padStart(5)} rows, ${only} by this check alone`
    );
    if (args.ids)
      console.log(`    ${ids.map((id) => id.slice(0, 8)).join(" ")}`);
  }
  if (args.json) writeFileSync(args.json, JSON.stringify(flagged, null, 1));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
