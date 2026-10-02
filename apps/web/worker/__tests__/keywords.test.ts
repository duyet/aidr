import { describe, expect, it } from "vitest";
import { isAiRelatedTitle } from "../sources/keywords.js";

describe("AI title gate", () => {
  it("keeps a new model release, a new kind of model, and a new lab", () => {
    expect(
      isAiRelatedTitle("Acme ships open weights for its first model")
    ).toBe(true);
    expect(isAiRelatedTitle("A new world model for robots")).toBe(true);
    expect(isAiRelatedTitle("Former researchers start an AI lab")).toBe(true);
    expect(isAiRelatedTitle("City council approves the park budget")).toBe(
      false
    );
  });

  it("matches plural model phrases and current product and lab names", () => {
    for (const title of [
      "Kev 1.0 Launches 27B and 9B Open Weight Decision Models",
      "Modulate raises $25M for its voice models and analysis suite",
      "ChatGPT Hits 1.2 Billion Weekly Users",
      "Perplexity Introduces Photon, a retrieval engine",
      "Cohere Launches Embed 5 Models",
      "Xiaomi MiMo-V2.6 Takes No. 1 Open Weight Rank",
      "Manus 2.0 lets users run agents remotely",
      "Meta Muse Integrates Plaid",
      "Black Forest Labs ships a new image model",
      "Runway and Fal Integrate ElevenLabs v4 Voice",
      "DSPy 3.4.0 adds new providers",
      "Trump Rules Out a Super Intelligence Czar",
      "Open TTS Leaderboard for Text-to-Speech",
    ]) {
      expect(isAiRelatedTitle(title), title).toBe(true);
    }
  });

  it("does not match unrelated words that merely contain a keyword", () => {
    for (const title of [
      "Tesla Secures FSD Supervised Approval in Croatia",
      "She will muse on the budget",
      "The soraya festival opens",
    ]) {
      expect(isAiRelatedTitle(title), title).toBe(false);
    }
  });
});
