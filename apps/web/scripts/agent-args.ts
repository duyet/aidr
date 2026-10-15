/**
 * `aidr-agent` argument parsing, kept free of side effects so tests can
 * import it. Every command lists the flags it reads; any other flag stops the
 * command (#795: an ignored `--canonical` once widened an undo to its whole
 * batch).
 */
import type { ItemId } from "../worker/unmerge/plan";
import { parseBatchId, parseUndoCanonicalIds } from "../worker/unmerge/undo";

export interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

/** The flags each command reads. */
const COMMAND_FLAGS: Record<string, readonly string[]> = {
  audit: ["run", "runs"],
  ranking: ["limit"],
  "tldr-preview": [],
  "tldr-regenerate": ["date", "dry-run"],
  run: ["steps", "force", "wait", "live", "dry-run"],
  rerun: ["force", "wait", "live", "dry-run"],
  "day-video": [
    "video",
    "short",
    "title",
    "lang",
    "clear-video",
    "clear-short",
    "delete",
  ],
  "day-video-telegram": ["lang", "chat"],
  "day-video-posted": ["channel", "ref"],
  unmerge: ["apply", "undo", "canonical", "dangling"],
  "backfill-tags": ["apply"],
};

/** Flags that take the next argument as their value. */
const VALUE_FLAGS = new Set([
  "run",
  "runs",
  "limit",
  "steps",
  "video",
  "short",
  "title",
  "lang",
  "chat",
  "channel",
  "ref",
  "date",
  "undo",
  "canonical",
]);

/** Splits `argv` into positionals and flags. An unknown command keeps its
 * flags unchecked: it only prints the usage. */
export function parseArgs(argv: readonly string[]): Args | { error: string } {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--") && VALUE_FLAGS.has(name)) {
      flags.set(name, next);
      i++;
    } else {
      flags.set(name, true);
    }
  }
  const allowed = COMMAND_FLAGS[positional[0] ?? ""];
  const unknown = allowed
    ? [...flags.keys()].filter((name) => !allowed.includes(name))
    : [];
  if (unknown.length > 0) {
    return {
      error: `${positional[0]} does not take ${unknown.map((n) => `--${n}`).join(", ")} (it takes ${allowed.map((n) => `--${n}`).join(", ") || "no flags"})`,
    };
  }
  return { positional, flags };
}

export type UnmergeCommand =
  | { kind: "pairs"; file: string; apply: boolean }
  | { kind: "dangling"; file: string | undefined; apply: boolean }
  | {
      kind: "undo";
      batchId: number;
      /** null undoes the whole batch. */
      canonicalIds: ItemId[] | null;
      apply: boolean;
    };

/** `unmerge <pairs.json> | --dangling [decisions.json] | --undo <batchId>
 * [--canonical <id,...>]`, each with `[--apply]`. */
export function parseUnmergeCommand(
  args: Args
): UnmergeCommand | { error: string } {
  const apply = args.flags.has("apply");
  const files = args.positional.slice(1);
  if (files.length > 1) {
    return { error: `unmerge takes one file, got ${files.join(" ")}` };
  }
  const [file] = files;
  if (args.flags.has("undo")) {
    if (args.flags.has("dangling") || file !== undefined) {
      return { error: "--undo takes no pairs file and no --dangling" };
    }
    const batchId = parseBatchId(args.flags.get("undo"));
    if (batchId === null) return { error: "--undo needs the apply's batch id" };
    const raw = args.flags.get("canonical");
    if (raw === true) {
      return { error: "--canonical needs comma-separated canonical ids" };
    }
    const scope = parseUndoCanonicalIds(raw?.split(","));
    if ("error" in scope) return { error: `--canonical: ${scope.error}` };
    return { kind: "undo", batchId, canonicalIds: scope.canonicalIds, apply };
  }
  if (args.flags.has("canonical")) {
    return { error: "--canonical scopes --undo only" };
  }
  if (args.flags.has("dangling")) return { kind: "dangling", file, apply };
  if (file === undefined) return { error: "unmerge needs a pairs JSON file" };
  return { kind: "pairs", file, apply };
}

/** Why a deployed endpoint's undo dry run does not cover exactly the
 * canonicals named, or null when it does. A Worker from before #795 ignores
 * `canonicalIds` and plans the whole batch. */
export function undoScopeMismatch(
  planned: readonly string[],
  requested: readonly string[]
): string | null {
  const want = new Set(requested);
  const got = new Set(planned);
  const same = got.size === want.size && [...want].every((id) => got.has(id));
  return same
    ? null
    : `the deployed endpoint planned ${got.size} canonical(s), not the ${want.size} named; deploy #795 first`;
}
