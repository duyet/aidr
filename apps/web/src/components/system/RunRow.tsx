import { Badge, TableCell, TableRow } from "@aidr/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useRef } from "react";
import { formatTokens } from "../../lib/format";
import { timeAgo } from "../../lib/lang";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { RunDetails } from "./RunDetails";
import { RunModelsCell } from "./RunModelsCell";
import {
  bySourceSubline,
  extraBadges,
  formatDuration,
  formatDurationSec,
  formatMs,
  formatSafeError,
  hasRunDetails,
  normalizeRunTokens,
  type RunAttemptsState,
  runDetailsId,
  runDisclosureLabel,
  runStatus,
  statusVariant,
} from "./run-format";

export function RunRow({
  run: r,
  lang,
  maxDuration,
  expanded,
  attemptsState,
  attempts,
  onToggle,
}: {
  run: WorkflowRunRow;
  lang: "en" | "vi";
  maxDuration: number;
  expanded: boolean;
  attemptsState: RunAttemptsState;
  attempts: LlmCallRow[];
  onToggle: () => void;
}) {
  const status = runStatus(r);
  const successful = status === "ok";
  const nonError = status !== "error";
  const partial = status === "empty";
  const neutral = status === "in_progress" || status === "unknown";
  const stats = r.stats;
  const llm = r.llm;
  const sourceLine = stats ? bySourceSubline(stats) : null;
  const badges = stats ? extraBadges(stats, lang) : [];
  const sec = formatDurationSec(r.started_at, r.finished_at);
  const pct = sec ? Math.max((sec / maxDuration) * 100, 4) : 0;
  const tokenSummary = normalizeRunTokens(stats, llm, attempts);
  const tokens = tokenSummary.total;
  const canExpand = hasRunDetails(r);
  const detailsId = runDetailsId(r.id);
  const disclosureLabel = runDisclosureLabel(lang, expanded);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const tokenRef = useRef<HTMLButtonElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openFrom = (target: HTMLButtonElement | null) => {
    activeTriggerRef.current = target;
    onToggle();
  };

  return (
    <Fragment>
      <TableRow
        className={canExpand ? "cursor-pointer" : undefined}
        onClick={() => {
          if (!canExpand) return;
          openFrom(chevronRef.current);
        }}
      >
        <TableCell className="px-2 py-2 text-muted-foreground">
          {canExpand ? (
            <button
              ref={chevronRef}
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={disclosureLabel}
              className="inline-flex h-8 w-8 min-h-8 min-w-8 touch-manipulation items-center justify-center rounded-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={(e) => {
                e.stopPropagation();
                openFrom(e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && expanded) {
                  e.preventDefault();
                  e.stopPropagation();
                  openFrom(e.currentTarget);
                  e.currentTarget.focus();
                }
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
            variant={statusVariant(nonError, partial)}
            className={`whitespace-nowrap text-[10px] font-medium ${
              successful
                ? "border-transparent bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                : partial
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : neutral
                    ? "border-border bg-muted text-muted-foreground"
                    : ""
            }`}
            title={status === "error" ? formatSafeError(r.error) : undefined}
          >
            {status === "error"
              ? lang === "vi"
                ? "lỗi"
                : "error"
              : status === "in_progress"
                ? lang === "vi"
                  ? "đang chạy"
                  : "running"
                : status === "empty"
                  ? lang === "vi"
                    ? "trống"
                    : "empty"
                  : status === "unknown"
                    ? lang === "vi"
                      ? "không rõ"
                      : "unknown"
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
          {canExpand && tokens !== null ? (
            <button
              ref={tokenRef}
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={`${disclosureLabel} · ${formatTokens(tokens)} ${
                lang === "vi" ? "token" : "tokens"
              }`}
              className="min-h-8 touch-manipulation rounded-sm px-1 underline decoration-dotted underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={(e) => {
                e.stopPropagation();
                openFrom(e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && expanded) {
                  e.preventDefault();
                  e.stopPropagation();
                  openFrom(e.currentTarget);
                  e.currentTarget.focus();
                }
              }}
            >
              {formatTokens(tokens)}
            </button>
          ) : tokens !== null ? (
            formatTokens(tokens)
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums">
          {tokenSummary.cached !== null ? (
            <span
              className={
                tokenSummary.cached > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground"
              }
            >
              {formatTokens(tokenSummary.cached)}
            </span>
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
      {expanded && canExpand ? (
        <TableRow className="hover:bg-transparent">
          <TableCell
            id={detailsId}
            colSpan={11}
            className="min-w-0 max-w-full bg-muted/20 px-3 py-3"
          >
            <RunDetails
              run={r}
              lang={lang}
              attemptsState={attemptsState}
              attempts={attempts}
              onClose={onToggle}
              triggerRef={activeTriggerRef}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}
