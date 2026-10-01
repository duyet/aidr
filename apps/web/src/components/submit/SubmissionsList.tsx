import { useEffect, useState } from "react";
import { bearerHeaders } from "../../lib/clerk-user";
import { fetchMySubmissions, type Submission } from "../../lib/submit-fn";

function statusLabel(status: Submission["status"], lang: "en" | "vi") {
  if (lang === "vi") {
    return { pending: "Đang chờ", accepted: "Đã duyệt", rejected: "Từ chối" }[
      status
    ];
  }
  return { pending: "Pending", accepted: "Accepted", rejected: "Rejected" }[
    status
  ];
}

export function SubmissionsList({
  userId,
  lang,
  getToken,
  refreshKey,
}: {
  userId: string;
  lang: "en" | "vi";
  getToken: () => Promise<string | null>;
  refreshKey: number;
}) {
  const [items, setItems] = useState<Submission[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      fetchMySubmissions({
        data: { user_id: userId },
        ...bearerHeaders(token),
      })
        .then((res) => {
          if (!cancelled) setItems(res);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, getToken, refreshKey]);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {lang === "vi" ? "Bài đã gửi" : "Your submissions"}
      </h2>
      {items === null ? (
        <p className="text-sm text-muted-foreground">
          {lang === "vi" ? "Đang tải…" : "Loading…"}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {lang === "vi" ? "Chưa có bài nào." : "No submissions yet."}
        </p>
      ) : (
        items.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border py-2 text-sm"
          >
            <span
              className={`shrink-0 rounded-full border px-2 py-0 text-xs ${
                s.status === "accepted"
                  ? "border-accent text-accent"
                  : "border-border text-muted-foreground"
              }`}
            >
              {statusLabel(s.status, lang)}
            </span>
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            {s.status === "rejected" && s.review_note && (
              <span className="w-full text-xs text-muted-foreground">
                {s.review_note}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
