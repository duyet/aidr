import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Production D1 database `aidr`. `cf d1` takes this id, not the binding name. */
export const D1_DATABASE_ID = "0c8f3efe-0427-4268-8d9f-bb1a4bcbe427";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export function cf(args: string[]): string {
  try {
    return execFileSync("pnpm", ["exec", "cf", ...args], {
      cwd: webRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // The output is parsed as JSON; a shell with FORCE_COLOR set made cf
      // wrap it in ANSI codes and blocked every deploy at the migration gate.
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    throw new Error(stderr.trim() || "cf command failed; deploy is blocked");
  }
}

/** `cf d1 query` returns a JSON array of row objects. Older Wrangler output
 * wrapped that array in `{ results }`. Accept both. */
export function d1ResultRows(output: string): unknown {
  const start = Math.min(
    ...["[", "{"].map((token) => {
      const index = output.indexOf(token);
      return index < 0 ? Number.POSITIVE_INFINITY : index;
    })
  );
  if (!Number.isFinite(start)) {
    throw new Error("could not parse cf d1 JSON");
  }
  const parsed = JSON.parse(output.slice(start)) as unknown;
  if (
    Array.isArray(parsed) &&
    parsed[0] &&
    typeof parsed[0] === "object" &&
    "results" in (parsed[0] as object)
  ) {
    return (parsed[0] as { results?: unknown }).results ?? null;
  }
  return parsed;
}

/** Queries and rows read by `wranglerSelect` in this process; each one
 * reported `changed_db: false` and `rows_written: 0`. */
export const wranglerSelectTotals = { queries: 0, rowsRead: 0 };

/**
 * One read-only query against production D1 through
 * `wrangler d1 execute --remote` (`cf d1 query` answers 403 for some tokens).
 * Refuses anything but a single SELECT, and throws if D1 reports a write.
 */
export function wranglerSelect(sql: string): Record<string, unknown>[] {
  if (
    !/^\s*(SELECT|WITH)\s/i.test(sql) ||
    sql.includes(";") ||
    /\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP|ALTER|CREATE|ATTACH|PRAGMA|VACUUM)\b/i.test(
      sql
    )
  ) {
    throw new Error("wranglerSelect runs one SELECT only");
  }
  let out: string;
  try {
    out = execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--remote",
        "--json",
        "--command",
        sql,
      ],
      {
        cwd: webRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 256 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      }
    );
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    throw new Error(stderr.trim() || "wrangler d1 execute failed");
  }
  const parsed = JSON.parse(out.slice(out.indexOf("["))) as {
    results?: Record<string, unknown>[];
    meta?: { changed_db?: boolean; rows_read?: number; rows_written?: number };
  }[];
  const result = parsed[0];
  if (
    result?.meta?.changed_db !== false ||
    (result.meta.rows_written ?? 0) !== 0
  ) {
    throw new Error(
      `D1 reported a write for a read-only query: ${JSON.stringify(result?.meta)}`
    );
  }
  wranglerSelectTotals.queries++;
  wranglerSelectTotals.rowsRead += result.meta.rows_read ?? 0;
  return result.results ?? [];
}
