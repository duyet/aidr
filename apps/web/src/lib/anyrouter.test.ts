import { describe, expect, it } from "vitest";
import { anyrouterModelUrl, isValidAnyrouterModel } from "./anyrouter";

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
