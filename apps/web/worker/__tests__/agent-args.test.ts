/**
 * `aidr-agent` argument parsing. #795: `unmerge --undo <batch> --canonical
 * <id>` dropped the flag it did not know and undid the whole batch. A flag a
 * command does not read must stop the command, so a typo never widens a
 * write.
 */
import { describe, expect, it } from "vitest";
import {
  type Args,
  parseArgs,
  parseUnmergeCommand,
} from "../../scripts/agent-args.js";

const A = "a".repeat(64);
const B = "b".repeat(64);

function args(argv: string[]): Args {
  const parsed = parseArgs(argv);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}

const unmerge = (argv: string[]) => {
  const parsed = parseArgs(["unmerge", ...argv]);
  return "error" in parsed ? parsed : parseUnmergeCommand(parsed);
};

describe("parseArgs", () => {
  it("refuses a flag the command does not read", () => {
    expect(parseArgs(["unmerge", "--undo", "1", "--canonicl", A])).toEqual({
      error: expect.stringContaining("--canonicl"),
    });
    expect(parseArgs(["audit", "--apply"])).toEqual({
      error: expect.stringContaining("--apply"),
    });
    expect(parseArgs(["backfill-tags", "--undo", "1"])).toEqual({
      error: expect.stringContaining("--undo"),
    });
  });

  it("keeps the flags each command reads", () => {
    expect(args(["audit", "--run", "r1", "--runs", "3"]).flags).toEqual(
      new Map([
        ["run", "r1"],
        ["runs", "3"],
      ])
    );
    expect(
      args(["run", "--steps", "tldr", "--wait", "--dry-run"]).flags
    ).toEqual(
      new Map<string, string | true>([
        ["steps", "tldr"],
        ["wait", true],
        ["dry-run", true],
      ])
    );
    expect(args(["unmerge", "pairs.json", "--apply"]).positional).toEqual([
      "unmerge",
      "pairs.json",
    ]);
  });
});

describe("parseUnmergeCommand", () => {
  it("scopes an undo to the canonicals named, comma-separated", () => {
    expect(
      unmerge(["--undo", "1791995305870", "--canonical", `${A},${B}`])
    ).toEqual({
      kind: "undo",
      batchId: 1791995305870,
      canonicalIds: [A, B],
      apply: false,
    });
    expect(unmerge(["--undo", "1791995305870", "--apply"])).toEqual({
      kind: "undo",
      batchId: 1791995305870,
      canonicalIds: null,
      apply: true,
    });
  });

  it("refuses a canonical scope it cannot apply exactly", () => {
    for (const argv of [
      // A short id would match nothing in the batch, or the wrong row.
      ["--undo", "1", "--canonical", "01b10eb4"],
      ["--undo", "1", "--canonical", `${A},`],
      ["--undo", "1", "--canonical", "--apply"],
      // --canonical scopes an undo only.
      ["pairs.json", "--canonical", A],
      ["--dangling", "--canonical", A],
      ["--undo", "1", "--dangling"],
      ["--undo", "1", "pairs.json"],
      ["--undo", "x"],
    ]) {
      expect(unmerge(argv)).toEqual({ error: expect.any(String) });
    }
  });

  it("reads a pairs file or the dangling mode as before", () => {
    expect(unmerge(["pairs.json", "--apply"])).toEqual({
      kind: "pairs",
      file: "pairs.json",
      apply: true,
    });
    expect(unmerge(["--dangling"])).toEqual({
      kind: "dangling",
      file: undefined,
      apply: false,
    });
    expect(unmerge(["--dangling", "decisions.json", "--apply"])).toEqual({
      kind: "dangling",
      file: "decisions.json",
      apply: true,
    });
    expect(unmerge([])).toEqual({ error: expect.any(String) });
  });
});
