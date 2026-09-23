import { useEffect, useState } from "react";
import type { FeedItem } from "../../lib/types";

/** Fetches a story by id prefix — undefined while loading, null on a miss. */
export function useStoryItem(activeId: string) {
  const [item, setItem] = useState<FeedItem | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setItem(undefined);
    fetch(`/api/story/${encodeURIComponent(activeId)}`)
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
  }, [activeId]);

  return item;
}
