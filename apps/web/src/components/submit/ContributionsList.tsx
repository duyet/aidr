import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@aidr/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Contribution,
  ContributionCursor,
} from "../../../worker/contributions.js";
import { bearerHeaders } from "../../lib/clerk-user";
import { timeAgo } from "../../lib/lang";
import { storyPath } from "../../lib/slug";
import { fetchMyContributions } from "../../lib/suggest-fn";
import { SuggestionVerdict, verdictLabel } from "../suggest/SuggestionVerdict";

type KindFilter = "all" | "suggestion" | "submission";
type StatusGroup = "all" | "applied" | "waiting" | "not_applied";

/** Collapses every status both tables use into the three a reader cares
 *  about, so the filter works the same for edits and submissions. */
export function statusGroup(status: string): Exclude<StatusGroup, "all"> {
  if (status === "accepted") return "applied";
  if (status === "rejected") return "not_applied";
  return "waiting";
}

const GROUP_DOT: Record<Exclude<StatusGroup, "all">, string> = {
  applied: "bg-emerald-500",
  waiting: "bg-amber-500",
  not_applied: "bg-muted-foreground/60",
};

function fmtDate(ms: number, lang: "en" | "vi") {
  return new Date(ms).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function kindLabel(c: Contribution, vi: boolean): string {
  if (c.kind === "submission") return vi ? "Bài gửi" : "Submission";
  const field =
    c.field === "title"
      ? vi
        ? "tiêu đề"
        : "title"
      : vi
        ? "tóm tắt"
        : "summary";
  return `${vi ? "Góp ý" : "Edit"} · ${field} · ${(c.lang ?? "vi").toUpperCase()}`;
}

function statusText(c: Contribution, lang: "en" | "vi"): string {
  const adjusted = Boolean(c.applied_text && c.applied_text !== c.text);
  return verdictLabel(c.status, adjusted, lang);
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ContributionDetail({
  c,
  lang,
}: {
  c: Contribution;
  lang: "en" | "vi";
}) {
  const vi = lang === "vi";
  return (
    <div className="space-y-4 px-6 pb-6 text-sm">
      {c.item_id ? (
        <a
          href={storyPath({ id: c.item_id }, lang)}
          className="block font-medium hover:text-accent"
        >
          {c.item_title ?? c.item_id.slice(0, 8)}
        </a>
      ) : c.item_title ? (
        <p className="font-medium">{c.item_title}</p>
      ) : null}
      {c.url ? (
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-xs text-muted-foreground hover:text-accent"
        >
          {c.url}
        </a>
      ) : null}

      {c.kind === "suggestion" ? (
        <>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {vi ? "Bạn đã viết" : "You wrote"}
            </p>
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3">
              {c.text}
            </p>
          </div>
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
        <div className="space-y-2">
          <p className="text-xs">
            {statusText(c, lang)}
            {c.rating !== null ? (
              <span className="ml-2 tabular-nums text-muted-foreground">
                {vi ? "Điểm" : "Rating"} {Math.round(c.rating * 100)}/100
              </span>
            ) : null}
          </p>
          {c.review_note ? (
            <p className="text-muted-foreground">{c.review_note}</p>
          ) : null}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <div>
          <dt>{vi ? "Gửi lúc" : "Sent"}</dt>
          <dd className="text-foreground">{fmtDate(c.created_at, lang)}</dd>
        </div>
        <div>
          <dt>{vi ? "Duyệt lúc" : "Reviewed"}</dt>
          <dd className="text-foreground">
            {c.reviewed_at ? fmtDate(c.reviewed_at, lang) : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** The signed-in reader's own edit suggestions and story submissions as a
 *  compact, filterable list; each row opens its full detail in a dialog, so
 *  the page stays scannable however long the history grows. */
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
  const [kind, setKind] = useState<KindFilter>("all");
  const [group, setGroup] = useState<StatusGroup>("all");
  const [open, setOpen] = useState<Contribution | null>(null);
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

  const counts = useMemo(() => {
    const out = { applied: 0, waiting: 0, not_applied: 0 };
    for (const c of items ?? []) out[statusGroup(c.status)]++;
    return out;
  }, [items]);

  const shown = (items ?? []).filter(
    (c) =>
      (kind === "all" || c.kind === kind) &&
      (group === "all" || statusGroup(c.status) === group)
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={kind === "all"} onClick={() => setKind("all")}>
          {vi ? "Tất cả" : "All"}
        </Chip>
        <Chip
          active={kind === "suggestion"}
          onClick={() => setKind("suggestion")}
        >
          {vi ? "Góp ý" : "Edits"}
        </Chip>
        <Chip
          active={kind === "submission"}
          onClick={() => setKind("submission")}
        >
          {vi ? "Bài gửi" : "Submissions"}
        </Chip>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <Chip active={group === "all"} onClick={() => setGroup("all")}>
          {vi ? "Mọi trạng thái" : "Any status"}
        </Chip>
        <Chip active={group === "applied"} onClick={() => setGroup("applied")}>
          {vi ? "Đã áp dụng" : "Applied"} {counts.applied}
        </Chip>
        <Chip active={group === "waiting"} onClick={() => setGroup("waiting")}>
          {vi ? "Đang chờ" : "Waiting"} {counts.waiting}
        </Chip>
        <Chip
          active={group === "not_applied"}
          onClick={() => setGroup("not_applied")}
        >
          {vi ? "Không áp dụng" : "Not applied"} {counts.not_applied}
        </Chip>
      </div>

      {items === null ? (
        <p className="text-sm text-muted-foreground">
          {vi ? "Đang tải…" : "Loading…"}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {items.length === 0
            ? vi
              ? "Chưa có góp ý hay bài gửi nào."
              : "No suggestions or submissions yet."
            : vi
              ? "Không có mục nào khớp bộ lọc."
              : "Nothing matches these filters."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-md border border-border">
          {shown.map((c) => (
            <li key={`${c.kind}-${c.id}`}>
              <button
                type="button"
                onClick={() => setOpen(c)}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span
                  aria-label={statusText(c, lang)}
                  title={statusText(c, lang)}
                  className={`size-2 rounded-full ${GROUP_DOT[statusGroup(c.status)]}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {c.item_title ?? c.url ?? c.item_id?.slice(0, 8) ?? "—"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {kindLabel(c, vi)}
                    {c.kind === "suggestion" ? ` · “${c.text}”` : ""}
                  </span>
                </span>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {c.rating !== null ? (
                    <span className="block text-foreground">
                      {Math.round(c.rating * 100)}
                    </span>
                  ) : null}
                  <time
                    dateTime={new Date(c.created_at).toISOString()}
                    suppressHydrationWarning
                  >
                    {timeAgo(Math.floor(c.created_at / 1000), Date.now(), lang)}
                  </time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {next ? (
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
      ) : null}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>{kindLabel(open, vi)}</SheetTitle>
              </SheetHeader>
              <ContributionDetail c={open} lang={lang} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
