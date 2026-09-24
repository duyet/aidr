export type Lang = "en" | "vi";

export interface ItemSource {
  kind: string; // source | support | discussion
  author: string | null;
  posted_at: number | null;
  quote: string | null;
  url: string | null;
}

export interface FeedItem {
  id: string;
  url: string;
  title: string;
  title_vi: string | null;
  summary: string | null;
  summary_vi: string | null;
  category: string | null;
  published_at: number;
  points: number;
  comments: number;
  rank_score: number;
  source_id: string;
  tags: string[];
  sources: ItemSource[];
  llm_tokens: number;
  image_url: string | null;
  /** Set only on SSR feed items, which ship without summary/sources to
   * keep the dehydrated payload small. When true the row lazily refetches
   * the full story from /api/story on first expand. Never set by
   * /api/feed or /api/story — their items are always complete. */
  lazyDetail?: boolean;
}

export interface TldrBullet {
  text: string;
  item_ids?: string[];
  /** Story og/thumbnail for the first linked item that has one.
   * Additive read-time field — not stored on `tldr_snapshots`. */
  image_url?: string | null;
}

export interface DayGroup {
  date: string; // YYYY-MM-DD
  items: FeedItem[];
  categoryCounts: Record<string, number>;
}

export interface FeedResponse {
  /** Selected locale/permalink language on public API responses. */
  lang?: Lang;
  /** Public feed/story payloads intentionally retain both translations. */
  available_langs?: readonly ["en", "vi"];
  tldr: {
    date: string;
    bullets_en: TldrBullet[];
    bullets_vi: TldrBullet[];
  } | null;
  days: DayGroup[];
  categories: { name: string; count: number }[];
  trending: { tag: string; count: number }[];
  /** Self-learned entity/model keywords for title highlight. */
  learnedKeywords?: string[];
  totalStories: number;
  updatedAt: number;
  /**
   * Epoch seconds from the newest published item's initial `fetched_at`
   * value. This is an item-level timestamp, not workflow completion.
   */
  lastFetchedAt: number | null;
  /** True when older published days exist beyond this page. */
  hasMore: boolean;
}
