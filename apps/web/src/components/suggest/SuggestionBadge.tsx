import { useEffect, useState } from "react";
import { fetchSuggestions, type SuggestionSummary } from "../../lib/suggest-fn";
import type { Lang } from "../../lib/types";

export function SuggestionBadge({
  itemId,
  expanded,
  lang,
}: {
  itemId: string;
  expanded: boolean;
  lang: Lang;
}) {
  const [suggestions, setSuggestions] = useState<SuggestionSummary[] | null>(
    null
  );

  useEffect(() => {
    if (!expanded || suggestions !== null) return;
    let cancelled = false;
    fetchSuggestions({ data: { item_id: itemId } })
      .then((res) => {
        if (!cancelled) setSuggestions(res);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, itemId, suggestions]);

  if (!expanded || !suggestions || suggestions.length === 0) return null;

  const names = [...new Set(suggestions.map((s) => s.user_name))].slice(0, 3);
  return (
    <span className="text-xs text-muted-foreground">
      {suggestions.length}{" "}
      {lang === "vi"
        ? "góp ý"
        : suggestions.length === 1
          ? "suggestion"
          : "suggestions"}
      {names.length > 0 && <> · {names.join(", ")}</>}
    </span>
  );
}
