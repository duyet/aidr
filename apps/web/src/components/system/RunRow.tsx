import { Badge, Skeleton, TableCell, TableRow } from "@aidr/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { formatTokens } from "../../lib/format";
import { timeAgo } from "../../lib/lang";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { RunAttemptRows } from "./RunAttemptRows";
import { RunModelsCell } from "./RunModelsCell";
import {
  bySourceSubline,
  extraBadges,
  formatDuration,
  formatDurationSec,
  formatMs,
  llmTokens,
  statusVariant,
} from "./run-format";

export function RunRow({
  run: r,
  lang,
  maxDuration,
  expanded,
  loadingAttempts,
  attempts,
  onToggle,
}: {
  run: WorkflowRunRow;
  lang: "en" | "vi";
  maxDuration: number;
  expanded: boolean;
  loadingAttempts: boolean;
  attempts: LlmCallRow[];
  onToggle: () => void;
}) {
  const ok = !r.error;
  const partial = ok && (r.items_fetched ?? 0) === 0;
  const stats = r.stats;
  const llm = r.llm;
  const sourceLine = stats ? bySourceSubline(stats) : null;
  const badges = stats ? extraBadges(stats, lang) : [];
  const sec = formatDurationSec(r.started_at, r.finished_at);
  const pct = sec ? Math.max((sec / maxDuration) * 100, 4) : 0;
  const tokens = llmTokens(stats, llm);
  const canExpand = Boolean(llm && llm.calls > 0);

  return (
    <Fragment>
      <TableRow
        className={canExpand ? "cursor-pointer" : undefined}
        onClick={() => {
          if (!canExpand) return;
          onToggle();
        }}
      >
        <TableCell className="px-2 py-2 text-muted-foreground">
          {canExpand ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={
                lang === "vi"
                  ? "Chi tiết lần gọi LLM"
                  : "Toggle LLM call details"
              }
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          ) : null}
        </TableCell>
        <TableCell className="px-3 py-2">
          <Badge
            variant={statusVariant(ok, partial)}
            className={`whitespace-nowrap text-[10px] font-medium ${
              ok && !partial
                ? "border-transparent bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                : partial
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : ""
            }`}
            title={!ok ? (r.error ?? undefined) : undefined}
          >
            {!ok
              ? lang === "vi"
                ? "lỗi"
                : "error"
              : partial
                ? lang === "vi"
                  ? "trống"
                  : "empty"
                : "OK"}
          </Badge>
        </TableCell>
        <TableCell
          className="px-3 py-2 font-mono text-xs tabular-nums text-foreground"
          title={
            r.started_at
              ? new Date(r.started_at * 1000).toLocaleString()
              : undefined
          }
          suppressHydrationWarning
        >
          {r.started_at ? timeAgo(r.started_at, Date.now(), lang) : "—"}
        </TableCell>
        <TableCell className="px-3 py-2 text-right">
          <div className="font-mono text-xs tabular-nums text-foreground">
            {formatDuration(r.started_at, r.finished_at)}
          </div>
          {sec ? (
            <div
              className="ml-auto mt-1 h-1 rounded-full bg-accent"
              style={{ width: `${pct}%`, maxWidth: "3.5rem" }}
              title={`${sec}s`}
            />
          ) : null}
        </TableCell>
        <TableCell className="px-3 py-2">
          <RunModelsCell llm={llm} />
        </TableCell>
        <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground">
          {tokens ? formatTokens(tokens) : "—"}
        </TableCell>
        <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums">
          {llm && llm.cachedTokens > 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              {formatTokens(llm.cachedTokens)}
            </span>
          ) : llm ? (
            <span className="text-muted-foreground">0</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground">
          {llm ? formatMs(llm.durationMs) : "—"}
        </TableCell>
        <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground">
          <div>{r.items_fetched ?? 0}</div>
          {sourceLine ? (
            <div
              className="font-sans text-[10px] font-normal text-muted-foreground"
              title={sourceLine}
            >
              {sourceLine}
            </div>
          ) : null}
        </TableCell>
        <TableCell
          className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground"
          title={
            stats
              ? `${lang === "vi" ? "Mới" : "New"} ${stats.new ?? 0} · ${
                  lang === "vi" ? "Gộp" : "Merged"
                } ${stats.merged ?? 0} · ${
                  lang === "vi" ? "Loại" : "Rejected"
                } ${stats.rejected ?? 0}`
              : undefined
          }
        >
          {stats
            ? `+${stats.new ?? 0} ~${stats.merged ?? 0} −${stats.rejected ?? 0}`
            : (r.items_new ?? 0)}
        </TableCell>
        <TableCell className="px-3 py-2">
          {badges.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {badges.map((b) => (
                <Badge
                  key={b.label}
                  variant="outline"
                  className="whitespace-nowrap px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                >
                  {b.label}
                  {b.value > 1 ? ` ${b.value}` : ""}
                </Badge>
              ))}
            </span>
          ) : null}
        </TableCell>
      </TableRow>
      {expanded && llm ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={11} className="bg-muted/20 px-3 py-3">
            {loadingAttempts ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <RunAttemptRows attempts={attempts} />
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}
