import { anthropicAdapter } from "./anthropic.js";
import { hnAdapter } from "./hn.js";
import { huggingNewsAdapter } from "./huggingnews.js";
import { lobstersAdapter } from "./lobsters.js";
import { rssAdapter } from "./rss.js";
import type { SourceAdapter } from "./types.js";

export const adapters: Record<string, SourceAdapter> = {
  hn: hnAdapter,
  huggingnews: huggingNewsAdapter,
  lobsters: lobstersAdapter,
  rss: rssAdapter,
  anthropic: anthropicAdapter,
};
