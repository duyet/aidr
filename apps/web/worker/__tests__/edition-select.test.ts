import { describe, expect, it } from "vitest";
import {
  CONTENTION_DEPTH,
  EDITION_WEAK_IMPORTANCE,
  selectEdition,
} from "../digest/select.js";
import { familyCapFor, pickDiverse } from "../source-diversity.js";

const row = (id: string, source_id: string, llm_importance: number | null) => ({
  id,
  source_id,
  llm_importance,
});
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

/** A rank-ordered pool where one family has more top-tier stories than its
 *  cap, then enough other sources to fill the edition without it. */
function cappedPool(limit: number) {
  const cap = familyCapFor(limit);
  const pool = [];
  for (let i = 0; i <= cap; i++) {
    pool.push(row(`top${i}`, i % 2 ? "marketbrief" : "huggingnews", 8.5));
  }
  for (let i = 0; i < limit; i++) pool.push(row(`other${i}`, `src${i}`, 6));
  return pool;
}

describe("selectEdition", () => {
  it("never cuts a top-tier story for the family cap", () => {
    const limit = 8;
    const pool = cappedPool(limit);
    const tops = ids(pool).filter((id) => id.startsWith("top"));
    expect(ids(pickDiverse(pool, { limit }))).not.toContain(tops.at(-1));
    const picked = selectEdition(pool, { limit });
    expect(picked).toHaveLength(limit);
    expect(ids(picked).slice(0, tops.length)).toEqual(tops);
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

  it("fills with a weak story only when nothing stronger is left", () => {
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
