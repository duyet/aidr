import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { bearerHeaders } from "../../lib/clerk-user";
import { useLang } from "../../lib/lang-context";
import { submitStory } from "../../lib/submit-fn";

export function SubmitForm({
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
            ...bearerHeaders(token),
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
