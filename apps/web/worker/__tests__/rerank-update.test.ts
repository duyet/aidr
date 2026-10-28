import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { RERANK_UPDATE_SQL } from "../ingest/write.js";

describe("RERANK_UPDATE_SQL", () => {
  // ~400 items sit in the 72h window; one JSON bind keeps the re-rank one D1
  // query and clear of the 100-bind limit. It must touch only listed ids.
  it("writes each listed score and leaves other rows alone", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE items (id TEXT PRIMARY KEY, rank_score REAL)");
    db.exec("INSERT INTO items VALUES ('a', 1), ('b', 2), ('c', 3)");
    db.prepare(RERANK_UPDATE_SQL).run(
      JSON.stringify([
        { id: "a", r: 9.5 },
        { id: "c", r: 0.25 },
      ])
    );
    expect(
      db.prepare("SELECT id, rank_score FROM items ORDER BY id").all()
    ).toEqual([
      { id: "a", rank_score: 9.5 },
      { id: "b", rank_score: 2 },
      { id: "c", rank_score: 0.25 },
    ]);
  });

  it("reads the JSON once and finds items by primary key (defect: a correlated json_each rescanned the JSON per row, ~74k rows per re-rank)", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE items (id TEXT PRIMARY KEY, rank_score REAL)");
    const plan = (
      db.prepare(`EXPLAIN QUERY PLAN ${RERANK_UPDATE_SQL}`).all("[]") as {
        detail: string;
      }[]
    ).map((r) => r.detail);
    expect(plan.filter((d) => d.includes("json_each"))).toHaveLength(1);
    expect(plan.join("\n")).not.toContain("CORRELATED");
    expect(plan.join("\n")).toMatch(/SEARCH items USING .*INDEX .*\(id=\?\)/);
  });
});
