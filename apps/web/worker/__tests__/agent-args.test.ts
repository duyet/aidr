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
  parseStoryCaptionCommand,
  parseUnmergeCommand,
  undoScopeMismatch,
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

describe("parseStoryCaptionCommand", () => {
  const storyCaption = (argv: string[]) => {
    const parsed = parseArgs(["story-caption", ...argv]);
    return "error" in parsed ? parsed : parseStoryCaptionCommand(parsed);
  };

  it("is a dry run unless --apply is passed", () => {
    expect(storyCaption([A, "--channel", "telegram"])).toEqual({
      itemId: A,
      channel: "telegram",
      apply: false,
    });
    expect(storyCaption([A, "--channel", "telegram-en", "--apply"])).toEqual({
      itemId: A,
      channel: "telegram-en",
      apply: true,
    });
  });

  it("needs one story id and a Telegram channel", () => {
    expect(storyCaption(["--channel", "telegram"])).toHaveProperty("error");
    expect(storyCaption([A, B, "--channel", "telegram"])).toHaveProperty(
      "error"
    );
    expect(storyCaption([A])).toHaveProperty("error");
    expect(storyCaption([A, "--channel", "facebook-en"])).toHaveProperty(
      "error"
    );
    expect(storyCaption([A, "--channel", "telegram", "--force"])).toEqual({
      error: expect.stringContaining("--force"),
    });
  });
});

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

  it("applies a scoped undo only when the deployed endpoint plans exactly the named canonicals", () => {
    // A Worker from before #795 drops canonicalIds and plans the whole batch.
    expect(undoScopeMismatch([A, B, "c".repeat(64)], [A])).toContain(
      "planned 3 canonical(s), not the 1 named"
    );
    expect(undoScopeMismatch([], [A])).not.toBeNull();
    expect(undoScopeMismatch([B, A], [A, B])).toBeNull();
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
      modelCheck: null,
    });
    expect(unmerge(["--dangling", "decisions.json", "--apply"])).toEqual({
      kind: "dangling",
      file: "decisions.json",
      apply: true,
      modelCheck: null,
    });
    expect(unmerge([])).toEqual({ error: expect.any(String) });
  });

  it("reads the model check only as its own dangling step (#797)", () => {
    expect(unmerge(["--dangling", "--model-check"])).toMatchObject({
      kind: "dangling",
      apply: false,
      modelCheck: { confirmLlm: false, maxCalls: null },
    });
    expect(
      unmerge([
        "--dangling",
        "d.json",
        "--model-check",
        "--confirm-llm",
        "--max-calls",
        "5",
      ])
    ).toMatchObject({
      file: "d.json",
      modelCheck: { confirmLlm: true, maxCalls: 5 },
    });
    for (const argv of [
      // The check calls a model; it never rides along with an apply.
      ["--dangling", "--model-check", "--apply"],
      ["--model-check"],
      ["pairs.json", "--model-check"],
      // A confirmation without the check it confirms is a typo.
      ["--dangling", "--confirm-llm"],
      ["--dangling", "--max-calls", "3"],
      ["--dangling", "--model-check", "--max-calls", "0"],
      ["--dangling", "--model-check", "--max-calls", "--confirm-llm"],
    ]) {
      expect(unmerge(argv)).toEqual({ error: expect.any(String) });
    }
  });
});
