import { useEffect, useRef, useState } from "react";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { RUN_ROW_GRID, RunRow } from "./RunRow";
import type { RunAttemptsState } from "./run-format";
import {
  formatDurationSec,
  hasRunDetails,
  nextOpenId,
  runAnchorId,
} from "./run-format";

interface RunsListProps {
  runs: WorkflowRunRow[];
  lang: "en" | "vi";
  /** Deep-linked run (`/data?tab=runs&run=<id>`): expanded, highlighted,
   *  and scrolled into view once. */
  focusRunId?: string;
}

export function RunsList({ runs, lang, focusRunId }: RunsListProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Attempt rows are no longer inlined in the runs payload — each
  // expanded row fetches /api/system/run-attempts once, then caches.
  const [attemptsByRun, setAttemptsByRun] = useState<
    Record<string, LlmCallRow[]>
  >({});
  const [attemptsStateByRun, setAttemptsStateByRun] = useState<
    Record<string, RunAttemptsState>
  >({});
  // A run with more calls than the endpoint's per-run cap still renders, but
  // says so rather than implying the table below is complete.
  const [truncatedByRun, setTruncatedByRun] = useState<Record<string, boolean>>(
    {}
  );

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
          truncated?: boolean;
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
        setTruncatedByRun((current) => ({
          ...current,
          [r.id]: res.truncated === true,
        }));
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

  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusRunId || focusedRef.current === focusRunId) return;
    const run = runs.find((r) => r.id === focusRunId);
    if (!run) return;
    focusedRef.current = focusRunId;
    if (openId !== run.id) toggleRun(run, false);
    requestAnimationFrame(() => {
      document
        .getElementById(runAnchorId(run.id))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusRunId, runs]);

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

  const vi = lang === "vi";
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div
        aria-hidden
        className={`hidden gap-x-4 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground md:grid ${RUN_ROW_GRID}`}
      >
        <span>{vi ? "Trạng thái" : "Status"}</span>
        <span>{vi ? "Bắt đầu" : "Started"}</span>
        <span>{vi ? "Thời lượng" : "Duration"}</span>
        <span>{vi ? "Tin" : "Items"}</span>
        <span>{vi ? "Mô hình" : "Models"}</span>
        <span className="text-right">Tokens</span>
      </div>
      <ul className="divide-y divide-border/60">
        {runs.map((r) => {
          const expanded = openId === r.id;
          return (
            <RunRow
              key={r.id}
              run={r}
              lang={lang}
              maxDuration={maxDuration}
              expanded={expanded}
              highlighted={r.id === focusRunId}
              attemptsState={
                attemptsStateByRun[r.id] ??
                ((r.llm?.attempts?.length ?? 0) > 0 ? "ready" : "idle")
              }
              attempts={attemptsByRun[r.id] ?? r.llm?.attempts ?? []}
              attemptsTruncated={truncatedByRun[r.id] === true}
              onToggle={() => toggleRun(r, expanded)}
            />
          );
        })}
      </ul>
    </div>
  );
}
