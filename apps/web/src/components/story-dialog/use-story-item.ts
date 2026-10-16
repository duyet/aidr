import { useCallback, useEffect, useState } from "react";
import { withLang } from "../../lib/locale-url";
import type { FeedItem, Lang } from "../../lib/types";

export function storyApiUrl(id: string, lang: Lang): string {
  return withLang(`/api/story/${encodeURIComponent(id)}`, lang);
}

/** `missing` is a 404. `failed` is a 5xx or a request that never landed. */
export type StoryItemState =
  | { status: "loading" }
  | { status: "ready"; item: FeedItem }
  | { status: "missing" }
  | { status: "failed" };

/** Fetches a story by id prefix. `retry` fetches it again. */
export function useStoryItem(
  activeId: string,
  lang: Lang
): { state: StoryItemState; retry: () => void } {
  const [state, setState] = useState<StoryItemState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(storyApiUrl(activeId, lang))
      .then(async (res): Promise<StoryItemState> => {
        if (res.ok) return { status: "ready", item: await res.json() };
        return { status: res.status === 404 ? "missing" : "failed" };
      })
      .catch((): StoryItemState => ({ status: "failed" }))
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, lang, attempt]);

  return { state, retry };
}
