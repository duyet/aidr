import { useEffect, useState } from "react";
import type { SuggestionStatusView } from "../../../worker/contributions.js";
import { bearerHeaders } from "../../lib/clerk-user";
import { fetchSuggestionStatus, submitSuggestion } from "../../lib/suggest-fn";
import type { Lang } from "../../lib/types";
import { SuggestionVerdict } from "./SuggestionVerdict";

const POLL_INTERVAL_MS = 2500;
/** Past this the review is left to the hourly step; the reader is pointed
 *  at their contributions page instead of a spinner that never ends. */
const POLL_TIMEOUT_MS = 45_000;

type Field = "title" | "summary";

export function SuggestForm({
  itemId,
  field,
  lang,
  userId,
  userName,
  getToken,
  initialText,
  onInitialTextConsumed,
}: {
  itemId: string;
  field: "title" | "summary";
  lang: Lang;
  userId: string;
  userName: string;
  getToken: () => Promise<string | null>;
  /** Set by the selection-to-suggest floating button — opens the form
   * pre-filled with the selected text as quoted context. */
  initialText?: string;
  onInitialTextConsumed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [targetField, setTargetField] = useState<Field>(
    lang === "en" ? "title" : field
  );
  // Edits target the language on screen. Selection-to-suggest only runs
  // over Vietnamese text (including the bilingual view), so it targets vi.
  const [targetLang, setTargetLang] = useState<Lang>(lang);
  const [status, setStatus] = useState<
    "idle" | "sending" | "reviewing" | "done" | "timeout" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<SuggestionStatusView | null>(null);

  // Poll the owner-only status until the instant review lands a verdict.
  useEffect(() => {
    if (status !== "reviewing" || !submittedId) return;
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const token = await getToken();
        const row = await fetchSuggestionStatus({
          data: { id: submittedId },
          ...bearerHeaders(token),
        });
        if (cancelled) return;
        if (row && row.status !== "pending" && row.status !== "reviewing") {
          setVerdict(row);
          setStatus("done");
          return;
        }
      } catch {
        // A failed poll is retried until the timeout.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setStatus("timeout");
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, submittedId, getToken]);

  useEffect(() => {
    if (!initialText) return;
    setOpen(true);
    setTargetField(field);
    setTargetLang("vi");
    setText(`"${initialText}" → `);
    onInitialTextConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  const vi = lang === "vi";
  if (status === "reviewing") {
    return (
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {vi
          ? "Đã gửi — AI đang duyệt góp ý…"
          : "Submitted — the reviewer is checking it…"}
      </span>
    );
  }
  if (status === "timeout") {
    return (
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {vi
          ? "Vẫn đang duyệt. Xem kết quả ở "
          : "Still reviewing. See the result in "}
        <a href="/submit" className="underline underline-offset-2">
          {vi ? "đóng góp của bạn" : "your contributions"}
        </a>
        .
      </span>
    );
  }
  if (status === "done" && verdict) {
    return (
      <div className="w-full max-w-full" aria-live="polite">
        <SuggestionVerdict
          status={verdict.status}
          suggestion={verdict.suggestion}
          appliedText={verdict.applied_text}
          rating={verdict.rating}
          note={verdict.review_note}
          lang={lang}
        />
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-accent underline underline-offset-2 hover:no-underline"
      >
        {vi ? "Góp ý chỉnh sửa" : "Suggest an edit"}
      </button>
    );
  }

  return (
    <form
      className="mt-2 w-full max-w-full space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setStatus("sending");
        setError(null);
        try {
          const token = await getToken();
          const { id } = await submitSuggestion({
            data: {
              item_id: itemId,
              field: targetField,
              lang: targetLang,
              suggestion: text,
              user_id: userId,
              user_name: userName,
            },
            ...bearerHeaders(token),
          });
          setSubmittedId(id);
          setStatus("reviewing");
        } catch (err) {
          setStatus("error");
          setError(err instanceof Error ? err.message : null);
        }
      }}
    >
      <fieldset className="flex flex-wrap items-center gap-3 text-xs">
        <legend className="sr-only">
          {vi ? "Phần cần sửa" : "Part to edit"}
        </legend>
        {/* English summaries are re-fetched from the source each run, so
            only the English title is editable. */}
        {(targetLang === "en"
          ? (["title"] as const)
          : (["title", "summary"] as const)
        ).map((f) => (
          <label key={f} className="flex items-center gap-1">
            <input
              type="radio"
              name={`suggest-field-${itemId}`}
              value={f}
              checked={targetField === f}
              onChange={() => setTargetField(f)}
            />
            {f === "title"
              ? vi
                ? "Tiêu đề"
                : "Title"
              : vi
                ? "Tóm tắt"
                : "Summary"}
          </label>
        ))}
      </fieldset>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={
          vi
            ? "Viết lại theo cách bạn thấy đúng hơn..."
            : "Rewrite it the way you think is right..."
        }
        className="min-h-16 w-full max-w-full resize-y rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={status === "sending" || !text.trim()}
          className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground disabled:opacity-50"
        >
          {lang === "vi" ? "Gửi" : "Submit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {lang === "vi" ? "Huỷ" : "Cancel"}
        </button>
        {status === "error" && (
          <span className="text-xs text-red-600">
            {error ?? (lang === "vi" ? "Lỗi, thử lại." : "Failed, try again.")}
          </span>
        )}
      </div>
    </form>
  );
}

export function SuggestFormGate({
  itemId,
  field,
  lang,
  useUser,
  useAuth,
  initialText,
  onInitialTextConsumed,
}: {
  itemId: string;
  field: "title" | "summary";
  lang: Lang;
  useUser: any;
  useAuth: any;
  initialText?: string;
  onInitialTextConsumed?: () => void;
}) {
  const { user } = useUser();
  const { getToken } = useAuth();
  if (!user) return null;
  const userName = user.fullName ?? user.username ?? "user";
  return (
    <SuggestForm
      itemId={itemId}
      field={field}
      lang={lang}
      userId={user.id}
      userName={userName}
      getToken={getToken}
      initialText={initialText}
      onInitialTextConsumed={onInitialTextConsumed}
    />
  );
}
