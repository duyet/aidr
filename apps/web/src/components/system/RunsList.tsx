import { TableBody, TableHead, TableHeader, TableRow } from "@aidr/ui";
import { useState } from "react";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { useHorizontalScroll } from "../../lib/use-horizontal-scroll";
import { RunRow } from "./RunRow";
import { formatDurationSec } from "./run-format";

interface RunsListProps {
  runs: WorkflowRunRow[];
  lang: "en" | "vi";
}

export function RunsList({ runs, lang }: RunsListProps) {
  const scrollRef = useHorizontalScroll<HTMLDivElement>();
  const [openId, setOpenId] = useState<string | null>(null);
  // Attempt rows are no longer inlined in the runs payload — each
  // expanded row fetches /api/system/run-attempts once, then caches.
  const [attemptsByRun, setAttemptsByRun] = useState<
    Record<string, LlmCallRow[]>
  >({});
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  const toggleRun = (r: WorkflowRunRow, expanded: boolean) => {
    if (!(r.llm && r.llm.calls > 0)) return;
    setOpenId(expanded ? null : r.id);
    if (expanded) return;
    if (r.id in attemptsByRun || (r.llm.attempts?.length ?? 0) > 0) return;
    if (r.started_at == null) return;
    setLoadingRunId(r.id);
    const since = r.started_at * 1000;
    const until =
      (r.finished_at ?? Math.floor(Date.now() / 1000)) * 1000 + 15_000;
    fetch(`/api/system/run-attempts?since=${since}&until=${until}`)
      .then((res) =>
        res.ok ? (res.json() as Promise<{ attempts?: LlmCallRow[] }>) : null
      )
      .then((res) => {
        const attempts = res?.attempts;
        if (Array.isArray(attempts)) {
          setAttemptsByRun((m) => ({ ...m, [r.id]: attempts }));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRunId(null));
  };

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "vi" ? "Chưa có lần chạy nào." : "No runs yet."}
      </p>
    );
  }

  const maxDuration = Math.max(
    ...runs.map((r) => formatDurationSec(r.started_at, r.finished_at)),
    1
  );

  return (
    <div
      ref={scrollRef}
      className="scrollbar-hide -mx-1 overflow-x-auto rounded-md border border-border"
    >
      {/* Native table: shared Table wraps overflow-auto itself, which
          breaks useHorizontalScroll edge-fade on the outer container. */}
      <table className="w-full min-w-[960px] caption-bottom text-left text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 w-8 px-2" />
            <TableHead className="h-9 px-3 text-xs font-medium">
              {lang === "vi" ? "Trạng thái" : "Status"}
            </TableHead>
            <TableHead className="h-9 px-3 text-xs font-medium">
              {lang === "vi" ? "Bắt đầu" : "Started"}
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-xs font-medium">
              {lang === "vi" ? "Thời lượng" : "Duration"}
            </TableHead>
            <TableHead className="h-9 px-3 text-xs font-medium">
              Model
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-xs font-medium">
              Tokens
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-xs font-medium">
              Cached
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-xs font-medium">
              LLM time
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-xs font-medium">
              {lang === "vi" ? "Lấy về" : "Fetched"}
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-xs font-medium">
              {lang === "vi" ? "Mới/Gộp/Loại" : "New/Merged/Rej"}
            </TableHead>
            <TableHead className="h-9 px-3 text-xs font-medium">
              {lang === "vi" ? "Khác" : "Extras"}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => {
            const expanded = openId === r.id;
            return (
              <RunRow
                key={r.id}
                run={r}
                lang={lang}
                maxDuration={maxDuration}
                expanded={expanded}
                loadingAttempts={loadingRunId === r.id}
                attempts={attemptsByRun[r.id] ?? r.llm?.attempts ?? []}
                onToggle={() => toggleRun(r, expanded)}
              />
            );
          })}
        </TableBody>
      </table>
    </div>
  );
}
