import type { FeedItem, Lang } from "../../lib/types";

function clipLog(text: string | null): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (value.length <= 90) return value;
  return `${value.slice(0, 89)}…`;
}

function logReason(reason: string, lang: Lang): string {
  const vi = lang === "vi";
  switch (reason) {
    case "correction":
      return vi ? "Sửa câu chữ" : "Wording fix";
    case "suggestion":
      return vi ? "Góp ý" : "Suggestion";
    case "ingest":
      return vi ? "Viết lại khi thu tin" : "Rewritten on ingest";
    case "backfill":
      return vi ? "Thay nội dung đã lưu" : "Replaced stored text";
    case "admin":
      return vi ? "Biên tập" : "Editor";
    default:
      return reason;
  }
}

/** Recent title and summary edits, collapsed. Shared by the expanded story
 * (StoryDetail) and the story page. */
export function ContentHistory({
  item,
  lang,
  className = "not-typeset text-xs text-muted-foreground",
}: {
  item: FeedItem;
  lang: Lang;
  className?: string;
}) {
  const rows = item.content_log;
  if (!rows || rows.length === 0) return null;
  return (
    <details className={className}>
      <summary className="cursor-pointer">
        {lang === "vi" ? "Lịch sử nội dung" : "Content history"} ({rows.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {rows.map((entry, index) => (
          <li key={`${entry.created_at}-${entry.lang}-${entry.field}-${index}`}>
            <span className="text-foreground">
              {new Date(entry.created_at * 1000).toISOString().slice(0, 10)}
            </span>
            {" · "}
            {entry.field === "title"
              ? lang === "vi"
                ? "Tiêu đề"
                : "Title"
              : lang === "vi"
                ? "Tóm tắt"
                : "Summary"}
            {" · "}
            <span className="uppercase">{entry.lang}</span>
            {" · "}
            {logReason(entry.reason, lang)}
            <div lang={entry.lang}>
              <span className="line-through">{clipLog(entry.before_text)}</span>
            </div>
            <div lang={entry.lang}>{clipLog(entry.after_text)}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}
