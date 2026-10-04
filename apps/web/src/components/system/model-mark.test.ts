import { describe, expect, it } from "vitest";
import { modelMonogram } from "./model-mark";

describe("model monograms", () => {
  it("gives each named family one mark, shared by every id in that family", () => {
    const gemma31 = modelMonogram("google/gemma-4-31b");
    const gemma26 = modelMonogram("google/gemma-4-26b-a4b-it");
    const gemini = modelMonogram("google/gemini-3.5-flash");
    const glm = modelMonogram("z-ai/glm-4.6");
    const glmBare = modelMonogram("glm-5.3-flash");

    expect(gemma31).toEqual(gemma26);
    expect(gemma31).toMatchObject({ family: "gemma", letters: "Ge" });
    expect(gemini).toMatchObject({ family: "gemini", letters: "Gm" });
    expect(glm).toEqual(glmBare);
    expect(glm).toMatchObject({ family: "glm", letters: "GL" });
    expect(gemma31?.tone).not.toBe(gemini?.tone);
    expect(gemma31?.tone).not.toBe(glm?.tone);
    expect(gemini?.tone).not.toBe(glm?.tone);
  });

  it("marks the other families the run panel can render", () => {
    expect(modelMonogram("stealth/space-bunny-alpha")).toMatchObject({
      family: "space-bunny",
      letters: "Sb",
    });
    expect(modelMonogram("deepseek/deepseek-v4.1-flash")?.letters).toBe("De");
    expect(modelMonogram("minimax/m3")?.letters).toBe("Mx");
    expect(modelMonogram("nvidia/nemotron-3-ultra")?.letters).toBe("Ne");
    expect(modelMonogram("x-ai/grok-4.7")?.letters).toBe("Gk");
    expect(modelMonogram("meta/llama-3.3")?.letters).toBe("Ll");
    expect(modelMonogram("meta/muse-glimmer-30b")?.letters).toBe("Mu");
    expect(modelMonogram("inclusionai/ling-3.0-flash-sante")?.letters).toBe(
      "Li"
    );
    expect(modelMonogram("qwen/qwen-3")?.letters).toBe("Qw");
    expect(modelMonogram("dots-studio/dots-3-note-preview")?.letters).toBe(
      "Do"
    );
    expect(modelMonogram("openai/gpt-5.2")?.letters).toBe("Gp");
    expect(modelMonogram("anthropic/claude-opus-4-5")?.letters).toBe("Cl");
    expect(modelMonogram("mistralai/mistral-small")?.letters).toBe("Mi");
  });

  it("still marks an id from a family we have not named", () => {
    const first = modelMonogram("nex-agi/foo-1");
    const again = modelMonogram("nex-agi/foo-1");
    expect(first).toEqual(again);
    expect(first?.letters).toBe("Fo");
    expect(first?.tone).toMatch(/^bg-/);
    expect(modelMonogram("not a model")?.letters).toBe("No");
  });

  it("draws nothing for a blank id", () => {
    expect(modelMonogram("")).toBeNull();
    expect(modelMonogram("   ")).toBeNull();
  });
});
