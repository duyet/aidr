import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Production D1 database `aidr`. `cf d1` takes this id, not the binding name. */
export const D1_DATABASE_ID = "0c8f3efe-0427-4268-8d9f-bb1a4bcbe427";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function cf(args: string[]): string {
  try {
    return execFileSync("pnpm", ["exec", "cf", ...args], {
      cwd: webRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    throw new Error(
      stderr.trim() || "cf command failed; deploy is blocked"
    );
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
