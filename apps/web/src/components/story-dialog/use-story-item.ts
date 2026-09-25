import { useEffect, useState } from "react";
import { withLang } from "../../lib/locale-url";
import type { FeedItem, Lang } from "../../lib/types";

export function storyApiUrl(id: string, lang: Lang): string {
  return withLang(`/api/story/${encodeURIComponent(id)}`, lang);
}

/** Fetches a story by id prefix — undefined while loading, null on a miss. */
export function useStoryItem(activeId: string, lang: Lang) {
  const [item, setItem] = useState<FeedItem | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setItem(undefined);
    fetch(storyApiUrl(activeId, lang))
      .then((res) => (res.ok ? (res.json() as Promise<FeedItem>) : null))
      .then((res) => {
        if (!cancelled) setItem(res);
      })
      .catch(() => {
        if (!cancelled) setItem(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, lang]);

  return item;
}
