import { TableBody, TableHead, TableHeader, TableRow } from "@aidr/ui";
import { useState } from "react";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { useHorizontalScroll } from "../../lib/use-horizontal-scroll";
import { RunRow } from "./RunRow";
import type { RunAttemptsState } from "./run-format";
import { formatDurationSec, hasRunDetails, nextOpenId } from "./run-format";

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
  const [attemptsStateByRun, setAttemptsStateByRun] = useState<
    Record<string, RunAttemptsState>
  >({});

  const toggleRun = (r: WorkflowRunRow, expanded: boolean) => {
    if (!hasRunDetails(r)) return;
    setOpenId(nextOpenId(openId, r.id));
    // Also fetch when the list summary is unavailable: the endpoint can
    // distinguish an empty run from a database/identity lookup failure.
    if (expanded) return;
    if (r.id in attemptsByRun || (r.llm?.attempts?.length ?? 0) > 0) return;
    setAttemptsStateByRun((current) => ({ ...current, [r.id]: "loading" }));
    fetch(`/api/system/run-attempts?run_id=${encodeURIComponent(r.id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("attempt lookup failed");
        return (await res.json()) as {
          attempts?: LlmCallRow[];
          status?: "ready" | "unavailable";
        };
      })
      .then((res) => {
        if (res.status === "unavailable") {
          setAttemptsStateByRun((current) => ({
            ...current,
            [r.id]: "unavailable",
          }));
          return;
        }
        const attempts = res.attempts;
        if (!Array.isArray(attempts))
          throw new Error("invalid attempt response");
        setAttemptsByRun((current) => ({ ...current, [r.id]: attempts }));
        setAttemptsStateByRun((current) => ({
          ...current,
          [r.id]: attempts.length > 0 ? "ready" : "empty",
        }));
      })
      .catch(() => {
        setAttemptsStateByRun((current) => ({
          ...current,
          [r.id]: "error",
        }));
      });
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
                attemptsState={
                  attemptsStateByRun[r.id] ??
                  ((r.llm?.attempts?.length ?? 0) > 0 ? "ready" : "idle")
                }
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
