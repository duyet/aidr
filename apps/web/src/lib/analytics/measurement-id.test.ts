import { describe, expect, it } from "vitest";
import {
  DEFAULT_GA_MEASUREMENT_ID,
  resolveMeasurementId,
} from "./measurement-id";

describe("resolveMeasurementId", () => {
  it("defaults to the public GA4 client id when env is empty", () => {
    expect(DEFAULT_GA_MEASUREMENT_ID).toBe("G-HXJPPQVYQN");
    expect(resolveMeasurementId(undefined)).toBe("G-HXJPPQVYQN");
    expect(resolveMeasurementId(null)).toBe("G-HXJPPQVYQN");
    expect(resolveMeasurementId("")).toBe("G-HXJPPQVYQN");
    expect(resolveMeasurementId("   ")).toBe("G-HXJPPQVYQN");
  });

  it("uses a non-empty env override", () => {
    expect(resolveMeasurementId("G-OTHER")).toBe("G-OTHER");
  });
});
