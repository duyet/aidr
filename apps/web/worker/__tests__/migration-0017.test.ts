import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(dirname, "../../migrations/0017_topic_learning.sql"),
  "utf-8"
);

describe("migration 0017_topic_learning", () => {
  it("creates topic_daily and learned_keywords", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS topic_daily");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS learned_keywords");
  });

  it("widens HN query and seeds lobsters", () => {
    expect(sql).toContain("WHERE id = 'hn'");
    expect(sql).toContain("'lobsters'");
    expect(sql).toContain("vibecoding");
  });
});
