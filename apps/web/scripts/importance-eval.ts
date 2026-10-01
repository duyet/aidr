#!/usr/bin/env tsx
/**
 * Importance calibration eval: scores a fixed set of published stories
 * (`scripts/fixtures/importance-eval.json`) through the real Jev and chat
 * scoring code and compares each path against a hand-assigned expected band.
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/importance-eval.ts --out <file.json> [--paths jev,chat] [--limit N]
 *   pnpm exec tsx scripts/importance-eval.ts --compare <before.json> <after.json>
 *
 * One Jev call per item plus one chat call per 10 items. Reads
 * ANYROUTER_API_KEY from the repo-root `.env.local`; never prints it.
 * Expected bands were written before any model run and are the reference,
 * not the old production scores (the chat era scored almost everything 6-9).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  completeJson,
  type ScoreInput,
  sanitizeScoreResults,
  scoreBatchPrompt,
} from "../worker/llm";
import {
  callSystemOne,
  jevScoreQuestions,
  type SystemOneAnswer,
  scoreJudgmentFromJev,
} from "../worker/systemone";
import type { Env } from "../worker/types";

interface FixtureItem {
  id: string;
  source: string;
  title: string;
  summary: string;
  publishedImportance: number;
  scoredOn: string;
  expectedBand: [number, number];
}

interface EvalRow {
  id: string;
  title: string;
  expectedBand: [number, number];
  publishedImportance: number;
  jev: number | null;
  jevRaw: SystemOneAnswer | null;
  chat: number | null;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function readEnv(): Env {
  const file = path.join(repoRoot, ".env.local");
  const out: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf-8").split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m?.[1]) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
  const key = process.env.ANYROUTER_API_KEY ?? out.ANYROUTER_API_KEY;
  if (!key) throw new Error("ANYROUTER_API_KEY missing from .env.local");
  // Same chat chain as production (`wrangler.toml` [vars]).
  const toml = readFileSync(path.join(here, "../wrangler.toml"), "utf-8");
  const model = /^ANYROUTER_MODEL\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
  return { ANYROUTER_API_KEY: key, ANYROUTER_MODEL: model } as Env;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function mapLimit<T, R>(
  xs: T[],
  limit: number,
  fn: (x: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await fn(xs[i] as T);
      }
    })
  );
  return out;
}

function toInput(item: FixtureItem, i: number): ScoreInput {
  return { i, title: item.title, summary: item.summary, source: item.source };
}

async function scoreJev(env: Env, items: FixtureItem[]) {
  const questions = jevScoreQuestions(CATEGORIES);
  return mapLimit(items, 5, async (item) => {
    const res = await callSystemOne(env, toInput(item, 0), questions, "score");
    if (!res) return { score: null, raw: null };
    const judgment = scoreJudgmentFromJev(res.answers, CATEGORIES);
    return {
      score: judgment?.importance ?? null,
      raw: res.answers.importance ?? null,
    };
  });
}

async function scoreChat(env: Env, items: FixtureItem[]) {
  const out: (number | null)[] = items.map(() => null);
  for (let start = 0; start < items.length; start += 10) {
    const batch = items
      .slice(start, start + 10)
      .map((item, k) => toInput(item, start + k));
    try {
      const raw = await completeJson(
        env,
        [{ role: "user", content: scoreBatchPrompt(batch) }],
        { task: "score", maxSliceMs: 70_000 }
      );
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : parsed.results;
      for (const row of sanitizeScoreResults(rows, batch, 0)) {
        out[row.i] = row.importance;
      }
    } catch (error) {
      console.error("chat batch failed:", (error as Error).message);
    }
  }
  return out;
}

function inBand(score: number | null, [lo, hi]: [number, number]): boolean {
  // Round so an expected value of 6.6 counts as a 7.
  return score !== null && Math.round(score) >= lo && Math.round(score) <= hi;
}

function summarize(label: string, scores: (number | null)[], rows: EvalRow[]) {
  const vals = scores.filter((s): s is number => s !== null);
  const hist = new Array(11).fill(0);
  for (const v of vals) hist[Math.round(v)]++;
  const hits = rows.filter((r, i) => inBand(scores[i] ?? null, r.expectedBand));
  const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  return {
    label,
    n: vals.length,
    avg: Number(avg.toFixed(2)),
    low: vals.filter((v) => Math.round(v) <= 3).length,
    high: vals.filter((v) => Math.round(v) >= 7).length,
    top: vals.filter((v) => Math.round(v) >= 9).length,
    bandAgreement: `${hits.length}/${rows.length}`,
    hist: hist.join(" "),
  };
}

function report(rows: EvalRow[], tag: string) {
  return [
    summarize(
      `${tag} published`,
      rows.map((r) => r.publishedImportance),
      rows
    ),
    summarize(
      `${tag} jev`,
      rows.map((r) => r.jev),
      rows
    ),
    summarize(
      `${tag} chat`,
      rows.map((r) => r.chat),
      rows
    ),
  ];
}

async function run() {
  const fixture = JSON.parse(
    readFileSync(path.join(here, "fixtures/importance-eval.json"), "utf-8")
  ) as FixtureItem[];
  const limit = Number(arg("--limit") ?? fixture.length);
  const items = fixture.slice(0, limit);
  const paths = (arg("--paths") ?? "jev,chat").split(",");
  const out = arg("--out");
  if (!out) throw new Error("--out <file.json> is required");
  const env = readEnv();

  const jev = paths.includes("jev")
    ? await scoreJev(env, items)
    : items.map(() => ({ score: null, raw: null }));
  const chat = paths.includes("chat")
    ? await scoreChat(env, items)
    : items.map(() => null);
  const rows: EvalRow[] = items.map((item, i) => ({
    id: item.id,
    title: item.title,
    expectedBand: item.expectedBand,
    publishedImportance: item.publishedImportance,
    jev: jev[i]?.score ?? null,
    jevRaw: jev[i]?.raw ?? null,
    chat: chat[i] ?? null,
  }));
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.table(report(rows, "run"));
}

function compare(beforeFile: string, afterFile: string) {
  const before = JSON.parse(readFileSync(beforeFile, "utf-8")) as EvalRow[];
  const after = JSON.parse(readFileSync(afterFile, "utf-8")) as EvalRow[];
  console.table([...report(before, "before"), ...report(after, "after")]);
  const byId = new Map(after.map((r) => [r.id, r]));
  console.table(
    before.map((b) => {
      const a = byId.get(b.id);
      return {
        title: b.title.slice(0, 60),
        band: b.expectedBand.join("-"),
        pub: b.publishedImportance,
        jevBefore: b.jev,
        jevAfter: a?.jev ?? null,
        chatBefore: b.chat,
        chatAfter: a?.chat ?? null,
      };
    })
  );
}

const cmp = process.argv.indexOf("--compare");
if (cmp >= 0) {
  compare(process.argv[cmp + 1] ?? "", process.argv[cmp + 2] ?? "");
} else {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
