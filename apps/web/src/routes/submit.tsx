import { ErrorBoundary } from "@aidr/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useClerkModule } from "../lib/clerk-user";
import { useLang } from "../lib/lang-context";
import { pageHead } from "../lib/seo";
import {
  fetchMySubmissions,
  type Submission,
  submitStory,
} from "../lib/submit-fn";

export const Route = createFileRoute("/submit")({
  head: () =>
    pageHead({
      path: "/submit",
      title: "Submit a story | AI News",
    }),
  component: SubmitPage,
});

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

function SubmissionsList({
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
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
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

function SubmitForm({
  userId,
  userName,
  getToken,
  onSubmitted,
}: {
  userId: string;
  userName: string;
  getToken: () => Promise<string | null>;
  onSubmitted: () => void;
}) {
  const lang = useLang();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(false), 6000);
    return () => window.clearTimeout(id);
  }, [banner]);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("sending");
        setError(null);
        try {
          const token = await getToken();
          await submitStory({
            data: { url, title, note, user_id: userId, user_name: userName },
            ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          });
          setUrl("");
          setTitle("");
          setNote("");
          setStatus("idle");
          setBanner(true);
          onSubmitted();
        } catch (err) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Failed to submit");
        }
      }}
    >
      {banner ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
        >
          <p>
            {lang === "vi"
              ? "Đã gửi. Bài sẽ được AI thẩm định trước khi lên trang."
              : "Sent. Your story will be AI-reviewed before it appears on the site."}
          </p>
          <button
            type="button"
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setBanner(false)}
          >
            {lang === "vi" ? "Đóng" : "Dismiss"}
          </button>
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">
          URL
        </span>
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">
          {lang === "vi" ? "Tiêu đề (không bắt buộc)" : "Title (optional)"}
        </span>
        <input
          type="text"
          maxLength={300}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">
          {lang === "vi" ? "Ghi chú (không bắt buộc)" : "Note (optional)"}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {lang === "vi"
          ? "Bài gửi sẽ được AI thẩm định và chấm điểm. Không phải bài nào cũng được đăng — chỉ những tin được đánh giá là liên quan và chất lượng mới xuất hiện trên trang."
          : "Submissions are reviewed and rated by AI. Not all submissions will be published — only stories judged relevant and high-quality appear in the feed."}{" "}
        <Link
          to="/about"
          hash="how-it-works"
          className="text-accent underline underline-offset-2 hover:no-underline"
        >
          {lang === "vi"
            ? "Tìm hiểu thêm về cách hoạt động →"
            : "Learn how it works →"}
        </Link>
      </p>
      <button
        type="submit"
        disabled={status === "sending"}
        className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        {lang === "vi" ? "Gửi bài" : "Submit"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function SubmitGate({ useUser, useAuth }: { useUser: any; useAuth: any }) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const lang = useLang();
  const [listKey, setListKey] = useState(0);
  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "vi" ? "Đăng nhập để gửi bài." : "Sign in to submit a story."}
      </p>
    );
  }
  const userName = user.fullName ?? user.username ?? "user";
  return (
    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
      <SubmitForm
        userId={user.id}
        userName={userName}
        getToken={getToken}
        onSubmitted={() => setListKey((n) => n + 1)}
      />
      <SubmissionsList
        userId={user.id}
        lang={lang}
        getToken={getToken}
        refreshKey={listKey}
      />
    </div>
  );
}

function SubmitPage() {
  const lang = useLang();
  const { mod, publishableKey } = useClerkModule();

  return (
    <div className="py-6">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Send className="h-4 w-4 text-accent" aria-hidden />
        {lang === "vi" ? "Gửi bài viết" : "Submit a story"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "vi" ? "Chia sẻ một bài viết." : "Share an AI story."}{" "}
        {lang === "vi"
          ? "Local agent: xem /llms.txt — cùng form, set via=agent, cần đăng nhập."
          : "Local agents: see /llms.txt — same form, set via=agent, sign-in required."}
      </p>

      <div className="mt-6">
        <ErrorBoundary
          fallback={
            <p className="text-sm text-muted-foreground">
              {lang === "vi"
                ? "Đăng nhập để gửi bài."
                : "Sign in to submit a story."}
            </p>
          }
        >
          {!publishableKey || !mod ? (
            <p className="text-sm text-muted-foreground">
              {lang === "vi"
                ? "Đăng nhập để gửi bài."
                : "Sign in to submit a story."}
            </p>
          ) : (
            // No own <ClerkProvider> — __root.tsx mounts the single
            // app-wide one; a second provider crashes the whole page.
            <>
              <mod.SignedOut>
                <ErrorBoundary
                  fallback={
                    <p className="text-sm text-muted-foreground">
                      {lang === "vi"
                        ? "Đăng nhập để gửi bài."
                        : "Sign in to submit a story."}
                    </p>
                  }
                >
                  <mod.SignInButton mode="modal">
                    <button
                      type="button"
                      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                    >
                      {lang === "vi"
                        ? "Đăng nhập để gửi bài"
                        : "Sign in to submit"}
                    </button>
                  </mod.SignInButton>
                </ErrorBoundary>
              </mod.SignedOut>
              <mod.SignedIn>
                <SubmitGate useUser={mod.useUser} useAuth={mod.useAuth} />
              </mod.SignedIn>
            </>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
