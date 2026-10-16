import { describe, expect, it } from "vitest";
import { isMediaManifestSchemaError } from "../media-schema.js";

describe("isMediaManifestSchemaError", () => {
  it("recognizes a missing-column error from a pre-0024 database", () => {
    expect(
      isMediaManifestSchemaError(
        new Error("D1_ERROR SQLITE_ERROR: no such column: media_manifest")
      )
    ).toBe(true);
    expect(
      isMediaManifestSchemaError(
        new Error("D1_ERROR: table items has no column named media_manifest")
      )
    ).toBe(true);
  });

  it("does not mislabel an unrelated D1 outage as a migration error", () => {
    expect(
      isMediaManifestSchemaError(
        new Error("D1 connection temporarily unavailable")
      )
    ).toBe(false);
  });
});
