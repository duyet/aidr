import { describe, expect, it } from "vitest";
import { wordDiff } from "./word-diff";

describe("wordDiff", () => {
  it("shows the reviewer's adjustment as removed and added words, keeping the rest", () => {
    const parts = wordDiff(
      "OpenAI ra mắt mô hình mới",
      "OpenAI công bố mô hình mới"
    );
    expect(parts).toEqual([
      { kind: "same", text: "OpenAI " },
      { kind: "removed", text: "ra mắt " },
      { kind: "added", text: "công bố " },
      { kind: "same", text: "mô hình mới" },
    ]);
  });

  it("rebuilds both sides exactly, so the diff never misquotes the reader", () => {
    const before = "a  b\nc d";
    const after = "a b c  e";
    const parts = wordDiff(before, after);
    const side = (kind: "added" | "removed") =>
      parts
        .filter((p) => p.kind === "same" || p.kind === kind)
        .map((p) => p.text)
        .join("");
    expect(side("removed")).toBe(before);
    expect(side("added")).toBe(after);
  });

  it("reports no change when the reviewer kept the reader's text", () => {
    expect(wordDiff("same text", "same text")).toEqual([
      { kind: "same", text: "same text" },
    ]);
  });
});
