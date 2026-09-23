import { adminActionBtnClass } from "./lib";

/** A pipeline trigger row: one busy-aware button plus its last result. */
export function AdminAction({
  busy,
  busyLabel,
  label,
  onClick,
  result,
  className = "mt-2 flex flex-wrap items-center gap-2",
}: {
  busy: boolean;
  busyLabel: string;
  label: string;
  onClick: () => void;
  result?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={adminActionBtnClass}
      >
        {busy ? busyLabel : label}
      </button>
      {result && (
        <span className="text-xs text-muted-foreground">{result}</span>
      )}
    </div>
  );
}
