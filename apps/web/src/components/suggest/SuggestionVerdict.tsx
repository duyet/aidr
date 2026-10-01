import type { AppliedChange } from "../../../worker/contributions.js";
import type { Lang } from "../../lib/types";
import { type DiffPart, wordDiff } from "../../lib/word-diff";

export type VerdictStatus =
  | "pending"
  | "reviewing"
  | "accepted"
  | "needs_review"
  | "rejected";

export function verdictLabel(
  status: string,
  adjusted: boolean,
  lang: Lang
): string {
  const vi = lang === "vi";
  switch (status) {
    case "accepted":
      return adjusted
        ? vi
          ? "Đã áp dụng (có chỉnh)"
          : "Applied with adjustments"
        : vi
          ? "Đã áp dụng"
          : "Applied";
    case "needs_review":
      return vi ? "Chờ biên tập viên" : "Waiting for an editor";
    case "rejected":
      return vi ? "Không áp dụng" : "Not applied";
    default:
      return vi ? "Đang duyệt" : "Reviewing";
  }
}

export function isAdjusted(
  suggestion: string,
  appliedText: string | null
): boolean {
  return Boolean(appliedText) && appliedText?.trim() !== suggestion.trim();
}

/** The reviewer's verdict on one suggestion: rating, reason, and for an
 *  applied edit the published text — as a word diff against what the reader
 *  wrote when the reviewer adjusted it. */
export function SuggestionVerdict({
  status,
  suggestion,
  appliedText,
  rating,
  note,
  lang,
  changes,
}: {
  status: string;
  suggestion: string;
  appliedText: string | null;
  rating: number | null;
  note: string | null;
  lang: Lang;
  /** Per-field edits of a free-form suggestion. When present, each field is
   *  shown as a diff of the story text before and after. */
  changes?: AppliedChange[];
}) {
  const perField = (changes ?? []).length > 0;
  const adjusted = !perField && isAdjusted(suggestion, appliedText);
  const tone =
    status === "accepted"
      ? "border-accent text-accent"
      : "border-border text-muted-foreground";
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0 ${tone}`}>
          {verdictLabel(status, adjusted, lang)}
        </span>
        {rating !== null && (
          <span className="text-muted-foreground tabular-nums">
            {lang === "vi" ? "Điểm" : "Rating"} {Math.round(rating * 100)}/100
          </span>
        )}
      </div>
      {note && <p className="text-muted-foreground">{note}</p>}
      {status === "accepted" && perField
        ? changes?.map((change) => (
            <div key={`${change.lang}.${change.field}`} className="space-y-1">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                {fieldLabel(change, lang)}
              </p>
              <p className="whitespace-pre-wrap rounded-md border border-border p-2 text-sm">
                {change.before
                  ? renderDiff(wordDiff(change.before, change.after))
                  : change.after}
              </p>
            </div>
          ))
        : status === "accepted" &&
          appliedText && (
            <p className="whitespace-pre-wrap rounded-md border border-border p-2 text-sm">
              {adjusted
                ? renderDiff(wordDiff(suggestion, appliedText))
                : appliedText}
            </p>
          )}
    </div>
  );
}

function fieldLabel(change: AppliedChange, lang: Lang): string {
  const vi = lang === "vi";
  const field =
    change.field === "title"
      ? vi
        ? "Tiêu đề"
        : "Title"
      : vi
        ? "Tóm tắt"
        : "Summary";
  return `${field} · ${change.lang.toUpperCase()}`;
}

function renderDiff(parts: DiffPart[]) {
  return parts.map((part, i) =>
    part.kind === "same" ? (
      <span key={i}>{part.text}</span>
    ) : part.kind === "added" ? (
      <ins key={i} className="bg-accent/15 no-underline">
        {part.text}
      </ins>
    ) : (
      <del key={i} className="text-muted-foreground">
        {part.text}
      </del>
    )
  );
}
