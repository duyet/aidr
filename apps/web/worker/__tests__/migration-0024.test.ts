import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(dirname, "../../migrations/0024_item_media_manifest.sql"),
  "utf-8"
);

describe("migration 0024_item_media_manifest", () => {
  it("adds an additive bounded manifest column without replacing image_url", () => {
    expect(sql).toContain(
      "ALTER TABLE items ADD COLUMN media_manifest TEXT NOT NULL DEFAULT '[]';"
    );
    expect(sql).toContain("image_url");
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("DELETE FROM");
  });
});
