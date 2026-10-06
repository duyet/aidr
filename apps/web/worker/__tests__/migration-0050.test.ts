import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dirname, "../../migrations");
const sql = readFileSync(
  path.join(migrationsDir, "0050_subscriber_token_and_source_indexes.sql"),
  "utf8"
);

describe("migration 0050_subscriber_token_and_source_indexes", () => {
  it("indexes subscriber unsubscribe tokens and items by source", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token\s+ON subscribers \(unsubscribe_token\);/
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_items_source_published\s+ON items \(source_id, published_at\);/
    );
  });
});
