import { btnClass, fieldClass, primaryBtnClass } from "./lib";

export function MailActionBar({
  busy,
  subscriberCount,
  testEmail,
  onTestEmailChange,
  message,
  onWrap,
  onPreview,
  onSave,
  onSend,
}: {
  busy: string | null;
  subscriberCount: number;
  testEmail: string;
  onTestEmailChange: (value: string) => void;
  message: string | null;
  onWrap: () => void;
  onPreview: () => void;
  onSave: () => void;
  onSend: (test: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={btnClass}
        disabled={busy !== null}
        onClick={onWrap}
      >
        {busy === "wrap" ? "Wrapping…" : "AI wrap"}
      </button>
      <button
        type="button"
        className={btnClass}
        disabled={busy !== null}
        onClick={onPreview}
      >
        {busy === "preview" ? "Previewing…" : "Preview"}
      </button>
      <button
        type="button"
        className={btnClass}
        disabled={busy !== null}
        onClick={onSave}
      >
        {busy === "save" ? "Saving…" : "Save draft"}
      </button>
      <input
        className={`${fieldClass} max-w-56`}
        value={testEmail}
        onChange={(e) => onTestEmailChange(e.target.value)}
        aria-label="Test recipient"
      />
      <button
        type="button"
        className={btnClass}
        disabled={busy !== null}
        onClick={() => onSend(true)}
      >
        {busy === "test" ? "Sending…" : "Send test"}
      </button>
      <button
        type="button"
        className={primaryBtnClass}
        disabled={busy !== null || subscriberCount === 0}
        onClick={() => {
          if (
            window.confirm(
              `Send to ${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"}?`
            )
          ) {
            onSend(false);
          }
        }}
      >
        {busy === "send" ? "Sending…" : `Send to ${subscriberCount}`}
      </button>
      {message && (
        <span className="text-sm text-muted-foreground">{message}</span>
      )}
    </div>
  );
}
