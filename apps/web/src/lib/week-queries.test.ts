/**
 * `listWeekEditions` feeds the edge-cached `/weeks` index. A failed read must
 * reject, not resolve to an empty list the page would cache as "no issues
 * yet" (#905).
 */
import { describe, expect, it } from "vitest";
import { listWeekEditions } from "./week-queries";

const reader = (all: () => Promise<unknown>) =>
  ({ prepare: () => ({ all }) }) as unknown as Parameters<
    typeof listWeekEditions
  >[0];

describe("listWeekEditions", () => {
  it("rejects when the D1 read fails", async () => {
    const db = reader(async () => {
      throw new Error("D1_ERROR: Network connection lost.");
    });
    await expect(listWeekEditions(db)).rejects.toThrow("D1_ERROR");
  });

  it("resolves an empty list when there is no edition yet", async () => {
    await expect(
      listWeekEditions(reader(async () => ({ results: [] })))
    ).resolves.toEqual([]);
  });
});
