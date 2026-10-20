/**
 * The shape every `aidr-*-review` skill scores with. A rubric is a list of
 * rows whose points sum to 10; a script decides the `auto` rows and a
 * reviewer judges the rest. Ships at 8.
 */
import { writeFileSync } from "node:fs";

export interface RubricRow {
  id: string;
  points: number;
  /** A script decides this row. Without it the reviewer judges it. */
  auto?: boolean;
  /** What the row asks, in one line. */
  ask: string;
}

/** Reasons each automatic row failed; an empty list is a pass. */
export type AutoResult = Record<string, string[]>;

export interface ScoredRow extends RubricRow {
  result: "PASS" | "FAIL" | "judge";
  why: string[];
}

export interface Report {
  surface: string;
  rows: ScoredRow[];
  /** Points earned by automatic rows that passed. */
  earned: number;
  /** Points of automatic rows that failed. */
  lost: number;
  /** Points left for the reviewer to judge. */
  open: number;
}

export const SHIP_AT = 8;

export function scoreRubric(
  surface: string,
  rubric: readonly RubricRow[],
  auto: AutoResult
): Report {
  const total = rubric.reduce((sum, row) => sum + row.points, 0);
  if (Math.abs(total - 10) > 1e-9) {
    throw new Error(`${surface} rubric sums to ${total}, not 10`);
  }
  const rows = rubric.map((row): ScoredRow => {
    if (!row.auto) return { ...row, result: "judge", why: [] };
    const why = auto[row.id];
    if (!why) throw new Error(`no automatic result for ${row.id}`);
    return { ...row, result: why.length ? "FAIL" : "PASS", why };
  });
  const sum = (result: ScoredRow["result"]) =>
    rows
      .filter((r) => r.result === result)
      .reduce((total, r) => total + r.points, 0);
  return {
    surface,
    rows,
    earned: sum("PASS"),
    lost: sum("FAIL"),
    open: sum("judge"),
  };
}

export function formatReport(report: Report): string {
  const lines = [`# ${report.surface}`];
  for (const r of report.rows) {
    lines.push(
      `${r.result.padEnd(5)} ${String(r.points).padEnd(4)} ${r.id.padEnd(18)} ${r.ask}`
    );
    for (const why of r.why.slice(0, 8)) lines.push(`      ${why}`);
    if (r.why.length > 8) lines.push(`      ... ${r.why.length - 8} more`);
  }
  const best = report.earned + report.open;
  lines.push(
    `automatic: ${report.earned} earned, ${report.lost} lost; ${report.open} to judge; best possible ${best}/10; ships at ${SHIP_AT}${best < SHIP_AT ? " (cannot ship)" : ""}`
  );
  return lines.join("\n");
}

/** Prints the reports and writes them to `--json <path>` when given. */
export function emit(reports: Report[], argv: readonly string[]): void {
  console.log(reports.map(formatReport).join("\n\n"));
  const at = argv.indexOf("--json");
  if (at >= 0 && argv[at + 1]) {
    writeFileSync(argv[at + 1], JSON.stringify(reports, null, 2));
  }
}
