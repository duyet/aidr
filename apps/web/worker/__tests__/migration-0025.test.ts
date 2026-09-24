import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../migrations/0025_llm_call_run_identity.sql"
  ),
  "utf8"
);

describe("migration 0025 llm call identity", () => {
  it("adds explicit run and structured error fields without backfilling", () => {
    expect(sql).toContain("ALTER TABLE llm_calls ADD COLUMN run_id TEXT");
    expect(sql).toContain("ALTER TABLE llm_calls ADD COLUMN error_code TEXT");
    expect(sql).toContain(
      "ALTER TABLE llm_calls ADD COLUMN error_status INTEGER"
    );
    expect(sql).toContain("idx_llm_calls_run_id_ts");
    expect(sql).not.toMatch(/UPDATE\s+llm_calls/i);
  });
});
