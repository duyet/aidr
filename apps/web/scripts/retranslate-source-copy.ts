#!/usr/bin/env tsx
import { prepareLoggedTranslationUpsert } from "../worker/d1-bind";
/**
 * Backfill for #652. Stored Vietnamese summaries kept a feed footer ("Bài
 * viết … xuất hiện lần đầu trên The Decoder") or the source's own voice
 * ("chúng tôi", "tôi", "bạn"), and a few English summaries copied the footer.
 * Ingest now strips the footer and the translate card asks for third-person
 * news voice; this re-translates the rows written before that.
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/retranslate-source-copy.ts                   # dry run: counts + samples
 *   pnpm exec tsx scripts/retranslate-source-copy.ts --apply [--limit N]
 *
 * The dry run only reads production D1 (`cf d1 query`, SELECT). `--apply`
 * translates with the wrangler.toml chain and the ANYROUTER_API_KEY from the
 * repo-root `.env.local`, then writes through the pipeline's own SQL: the
 * logged translation upsert (reason "backfill", clears the QA marker so the
 * row is reviewed again) and the revision-guarded English summary update.
 * `items.summary` is never rewritten: `sentSource` strips the footer when
 * the text is read, so `summary_en` and its revision stay valid.
 * A new candidate that still carries a footer or source voice is not
 * written. Rerunning converges: fixed rows no longer match.
 */
import {
  EN_SUMMARY_BATCH_SIZE,
  EN_SUMMARY_UPDATE_SQL,
} from "../worker/en-summary";
import {
  summarizeEnglish,
  TRANSLATE_BATCH_SIZE,
  translateItems,
} from "../worker/llm";
import { benchEnv, stubDb } from "./bench-env";
import { cf, D1_DATABASE_ID, d1ResultRows } from "./cf-d1";

process.env.CLOUDFLARE_ACCOUNT_ID ??= "7df185a18b98382c3240fa7ac4a37075";

const apply = process.argv.includes("--apply");
const limitArg = process.argv.indexOf("--limit");
const limit =
  limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Number.POSITIVE_INFINITY;
const PAGE = 200;

const QUOTED = /“[^”]*”|"[^"]*"/g;
const VI_FOOTER = /xuất hiện lần đầu|appeared first on/i;
const VI_VOICE =
  /(?<![\p{L}\p{N}])(?:chúng tôi|chúng ta|tôi|bạn(?! bè))(?![\p{L}\p{N}])/iu;
// "us" would match "US", and a lowercase "i" matches "i.e.".
const EN_VOICE = /\b(?:[Ww]e|[Oo]ur|[Mm]y|[Yy]ou|[Yy]our|I)\b/;
const EN_FOOTER = /appeared first on/i;

interface Row {
  id: string;
  source_id: string;
  title: string;
  summary: string;
  summary_en: string | null;
  source_revision: number;
  vi_title: string | null;
  vi_summary: string | null;
}

type Reason = "vi-footer" | "vi-voice" | "en-footer";

function reasons(row: Row): Reason[] {
  const out: Reason[] = [];
  const vi = row.vi_summary ?? "";
  if (VI_FOOTER.test(vi)) out.push("vi-footer");
  // Both sides: a Vietnamese "bạn" is source voice only when the English
  // addresses someone too.
  if (
    VI_VOICE.test(vi.replace(QUOTED, " ")) &&
    EN_VOICE.test(row.summary.replace(QUOTED, " "))
  )
    out.push("vi-voice");
  if (row.summary_en && EN_FOOTER.test(row.summary_en)) out.push("en-footer");
  return out;
}

function query<T>(sql: string): T[] {
  return (d1ResultRows(cf(["d1", "query", D1_DATABASE_ID, "--sql", sql])) ??
    []) as T[];
}

function loadCandidates(): Row[] {
  const where = `i.status = 'published' AND i.source_lang = 'en'
      AND i.summary IS NOT NULL AND i.summary != '' AND (
      t.summary LIKE '%xuất hiện lần đầu%' OR t.summary LIKE '%appeared first on%'
      OR t.summary LIKE '%tôi%' OR t.summary LIKE '%bạn%' OR t.summary LIKE '%chúng ta%'
      OR t.summary LIKE '%Bạn%' OR t.summary LIKE '%Tôi%' OR t.summary LIKE '%Chúng%'
      OR i.summary_en LIKE '%appeared first on%')`;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = query<Row>(
      `SELECT i.id, i.source_id, i.title, i.summary, i.summary_en, i.source_revision,
              t.title AS vi_title, t.summary AS vi_summary
       FROM items i LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
       WHERE ${where}
       ORDER BY i.published_at DESC LIMIT ${PAGE} OFFSET ${offset}`
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Inlines the binds of the pipeline's own prepared statements so
 * `cf d1 query` runs exactly the SQL the Worker would. */
function recordingDb(): { db: D1Database; sql: string[] } {
  const sql: string[] = [];
  const db = {
    prepare(text: string) {
      return {
        bind(...values: unknown[]) {
          let i = 0;
          sql.push(`${text.replace(/\?/g, () => sqlLiteral(values[i++]))};`);
          return this;
        },
      };
    },
  } as unknown as D1Database;
  return { db, sql };
}

function report(rows: Array<Row & { why: Reason[] }>): void {
  const by = new Map<string, Record<Reason, number>>();
  for (const row of rows) {
    const counts = by.get(row.source_id) ?? {
      "vi-footer": 0,
      "vi-voice": 0,
      "en-footer": 0,
    };
    for (const why of row.why) counts[why]++;
    by.set(row.source_id, counts);
  }
  const total = (r: Reason) => rows.filter((row) => row.why.includes(r)).length;
  console.log(
    `affected rows: ${rows.length} (vi-footer ${total("vi-footer")}, vi-voice ${total("vi-voice")}, en-footer ${total("en-footer")})`
  );
  console.log(
    `re-translate VI: ${rows.filter((r) => r.why.some((w) => w.startsWith("vi-"))).length}, re-summarize EN: ${total("en-footer")}`
  );
  console.log("source              vi-footer  vi-voice  en-footer");
  for (const [source, c] of [...by].sort(
    (a, b) =>
      Object.values(b[1]).reduce((s, n) => s + n, 0) -
      Object.values(a[1]).reduce((s, n) => s + n, 0)
  )) {
    console.log(
      `${source.padEnd(20)}${String(c["vi-footer"]).padStart(9)}${String(c["vi-voice"]).padStart(10)}${String(c["en-footer"]).padStart(11)}`
    );
  }
  for (const why of ["vi-footer", "vi-voice", "en-footer"] as const) {
    const sample = rows.find((row) => row.why.includes(why));
    if (!sample) continue;
    const text =
      why === "en-footer"
        ? (sample.summary_en ?? "")
        : (sample.vi_summary ?? "");
    console.log(`  ${why} ${sample.id.slice(0, 8)}: …${text.slice(-140)}`);
  }
}

async function applyFixes(rows: Array<Row & { why: Reason[] }>): Promise<void> {
  const knowledge = query<Record<string, unknown>>(
    "SELECT * FROM translation_knowledge WHERE status = 'active'"
  );
  const env = benchEnv(
    {},
    stubDb((sql) =>
      sql.includes("FROM translation_knowledge") ? knowledge : []
    )
  );

  const vi = rows.filter((r) => r.why.some((w) => w.startsWith("vi-")));
  let written = 0;
  let skipped = 0;
  for (let at = 0; at < vi.length; at += TRANSLATE_BATCH_SIZE) {
    const batch = vi.slice(at, at + TRANSLATE_BATCH_SIZE);
    const results = await translateItems(
      env,
      batch.map((row, i) => ({
        i,
        title: row.title,
        summary: row.summary,
        sourceLang: "en" as const,
      }))
    ).catch((error: unknown) => {
      console.error(`translate batch ${at} failed:`, String(error));
      return [];
    });
    const { db, sql } = recordingDb();
    for (const result of results) {
      const row = batch[result.i];
      if (!row || !result.title || !result.summary) continue;
      if (
        reasons({ ...row, summary_en: null, vi_summary: result.summary }).length
      ) {
        skipped++;
        continue;
      }
      prepareLoggedTranslationUpsert(db, {
        id: row.id,
        lang: "vi",
        sourceLang: "en",
        targetLang: "vi",
        title: result.title,
        summary: result.summary,
        reason: "backfill",
      });
      written++;
    }
    if (sql.length)
      cf(["d1", "query", D1_DATABASE_ID, "--sql", sql.join("\n")]);
    console.log(`vi ${Math.min(at + batch.length, vi.length)}/${vi.length}`);
  }

  const en = rows.filter((r) => r.why.includes("en-footer"));
  let enWritten = 0;
  for (let at = 0; at < en.length; at += EN_SUMMARY_BATCH_SIZE) {
    const batch = en.slice(at, at + EN_SUMMARY_BATCH_SIZE);
    const out = await summarizeEnglish(
      env,
      batch.map((row, i) => ({ i, title: row.title, summary: row.summary }))
    ).catch((error: unknown) => {
      console.error(`summarize batch ${at} failed:`, String(error));
      return { results: [] };
    });
    const { db, sql } = recordingDb();
    for (const result of out.results) {
      const row = batch[result.i];
      if (!row || EN_FOOTER.test(result.summary)) continue;
      db.prepare(EN_SUMMARY_UPDATE_SQL).bind(
        result.summary,
        row.source_revision,
        row.id,
        row.source_revision
      );
      enWritten++;
    }
    if (sql.length)
      cf(["d1", "query", D1_DATABASE_ID, "--sql", sql.join("\n")]);
  }
  console.log(
    `wrote ${written} VI rows (${skipped} candidates still flagged, kept old), ${enWritten}/${en.length} EN summaries`
  );
}

async function main(): Promise<void> {
  const rows = loadCandidates()
    .map((row) => ({ ...row, why: reasons(row) }))
    .filter((row) => row.why.length > 0)
    .slice(0, limit);
  report(rows);
  const rawFooters = query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM items WHERE status = 'published' AND summary LIKE '%appeared first on%'"
  )[0]?.n;
  console.log(
    `raw items.summary with a footer: ${rawFooters} (left as is; the pipeline strips it on read)`
  );
  if (!apply) {
    console.log("dry run: nothing written. Pass --apply to re-translate.");
    return;
  }
  await applyFixes(rows);
}

main();
