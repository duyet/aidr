import { useCallback, useEffect, useState } from "react";
import type {
  Contribution,
  ContributionCursor,
} from "../../../worker/contributions.js";
import { bearerHeaders } from "../../lib/clerk-user";
import { storyPath } from "../../lib/slug";
import { fetchMyContributions } from "../../lib/suggest-fn";
import { SuggestionVerdict } from "../suggest/SuggestionVerdict";

function submissionLabel(status: string, lang: "en" | "vi") {
  const labels =
    lang === "vi"
      ? { pending: "Đang chờ", accepted: "Đã duyệt", rejected: "Từ chối" }
      : { pending: "Pending", accepted: "Accepted", rejected: "Rejected" };
  return labels[status as keyof typeof labels] ?? status;
}

function fmtDate(ms: number, lang: "en" | "vi") {
  return new Date(ms).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** The signed-in reader's own edit suggestions and story submissions,
 *  newest first, with the reviewer's rating, reasoning and published text. */
export function ContributionsList({
  lang,
  getToken,
  refreshKey,
}: {
  lang: "en" | "vi";
  getToken: () => Promise<string | null>;
  refreshKey: number;
}) {
  const [items, setItems] = useState<Contribution[] | null>(null);
  const [next, setNext] = useState<ContributionCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const vi = lang === "vi";

  const load = useCallback(
    async (before: ContributionCursor | null) => {
      const token = await getToken();
      return fetchMyContributions({
        data: { before },
        ...bearerHeaders(token),
      });
    },
    [getToken]
  );

  useEffect(() => {
    let cancelled = false;
    load(null)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNext(page.next);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [load, refreshKey]);

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await load(next);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setNext(page.next);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {vi ? "Đóng góp của bạn" : "Your contributions"}
      </h2>
      {items === null ? (
        <p className="text-sm text-muted-foreground">
          {vi ? "Đang tải…" : "Loading…"}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {vi
            ? "Chưa có góp ý hay bài gửi nào."
            : "No suggestions or submissions yet."}
        </p>
      ) : (
        <ul className="space-y-0">
          {items.map((c) => (
            <li
              key={`${c.kind}-${c.id}`}
              className="space-y-1 border-b border-border py-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider">
                  {c.kind === "suggestion"
                    ? `${vi ? "Góp ý" : "Edit"} · ${
                        c.field === "title"
                          ? vi
                            ? "tiêu đề"
                            : "title"
                          : vi
                            ? "tóm tắt"
                            : "summary"
                      } · ${(c.lang ?? "vi").toUpperCase()}`
                    : vi
                      ? "Bài gửi"
                      : "Submission"}
                </span>
                <time dateTime={new Date(c.created_at).toISOString()}>
                  {fmtDate(c.created_at, lang)}
                </time>
                {c.reviewed_at && (
                  <span>
                    · {vi ? "duyệt" : "reviewed"} {fmtDate(c.reviewed_at, lang)}
                  </span>
                )}
              </div>
              {c.kind === "suggestion" ? (
                <>
                  {c.item_id && (
                    <a
                      href={storyPath({ id: c.item_id }, lang)}
                      className="block truncate font-medium hover:text-accent"
                    >
                      {c.item_title ?? c.item_id.slice(0, 8)}
                    </a>
                  )}
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    “{c.text}”
                  </p>
                  <SuggestionVerdict
                    status={c.status}
                    suggestion={c.text}
                    appliedText={c.applied_text}
                    rating={c.rating}
                    note={c.review_note}
                    lang={lang}
                  />
                </>
              ) : (
                <>
                  {c.item_id ? (
                    <a
                      href={storyPath({ id: c.item_id }, lang)}
                      className="block truncate font-medium hover:text-accent"
                    >
                      {c.item_title}
                    </a>
                  ) : (
                    <span className="block truncate font-medium">
                      {c.item_title}
                    </span>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full border px-2 py-0 ${
                        c.status === "accepted"
                          ? "border-accent text-accent"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {submissionLabel(c.status, lang)}
                    </span>
                    {c.rating !== null && (
                      <span className="text-muted-foreground tabular-nums">
                        {vi ? "Điểm" : "Rating"} {Math.round(c.rating * 100)}
                        /100
                      </span>
                    )}
                  </div>
                  {c.review_note && (
                    <p className="text-xs text-muted-foreground">
                      {c.review_note}
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {next && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="rounded-md border border-border px-3 py-1 text-xs hover:text-accent disabled:opacity-50"
        >
          {loadingMore
            ? vi
              ? "Đang tải…"
              : "Loading…"
            : vi
              ? "Xem thêm"
              : "Load more"}
        </button>
      )}
    </div>
  );
}
