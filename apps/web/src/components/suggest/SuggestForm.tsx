import { useEffect, useState } from "react";
import { bearerHeaders } from "../../lib/clerk-user";
import { submitSuggestion } from "../../lib/suggest-fn";
import type { Lang } from "../../lib/types";

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
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialText) return;
    setOpen(true);
    setText(`"${initialText}" → `);
    onInitialTextConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  if (status === "sent") {
    return (
      <span className="text-xs text-muted-foreground">
        {lang === "vi"
          ? "Đã gửi — đang chờ duyệt"
          : "Submitted — pending review"}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-accent underline underline-offset-2 hover:no-underline"
      >
        {lang === "vi" ? "Góp ý bản dịch" : "Suggest better translation"}
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
          await submitSuggestion({
            data: {
              item_id: itemId,
              field,
              suggestion: text,
              user_id: userId,
              user_name: userName,
            },
            ...bearerHeaders(token),
          });
          setStatus("sent");
        } catch (err) {
          setStatus("error");
          setError(err instanceof Error ? err.message : null);
        }
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={
          lang === "vi"
            ? "Đề xuất bản dịch tốt hơn..."
            : "Suggest a better translation..."
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
