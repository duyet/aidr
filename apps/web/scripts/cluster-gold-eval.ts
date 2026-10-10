#!/usr/bin/env tsx
/**
 * Gold same-story eval for the cluster call (`clusterSimilar`), built from
 * duplicates that reached the prod 24h pool (96 rows) on 2026-10-10. The `cluster`
 * step in model-bench scores against prod `duplicate_of`, so a model that
 * merges what prod missed counts as wrong there; this set counts it right.
 *
 *   pnpm tsx scripts/cluster-gold-eval.ts --models a,b [--reps 2]
 *
 * One call per rep, shaped like prod: a handful of new items against the
 * rest of the 24h top list. Pair precision/recall over pairs that involve
 * a new item. Reads ANYROUTER_API_KEY from .env.local; never prints it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clusterSimilar } from "../worker/dedupe";
import { resetUnavailableModels } from "../worker/llm";
import { benchEnv } from "./bench-env";

interface Fixture {
  items: { id: string; title: string; source: string }[];
  newIds: string[];
  groups: string[][];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    path.join(here, "fixtures/quality-bench/cluster-gold.json"),
    "utf-8"
  )
) as Fixture;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function pairs(groups: string[][], newIds: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const g of groups) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (newIds.has(g[i]) || newIds.has(g[j])) out.add(pairKey(g[i], g[j]));
      }
    }
  }
  return out;
}

async function main() {
  const models = (arg("models") ?? "").split(",").filter(Boolean);
  const reps = Number(arg("reps") ?? 2);
  const newIds = new Set(fixture.newIds);
  const newItems = fixture.newIds.map((id, i) => {
    const it = fixture.items.find((x) => x.id === id);
    if (!it) throw new Error(`fixture missing ${id}`);
    return { i, title: it.title, source: it.source };
  });
  const existing = fixture.items
    .filter((x) => !newIds.has(x.id))
    .map((x) => ({ id: x.id, title: x.title }));
  const gold = pairs(fixture.groups, newIds);

  for (const model of models) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let fails = 0;
    const ms: number[] = [];
    for (let r = 0; r < reps; r++) {
      resetUnavailableModels();
      const env = benchEnv({ ANYROUTER_MODEL: model });
      const t0 = Date.now();
      const clusters = await clusterSimilar(env, newItems, existing);
      ms.push(Date.now() - t0);
      if (clusters.length === 0) fails++;
      const predicted = pairs(
        clusters.map((c) => [
          ...(c.new ?? []).map((i) => fixture.newIds[i]),
          ...(c.existing ?? []),
        ]),
        newIds
      );
      for (const p of predicted) gold.has(p) ? tp++ : fp++;
      for (const g of gold) if (!predicted.has(g)) fn++;
    }
    const p = tp / Math.max(1, tp + fp);
    const rc = tp / Math.max(1, tp + fn);
    const f1 = p + rc ? (2 * p * rc) / (p + rc) : 0;
    ms.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        model,
        f1: +f1.toFixed(3),
        precision: +p.toFixed(3),
        recall: +rc.toFixed(3),
        tp,
        fp,
        fn,
        emptyRuns: fails,
        p50Ms: ms[Math.floor(ms.length / 2)],
      })
    );
  }
}

main();
