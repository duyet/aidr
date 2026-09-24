import { describe, expect, it } from "vitest";
import {
  assertMediaManifestSchema,
  isMediaManifestSchemaError,
} from "../media-schema.js";

describe("media manifest schema gate", () => {
  it("passes when the column exists, including an empty items table", async () => {
    const first = async () => null;
    const db = {
      prepare: (sql: string) => {
        expect(sql).toContain("media_manifest");
        return { first };
      },
    } as unknown as Pick<D1Database, "prepare">;

    await expect(assertMediaManifestSchema(db)).resolves.toBeUndefined();
  });

  it("turns a pre-0024 missing-column error into a fatal typed error", async () => {
    const db = {
      prepare: () => ({
        first: async () => {
          throw new Error(
            "D1_ERROR SQLITE_ERROR: no such column: media_manifest"
          );
        },
      }),
    } as unknown as Pick<D1Database, "prepare">;

    try {
      await assertMediaManifestSchema(db);
      throw new Error("expected schema assertion to fail");
    } catch (error) {
      expect(isMediaManifestSchemaError(error)).toBe(true);
      expect(String(error)).toMatch(
        /0023_translation_reviews\.sql.*0024_item_media_manifest\.sql/
      );
    }
  });

  it("recognizes raw missing-column errors after the preflight race", () => {
    expect(
      isMediaManifestSchemaError(
        new Error("D1_ERROR: table items has no column named media_manifest")
      )
    ).toBe(true);
  });

  it("does not mislabel an unrelated D1 outage as a migration error", async () => {
    const db = {
      prepare: () => ({
        first: async () => {
          throw new Error("D1 connection temporarily unavailable");
        },
      }),
    } as unknown as Pick<D1Database, "prepare">;

    try {
      await assertMediaManifestSchema(db);
      throw new Error("expected schema assertion to fail");
    } catch (error) {
      expect(String(error)).toMatch(/temporarily unavailable/);
      expect(isMediaManifestSchemaError(error)).toBe(false);
    }
  });
});
