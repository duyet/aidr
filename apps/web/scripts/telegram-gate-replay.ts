#!/usr/bin/env tsx
/**
 * Read-only replay of the Vietnamese Telegram post gate over stored stories:
 * how many EN→VI stories the channel would refuse, and why. Nothing is
 * written to D1, no LLM is called, nothing is posted.
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/telegram-gate-replay.ts [--days 14] [--dump rows.json]
 *   pnpm exec tsx scripts/telegram-gate-replay.ts --file rows.json [--labels labels.json] [--json out.json]
 *   pnpm exec tsx scripts/telegram-gate-replay.ts --ids rows.json [--dump rows2.json]
 *
 * Rows come from production D1 (SELECT only, through `wranglerSelect`) with
 * the notifier's own story columns (`storyCopySql("vi")`), and each one goes
 * through the notifier's own `postableCopy` with the active knowledge rules.
 * `--dump` saves rows and rules so later runs replay the same data with
 * `--file`.
 *
 * `--labels` reads a JSON object keyed `<item id> | <issue>` (or
 * `<item id> | gate:<reason>` for a refusal without draft issues), each
 * value starting "defect" or "fp". A story is a true refusal when any of its
 * issues is a defect, or when `<item id> | story` says the story is one (a
 * defect no issue names), and a false positive when all its issues are "fp".
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  type ChannelCopyRow,
  postableCopy,
  storyCopySql,
  TRENDING_MIN_IMPORTANCE,
  TRENDING_RANK_FLOOR,
} from "../worker/notify/index";
import {
  type KnowledgeRule,
  loadActiveRules,
} from "../worker/translation-knowledge";
import { wranglerSelect, wranglerSelectEnv } from "./cf-d1";

type StoredRow = ChannelCopyRow & {
  id: string;
  rank_score: number | null;
  llm_importance: number | null;
};

interface Replay {
  rules: KnowledgeRule[];
  rows: StoredRow[];
}

interface Args {
  days: number;
  file: string | null;
  ids: string | null;
  dump: string | null;
  labels: string | null;
  json: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    days: 14,
    file: null,
    ids: null,
    dump: null,
    labels: null,
    json: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i] ?? null;
    if (flag === "--days") args.days = Number(value());
    else if (flag === "--file") args.file = value();
    else if (flag === "--ids") args.ids = value();
    else if (flag === "--dump") args.dump = value();
    else if (flag === "--labels") args.labels = value();
    else if (flag === "--json") args.json = value();
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!Number.isInteger(args.days) || args.days < 1) {
    throw new Error("--days takes a whole number of days");
  }
  return args;
}

/** Stories the gate judges: published, not Vietnamese-source, with a
 *  Vietnamese translation. The trending query adds the rank bar on top.
 *  `--ids` re-reads the stories of an earlier dump, so a change to the
 *  notifier's own SQL is measured on the same stories. */
async function loadReplay(args: Args): Promise<Replay> {
  if (args.file) return JSON.parse(readFileSync(args.file, "utf8"));
  const copy = storyCopySql("vi");
  const select = (where: string) =>
    wranglerSelect(
      `SELECT ${copy.columns}
       FROM items i
       ${copy.join}
       WHERE ${where}
         AND tr.title IS NOT NULL
         AND (i.source_lang IS NULL OR i.source_lang <> 'vi')
       ORDER BY i.published_at DESC`
    ) as unknown as StoredRow[];
  let rows: StoredRow[];
  if (args.ids) {
    const ids = (JSON.parse(readFileSync(args.ids, "utf8")) as Replay).rows.map(
      (row) => row.id
    );
    rows = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      if (chunk.some((id) => !/^[0-9a-f]+$/.test(id))) {
        throw new Error("--ids holds an id that is not hex");
      }
      rows.push(...select(`i.id IN ('${chunk.join("','")}')`));
    }
  } else {
    rows = select(
      `i.status = 'published' AND i.published_at >= strftime('%s', 'now') - ${args.days * 86400}`
    );
  }
  return { rules: await loadActiveRules(wranglerSelectEnv()), rows };
}

type Verdict = "defect" | "fp" | "unlabeled";

interface Refusal {
  id: string;
  reason: string;
  issues: string[];
  trending: boolean;
  verdict: Verdict;
  source_title: string;
  source_summary: string | null;
  vi_title: string | null;
  vi_summary: string | null;
}

function storyVerdict(
  id: string,
  keys: string[],
  labels: Record<string, string>
): Verdict {
  if (labels[`${id} | story`]?.startsWith("defect")) return "defect";
  const marks = keys.map((key) => labels[`${id} | ${key}`] ?? "");
  if (marks.some((mark) => mark.startsWith("defect"))) return "defect";
  if (marks.every((mark) => mark.startsWith("fp"))) return "fp";
  return "unlabeled";
}

const pct = (n: number, of: number) =>
  of === 0 ? "0.0%" : `${((100 * n) / of).toFixed(1)}%`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const replay = await loadReplay(args);
  if (args.dump) writeFileSync(args.dump, JSON.stringify(replay));
  const labels: Record<string, string> = args.labels
    ? JSON.parse(readFileSync(args.labels, "utf8"))
    : {};

  const refusals: Refusal[] = [];
  let trendingTotal = 0;
  for (const row of replay.rows) {
    const trending =
      (row.rank_score ?? 0) >= TRENDING_RANK_FLOOR &&
      (row.llm_importance ?? 0) >= TRENDING_MIN_IMPORTANCE;
    if (trending) trendingTotal++;
    const verdict = postableCopy(row, "vi", replay.rules);
    if (!verdict) throw new Error(`${row.id} has no Vietnamese copy`);
    if (verdict.ok) continue;
    const issues = verdict.issues ?? [];
    const keys = issues.length > 0 ? issues : [`gate:${verdict.reason}`];
    refusals.push({
      id: row.id,
      reason: verdict.reason,
      issues,
      trending,
      verdict: storyVerdict(row.id, keys, labels),
      source_title: row.source_title,
      source_summary: row.raw_summary ?? null,
      vi_title: row.tr_title,
      vi_summary: row.tr_summary,
    });
  }

  const total = replay.rows.length;
  const byReason = new Map<string, number>();
  for (const r of refusals) {
    byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  }
  const count = (verdict: Verdict, list = refusals) =>
    list.filter((r) => r.verdict === verdict).length;
  const trendingRefused = refusals.filter((r) => r.trending);

  const source =
    args.file ??
    (args.ids
      ? `production D1, the stories of ${args.ids}`
      : `production D1, last ${args.days} days`);
  console.log(`source: ${source}; ${replay.rules.length} knowledge rules`);
  console.log(
    `| set | stories | passed | refused | defect | fp | unlabeled | fp rate |`
  );
  console.log(`|---|---|---|---|---|---|---|---|`);
  for (const [name, n, list] of [
    ["all EN→VI", total, refusals],
    [
      `rank ≥ ${TRENDING_RANK_FLOOR}, importance ≥ ${TRENDING_MIN_IMPORTANCE}`,
      trendingTotal,
      trendingRefused,
    ],
  ] as const) {
    console.log(
      `| ${name} | ${n} | ${n - list.length} | ${list.length} (${pct(list.length, n)}) | ${count("defect", list)} | ${count("fp", list)} | ${count("unlabeled", list)} | ${pct(count("fp", list), n)} |`
    );
  }
  console.log(
    `refused by reason: ${[...byReason]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${reason} ${n}`)
      .join(", ")}`
  );
  // A story labeled a defect in an earlier run that no check refuses now:
  // either the defect was fixed upstream or a change let it through.
  const refused = new Set(refusals.map((r) => r.id));
  const escaped = new Map<string, string>();
  for (const [key, mark] of Object.entries(labels)) {
    const id = key.split(" | ")[0];
    if (mark.startsWith("defect") && !refused.has(id)) escaped.set(id, mark);
  }
  console.log(`labeled defects that now pass: ${escaped.size}`);
  for (const [id, mark] of escaped)
    console.log(`    ${id.slice(0, 8)} ${mark}`);
  console.log("");
  for (const r of refusals) {
    console.log(
      `${r.id.slice(0, 8)} gate:${r.reason} [${r.verdict}]${r.trending ? " trending" : ""} ${r.vi_title ?? ""}`
    );
    for (const issue of r.issues) {
      const mark = labels[`${r.id} | ${issue}`]?.split(":")[0] ?? "?";
      console.log(`    (${mark}) ${issue}`);
    }
  }
  if (args.json) writeFileSync(args.json, JSON.stringify(refusals, null, 1));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
