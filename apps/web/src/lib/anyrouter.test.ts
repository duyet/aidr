import { describe, expect, it } from "vitest";
import {
  ANYROUTER_LOGO_URL,
  anyrouterModelUrl,
  isValidAnyrouterModel,
  JEV_LOGO_URL,
  logosForModels,
  modelLogoUrl,
  POOLSIDE_LOGO_URL,
} from "./anyrouter";

describe("model logos", () => {
  it("hotlinks the public AnyRouter provider marks", () => {
    expect(modelLogoUrl("anyrouter/auto")).toBe(ANYROUTER_LOGO_URL);
    expect(modelLogoUrl("@preset/aidr")).toBe(ANYROUTER_LOGO_URL);
    expect(modelLogoUrl("typesafe/jev")).toBe(JEV_LOGO_URL);
    expect(modelLogoUrl("poolside/laguna-s-2.1")).toBe(POOLSIDE_LOGO_URL);
    expect(modelLogoUrl("google/gemini-3")).toBeNull();
    expect(
      logosForModels([
        "typesafe/jev",
        "anyrouter/auto",
        "poolside/laguna-s-2.1",
      ])
    ).toEqual({
      "typesafe/jev": JEV_LOGO_URL,
      "anyrouter/auto": ANYROUTER_LOGO_URL,
      "poolside/laguna-s-2.1": POOLSIDE_LOGO_URL,
    });
  });
});

describe("AnyRouter model links", () => {
  it("encodes model path segments while preserving provider/model paths", () => {
    expect(anyrouterModelUrl("google/gemini-3")).toBe(
      "https://anyrouter.dev/model/google/gemini-3?ref=aidr.today"
    );
    expect(anyrouterModelUrl("google/gemini 3")).toContain(
      "google%2Fgemini%203"
    );
  });

  it("rejects path traversal and query-like model ids", () => {
    expect(isValidAnyrouterModel("../secret")).toBe(false);
    expect(isValidAnyrouterModel("google/gemini?x=1")).toBe(false);
    expect(isValidAnyrouterModel("")).toBe(false);
    expect(anyrouterModelUrl("google/gemini?x=1")).toContain(
      "google%2Fgemini%3Fx%3D1"
    );
  });
});
