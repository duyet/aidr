#!/usr/bin/env tsx
/**
 * Confusion table for the cluster gate (`worker/cluster-gate.ts`, #733) on
 * the #728 hand labels (`scripts/fixtures/cluster-gate-733.json`): every
 * merge pair whose titles share at most one significant word, labelled per
 * canonical W (wrong), L (correct) or A (unclear). No model call, no D1.
 *
 * Usage (from apps/web): pnpm exec tsx scripts/cluster-gate-eval.ts [--list]
 * `--list` prints each blocked L/A pair and each allowed W pair.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backsExisting, type GateHeadline } from "../worker/cluster-gate";

interface Pair {
  label: "W" | "L" | "A";
  canonicalId: string;
  mergedId: string;
  canonical: GateHeadline;
  merged: GateHeadline;
}

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/cluster-gate-733.json"
);
const { pairs } = JSON.parse(readFileSync(fixture, "utf8")) as {
  pairs: Pair[];
};

const counts = { W: [0, 0], L: [0, 0], A: [0, 0] };
const canonicals = {
  W: new Map<string, boolean>(),
  L: new Map<string, boolean>(),
  A: new Map<string, boolean>(),
};
const listed: string[] = [];
for (const p of pairs) {
  const blocked = !backsExisting([p.merged], p.canonical);
  counts[p.label][blocked ? 0 : 1]++;
  const every = canonicals[p.label].get(p.canonicalId) ?? true;
  canonicals[p.label].set(p.canonicalId, every && blocked);
  if (blocked === (p.label !== "W")) {
    listed.push(
      `${p.label} ${blocked ? "blocked" : "allowed"} ${p.canonicalId.slice(0, 8)} [${p.canonical.sourceId}] ${p.canonical.title} <= [${p.merged.sourceId}] ${p.merged.title}`
    );
  }
}

const pct = (n: number, d: number) =>
  d ? `${((n / d) * 100).toFixed(1)}%` : "n/a";
const [tp, fn] = counts.W;
const [fp, tn] = counts.L;
console.log("pairs        blocked  allowed  canonicals fully blocked");
for (const label of ["W", "L", "A"] as const) {
  const fully = [...canonicals[label].values()].filter(Boolean).length;
  console.log(
    `${label}            ${String(counts[label][0]).padStart(7)}  ${String(counts[label][1]).padStart(7)}  ${fully} of ${canonicals[label].size}`
  );
}
console.log(
  `precision (blocked pairs that are wrong, W vs L): ${pct(tp, tp + fp)}`
);
console.log(`recall (wrong pairs blocked): ${pct(tp, tp + fn)}`);
console.log(`correct pairs blocked: ${fp} of ${fp + tn}`);
if (process.argv.includes("--list")) console.log(listed.sort().join("\n"));
