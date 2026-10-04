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
    const now = new Date("2026-08-16T03:00:00Z");
    expect(await loadEdition(env, "2026-08-16", "vi", 8, now)).toBeNull();
    const en = await loadEdition(env, "2026-08-16", "en", 8, now);
    expect(en?.bullets.map((b) => b.text)).toEqual(["English story"]);
    expect(en?.date).toBe("2026-08-16");
  });

  it("uses the UTC-dated row only when the requested local date is missing", async () => {
    const env = { DB: db({ "2026-08-16": enOnly }) } as Env;
    const now = new Date("2026-08-16T03:00:00Z");
    const edition = await loadEdition(env, "2026-08-15", "en", 8, now);
    expect(edition?.date).toBe("2026-08-16");
    expect(edition?.bullets).toHaveLength(1);

    const sameDayMiss = await loadEdition(
      { DB: db({}) } as Env,
      "2026-08-16",
      "en",
      8,
      now
    );
    expect(sameDayMiss).toBeNull();
  });
});
