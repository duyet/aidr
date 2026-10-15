import { describe, expect, it } from "vitest";
import {
  batchPrompt,
  CHECK_VERSION,
  type CheckCandidate,
  type CheckWork,
  checkCandidate,
  checkGate,
  checkWork,
  judgeBatch,
  type LiveRow,
  parseChecks,
  planCheckBatches,
  storyKey,
} from "../unmerge/check.js";
import type { StoryRef } from "../unmerge/twins.js";

const T0 = 1_790_000_000;

const ref = (id: string, title: string, at = T0): StoryRef => ({
  id,
  source_id: "marketbrief",
  url: `https://marketbrief.now/${id}`,
  title,
  published_at: at,
  source_lang: "en",
  title_en: null,
});

const live = (id: string, title: string, at = T0): LiveRow => ({
  ...ref(id, title, at),
  source_id: "techcrunch-ai",
  translation: null,
});

function work(candidate: CheckCandidate, rows: LiveRow[]): CheckWork {
  return { candidate, live: rows };
}

describe("model check verdicts (#797)", () => {
  it("keys a story by its row ids in any order", () => {
    expect(storyKey(["b", "a"])).toBe(storyKey(["a", "b"]));
  });

  it("reads a malformed or older verdict as no verdict", () => {
    const checks = parseChecks([
      { story: "a", version: CHECK_VERSION, verdict: "match", matches: "[" },
      { story: "b", version: CHECK_VERSION, verdict: "match", matches: "[]" },
      { story: "c", version: CHECK_VERSION, verdict: "maybe", matches: "[]" },
      {
        story: "d",
        version: CHECK_VERSION - 1,
        verdict: "clear",
        matches: "[]",
      },
    ]);
    for (const story of ["a", "b", "c", "d"]) {
      expect(checkGate(checks, [story], [])).toEqual({ kind: "unchecked" });
    }
  });

  it("lets distinctFrom overrule a match with the stories it names only", () => {
    const x = ref("x", "X");
    const y = ref("y", "Y");
    const checks = parseChecks([
      {
        story: "s",
        version: CHECK_VERSION,
        verdict: "match",
        matches: JSON.stringify([x, y]),
      },
    ]);
    expect(checkGate(checks, ["s"], ["x"])).toEqual({
      kind: "match",
      matches: [y],
    });
    expect(checkGate(checks, ["s"], ["x", "y"])).toEqual({ kind: "clear" });
  });

  it("packs candidates into calls within the per-call limits", () => {
    const candidates = ["a", "b", "c"].map((id, n) =>
      checkCandidate([ref(id, `Story ${id}`, T0 + n)])
    );
    const batches = planCheckBatches(
      [
        work(candidates[0], [live("l1", "1"), live("l2", "2")]),
        work(candidates[1], [live("l2", "2"), live("l3", "3")]),
        work(candidates[2], [live("l4", "4"), live("l5", "5")]),
      ],
      { newItems: 10, existing: 3 }
    );
    // a and b share l2, so their union fits one call; c would make it 5.
    expect(batches.map((b) => b.work.map((w) => w.candidate.story))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(batches.map((b) => b.chunks.length)).toEqual([1, 1]);
  });

  it("splits a candidate that backs more live rows than a call holds", () => {
    const candidate = checkCandidate([ref("a", "Story a")]);
    const rows = ["1", "2", "3", "4", "5"].map((n) => live(`l${n}`, n));
    const [batch] = planCheckBatches([work(candidate, rows)], {
      newItems: 10,
      existing: 2,
    });
    expect(batch.chunks.map((chunk) => chunk.map((row) => row.id))).toEqual([
      ["l1", "l2"],
      ["l3", "l4"],
      ["l5"],
    ]);
  });

  it("drops a link to a live row outside the story's own seven days", () => {
    const dsec = checkCandidate([ref("a", "DeepSeek DSec Unit Ships", T0)]);
    const mercury = checkCandidate([
      ref("b", "Mercury Launches Books Tool", T0 + 10 * 86_400),
    ]);
    // Backs both headlines, but is twelve days after the DSec story.
    const late = live("x", "DeepSeek and Mercury Sign Deal", T0 + 12 * 86_400);
    const paper = live("p", "DeepSeek DSec Paper", T0);
    const [batch] = planCheckBatches(checkWork([dsec, mercury], [paper, late]));
    expect(batch.work.map((w) => w.live.map((row) => row.id))).toEqual([
      ["p"],
      ["x"],
    ]);
    const prompt = batchPrompt(batch);
    const [dsecVerdict] = judgeBatch(batch, prompt, [
      { new: [0], existing: ["x"] },
    ]);
    expect(dsecVerdict).toMatchObject({
      story: "a",
      verdict: "clear",
      dropped: [{ id: "x", reason: "outside-window" }],
    });
  });

  it("judges a cluster per story: a link one story's headline backs does not hold another", () => {
    const dsec = checkCandidate([
      ref("a", "DeepSeek DSec Unit Supports 380,000 Sandboxes"),
    ]);
    const mercury = checkCandidate([
      ref("b", "Mercury Launches AI Books Tool for 300,000 Users"),
    ]);
    const dsecLive = live("x", "DeepSeek Elastic Compute (DSec) Paper");
    const batch = {
      work: [work(dsec, [dsecLive]), work(mercury, [])],
      chunks: [[dsecLive]],
    };
    const prompt = batchPrompt(batch);
    // The model puts both new items and the DSec paper in one story.
    const verdicts = judgeBatch(batch, prompt, [
      { new: [0, 1], existing: ["x"] },
    ]);
    expect(verdicts).toEqual([
      expect.objectContaining({
        story: "a",
        verdict: "match",
        matches: [expect.objectContaining({ id: "x" })],
      }),
      expect.objectContaining({
        story: "b",
        verdict: "clear",
        dropped: [{ id: "x", title: dsecLive.title, reason: "gate" }],
      }),
    ]);
  });
});
