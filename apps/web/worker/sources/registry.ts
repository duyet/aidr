import {
  cleanTitle,
  decodeHtmlEntitiesOnce,
} from "../../src/lib/plain-text.js";
import { anthropicAdapter } from "./anthropic.js";
import { hnAdapter } from "./hn.js";
import { huggingNewsAdapter } from "./huggingnews.js";
import { lobstersAdapter } from "./lobsters.js";
import { marketBriefAdapter } from "./marketbrief.js";
import { rssAdapter } from "./rss.js";
import type { FetchedItem, SourceAdapter } from "./types.js";
import { xaiAdapter } from "./xai.js";

/** Feeds escape headlines once more than XML needs (`&#039;`, `&amp;`) and
 *  wire services prefix them with "UPDATE:". Every adapter's output goes
 *  through here so stored titles and summaries are plain text. The URL, and
 *  with it the item id, is untouched. */
export function normalizeFetchedItem(item: FetchedItem): FetchedItem {
  return {
    ...item,
    title: cleanTitle(item.title) || item.title,
    ...(item.summary !== undefined
      ? { summary: decodeHtmlEntitiesOnce(item.summary) }
      : {}),
  };
}

function normalized(adapter: SourceAdapter): SourceAdapter {
  return {
    type: adapter.type,
    async fetchItems(config, sinceEpochSec) {
      const items = await adapter.fetchItems(config, sinceEpochSec);
      return items.map(normalizeFetchedItem);
    },
  };
}

export const adapters: Record<string, SourceAdapter> = {
  hn: normalized(hnAdapter),
  huggingnews: normalized(huggingNewsAdapter),
  lobsters: normalized(lobstersAdapter),
  rss: normalized(rssAdapter),
  anthropic: normalized(anthropicAdapter),
  marketbrief: normalized(marketBriefAdapter),
  xai: normalized(xaiAdapter),
};
