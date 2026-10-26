/**
 * Readers learn which models write their news from /release. A model added to
 * a wrangler.toml chain without an entry there would go unannounced, so every
 * id in every `*_MODEL` var must be named in some entry, in both languages.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALGORITHM_ENTRIES } from "./algorithm";

function modelChainIds(): string[] {
  const toml = readFileSync(
    fileURLToPath(new URL("../../../wrangler.toml", import.meta.url)),
    "utf8",
  );
  const ids = new Set<string>();
  for (const m of toml.matchAll(/^[A-Z_]*_MODEL\s*=\s*"([^"]*)"/gm)) {
    for (const id of m[1].split(",")) if (id.trim()) ids.add(id.trim());
  }
  return [...ids];
}

describe("algorithm changelog", () => {
  it("finds the model chains in wrangler.toml", () => {
    expect(modelChainIds()).toContain("poolside/laguna-s-2.1");
  });

  it.each(modelChainIds())("names %s in English and Vietnamese", (id) => {
    expect(ALGORITHM_ENTRIES.some((e) => e.text.en.includes(id))).toBe(true);
    expect(ALGORITHM_ENTRIES.some((e) => e.text.vi.includes(id))).toBe(true);
  });

  it("lists entries newest first", () => {
    const dates = ALGORITHM_ENTRIES.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
