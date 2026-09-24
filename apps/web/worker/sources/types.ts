import type { MediaCandidate, MediaManifest } from "../media.js";

export type SourceLanguage = "en" | "vi";

export interface FetchedItemSource {
  kind: "source" | "support" | "discussion";
  author?: string;
  postedAt?: number;
  quote?: string;
  url?: string;
}

export interface FetchedItem {
  externalId?: string;
  url: string;
  title: string;
  summary?: string;
  publishedAt: number;
  points?: number;
  comments?: number;
  sources?: FetchedItemSource[];
  /** Legacy single-image field retained for existing adapters and rows. */
  imageUrl?: string;
  /** Explicit source language metadata; never inferred by the QA path. */
  sourceLang?: SourceLanguage;
  /** Untrusted candidates emitted by source metadata, before normalization. */
  media?: MediaCandidate[];
  /** Normalized, bounded manifest used by the ingest write path. */
  mediaManifest?: MediaManifest;
}

export interface SourceAdapter {
  type: string;
  fetchItems(
    config: Record<string, unknown>,
    sinceEpochSec: number
  ): Promise<FetchedItem[]>;
}
