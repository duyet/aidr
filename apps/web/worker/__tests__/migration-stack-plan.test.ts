import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ITEM_BIND_ARITY, TRANSLATION_BIND_ARITY } from "../d1-bind.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const plan = readFileSync(
  path.join(root, "plans/005-translation-review-media-rollout.md"),
  "utf-8"
);

describe("controlled migration/bind integration plan", () => {
  it("reserves 0023 for translation QA, 0024 for media, and 0025 for run identity", () => {
    const order = [
      "0023_translation_reviews.sql",
      "0024_item_media_manifest.sql",
      "0025_llm_call_run_identity.sql",
    ];
    let cursor = -1;
    for (const migration of order) {
      const next = plan.indexOf(migration);
      expect(next, migration).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it("documents the shared bind and translation-invalidation boundaries", () => {
    expect(plan).toContain("centralized translation upsert/invalidation");
    expect(plan).toContain("source_lang");
    expect(plan).toContain("media_manifest");
    expect(plan).toContain("0025_llm_call_run_identity.sql");
    expect(plan).not.toContain("0025_translation_review_hardening.sql");
    expect(ITEM_BIND_ARITY).toBe(21);
    expect(TRANSLATION_BIND_ARITY).toBe(6);
  });
});
