import { describe, expect, it } from "vitest";
import {
  CONTENTION_DEPTH,
  EDITION_WEAK_IMPORTANCE,
  editionFamilyCeiling,
  selectEdition,
} from "../digest/select.js";
import {
  familyCapFor,
  pickDiverse,
  sourceFamily,
} from "../source-diversity.js";

const row = (id: string, source_id: string, llm_importance: number | null) => ({
  id,
  source_id,
  llm_importance,
});
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const familyCount = (rows: { source_id: string }[], family: string) =>
  rows.filter((r) => sourceFamily(r.source_id) === family).length;

describe("selectEdition", () => {
  it("lifts a top-tier story the family cap cuts, even with the edition already filled above it", () => {
    const limit = 16;
    const cap = familyCapFor(limit);
    const pool = [];
    for (let i = 0; i < cap; i++) pool.push(row(`agg${i}`, "marketbrief", 7));
    for (let i = 0; pool.length < limit; i++)
      pool.push(row(`other${i}`, `src${i}`, 6));
    pool.push(row("argon", "huggingnews", 8.1));
    expect(ids(pickDiverse(pool, { limit }))).not.toContain("argon");

    const picked = selectEdition(pool, { limit });

    expect(picked).toHaveLength(limit);
    expect(ids(picked)).toContain("argon");
    expect(ids(picked)).toEqual(
      expect.arrayContaining(ids(pool.slice(0, cap)))
    );
    expect(ids(picked)).not.toContain(pool[limit - 1].id);
  });

  it("never lets a lifted story push out a higher-ranked story from its own family", () => {
    // 2026-10-15: Gemini 4 Argon (8.1, #26) must not cost Black Forest
    // Labs' open model (7.9, #10) its slot.
    const limit = 16;
    const pool = [
      row("agg-top-1", "marketbrief", 8.5),
      row("agg-top-2", "huggingnews", 8.4),
      row("agg-a", "marketbrief", 7.2),
      row("agg-b", "huggingnews", 7),
      row("bfl", "marketbrief", 7.9),
    ];
    for (let i = 0; pool.length < 25; i++)
      pool.push(row(`o${i}`, `src${i}`, 6));
    pool.push(row("argon", "huggingnews", 8.1));

    const picked = ids(selectEdition(pool, { limit }));

    expect(picked).toContain("bfl");
    expect(picked).toContain("argon");
  });

  it("holds every family to the ceiling however many top-tier stories it has", () => {
    const limit = 16;
    const pool = [];
    for (let i = 0; i < 10; i++)
      pool.push(row(`agg${i}`, i % 2 ? "marketbrief" : "huggingnews", 9));
    for (let i = 0; i < limit; i++) pool.push(row(`other${i}`, `src${i}`, 6));

    const picked = selectEdition(pool, { limit });

    expect(picked).toHaveLength(limit);
    expect(familyCount(picked, "aggregator")).toBe(editionFamilyCeiling(limit));
    expect(editionFamilyCeiling(limit)).toBe(familyCapFor(limit) + 1);
  });

  it("does not lift a top-tier story that rank left out of contention", () => {
    const limit = 4;
    const pool = [];
    for (let i = 0; i < limit * CONTENTION_DEPTH; i++) {
      pool.push(row(`fresh${i}`, `src${i}`, 6));
    }
    pool.push(row("stale", "src-stale", 9));
    expect(ids(selectEdition(pool, { limit }))).toEqual(
      ids(pool.slice(0, limit))
    );
  });

  it("fills with a weak story only when nothing stronger is in contention", () => {
    const limit = 3;
    const pool = [
      row("a", "src-a", 7),
      row("weak", "hn", EDITION_WEAK_IMPORTANCE - 1),
      row("b", "src-b", 6),
      row("c", "src-c", 5),
    ];
    expect(ids(selectEdition(pool, { limit }))).toEqual(["a", "b", "c"]);
    expect(ids(selectEdition(pool.slice(0, 2), { limit }))).toEqual([
      "a",
      "weak",
    ]);
  });

  it("returns a weak fill in its rank position, so bullets stay in rank order", () => {
    const pool = [
      row("a", "src-a", 7),
      row("weak", "hn", EDITION_WEAK_IMPORTANCE - 1),
      row("b", "src-b", 6),
      row("c", "src-c", 5),
    ];
    expect(ids(selectEdition(pool, { limit: 4 }))).toEqual([
      "a",
      "weak",
      "b",
      "c",
    ]);
  });

  it("keeps rank order and the family cap on an ordinary pool", () => {
    const limit = 6;
    const pool = [];
    for (let i = 0; i < 12; i++) {
      pool.push(row(`r${i}`, i % 2 ? "hn" : "techmeme", 7 - i * 0.1));
    }
    const picked = selectEdition(pool, { limit });
    expect(ids(picked)).toEqual(ids(pickDiverse(pool, { limit })));
    expect(ids(picked)).toEqual(ids(pool.slice(0, limit)));
  });

  it("treats an unscored row as weak", () => {
    const pool = [row("unscored", "hn", null), row("scored", "src", 5)];
    expect(ids(selectEdition(pool, { limit: 1 }))).toEqual(["scored"]);
  });
});
