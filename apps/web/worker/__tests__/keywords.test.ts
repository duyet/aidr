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

  it("matches builder frameworks, platforms, and data tooling by name", () => {
    for (const title of [
      "LangGraph 1.2 adds durable checkpoints",
      "CrewAI raises Series B",
      "AutoGen 0.6 rewrites its runtime",
      "Mastra ships workflow suspend and resume",
      "Pydantic AI gets typed tool retries",
      "LlamaIndex launches a parsing service",
      "Cloudflare expands Workers AI catalog",
      "OpenAI Agents SDK adds sandboxes",
      "Vercel AI SDK 6 is out",
      "Benchmarking vector databases at a billion rows",
      "How we cut embeddings cost by 80%",
      "Databricks lakehouse adds feature stores",
      "PyTorch 3.0 released",
      "SGLang beats TensorRT on throughput",
    ]) {
      expect(isAiRelatedTitle(title), title).toBe(true);
    }
  });

  it("matches inflected stems, not only the bare stem", () => {
    // Each stem used to end at \\b, so "fine-tuning" and "agents" slipped
    // through. The Cloudflare Clef post was filtered out in prod this way.
    for (const title of [
      "Introducing Clef: our open-source decision models, and new RL fine-tuning platform",
      "New fine-tuning API",
      "We fine-tuned a small model",
      "Fine-tune once, serve anywhere",
      "Coding agents in production",
      "Transformers 5 drops TensorFlow",
      "New benchmarks for long context",
      "Why LLMs hallucinate",
      "Two new AI labs open in Paris",
    ]) {
      expect(isAiRelatedTitle(title), title).toBe(true);
    }
  });

  it("does not match generic engineering words on their own", () => {
    for (const title of [
      "A new framework for city budgets",
      "Our data pipeline migration to a new warehouse",
      "Best tools for woodworking",
      "Stripe SDK 12 drops Node 16",
      "ETL jobs at a bank",
      "Embedding a tweet in your blog",
    ]) {
      expect(isAiRelatedTitle(title), title).toBe(false);
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
