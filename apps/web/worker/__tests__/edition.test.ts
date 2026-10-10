import { describe, expect, it } from "vitest";
import {
  type EditionSnapshot,
  editionBullets,
  loadEdition,
} from "../digest/edition.js";
import type { Env } from "../types.js";

function db(rows: Record<string, EditionSnapshot | undefined>) {
  return {
    prepare() {
      return {
        bind(date: string) {
          return {
            first: async () => rows[date] ?? null,
          };
        },
      };
    },
  } as unknown as Env["DB"];
}

const enOnly: EditionSnapshot = {
  date: "2026-08-16",
  bullets_en: JSON.stringify([{ text: "English story", item_id: "abc" }]),
  bullets_vi: JSON.stringify([]),
};

describe("editionBullets", () => {
  it("returns only the requested language column", () => {
    expect(editionBullets(enOnly, "vi", 8)).toEqual([]);
    expect(editionBullets(enOnly, "en", 8).map((b) => b.text)).toEqual([
      "English story",
    ]);
  });
});

describe("loadEdition", () => {
  it("returns null for an empty language column and the other language intact", async () => {
    const env = { DB: db({ "2026-08-16": enOnly }) } as Env;
    expect(await loadEdition(env, "2026-08-16", "vi", 8)).toBeNull();
    const en = await loadEdition(env, "2026-08-16", "en", 8);
    expect(en?.bullets.map((b) => b.text)).toEqual(["English story"]);
    expect(en?.date).toBe("2026-08-16");
  });

  it("returns null when the requested date is missing, with no fallback to another date", async () => {
    const env = { DB: db({ "2026-08-16": enOnly }) } as Env;
    expect(await loadEdition(env, "2026-08-17", "en", 8)).toBeNull();
  });
});
