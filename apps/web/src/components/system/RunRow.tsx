import { Badge } from "@aidr/ui";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
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
  runAnchorId,
  runDetailsId,
  runDisclosureLabel,
  runStatus,
} from "./run-format";

type RunStatus = ReturnType<typeof runStatus>;

const STATUS_LABEL: Record<RunStatus, { en: string; vi: string }> = {
  ok: { en: "OK", vi: "OK" },
  degraded: { en: "issues", vi: "có lỗi" },
  error: { en: "error", vi: "lỗi" },
  in_progress: { en: "running", vi: "đang chạy" },
  empty: { en: "empty", vi: "trống" },
  unknown: { en: "unknown", vi: "không rõ" },
};

const STATUS_STYLE: Record<RunStatus, { pill: string; dot: string }> = {
  ok: {
    pill: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  degraded: {
    pill: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  error: {
    pill: "border-transparent bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  empty: {
    pill: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  in_progress: {
    pill: "border-border bg-muted text-muted-foreground",
    dot: "animate-pulse bg-muted-foreground",
  },
  unknown: {
    pill: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

/** Column template shared with the list header in RunsList. */
export const RUN_ROW_GRID =
  "md:grid-cols-[6.5rem_6rem_5.5rem_minmax(0,1fr)_minmax(0,14rem)_6rem]";

export function RunRow({
  run: r,
  lang,
  maxDuration,
  expanded,
  attemptsState,
  attempts,
  attemptsTruncated = false,
  highlighted = false,
  onToggle,
}: {
  run: WorkflowRunRow;
  lang: "en" | "vi";
  maxDuration: number;
  expanded: boolean;
  attemptsState: RunAttemptsState;
  attempts: LlmCallRow[];
  /** The per-run read hit its cap; more calls exist than are shown. */
  attemptsTruncated?: boolean;
  /** Deep-linked from the footer's "Updated" link. */
  highlighted?: boolean;
  onToggle: () => void;
}) {
  const status = runStatus(r);
  const style = STATUS_STYLE[status];
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
  const tokenRef = useRef<HTMLButtonElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const vi = lang === "vi";

  const openFrom = (target: HTMLButtonElement | null) => {
    activeTriggerRef.current = target;
    onToggle();
  };
  const close = () => {
    onToggle();
    activeTriggerRef.current?.focus();
  };

  // Move focus into the dialog so Escape and screen readers land there.
  useEffect(() => {
    if (!expanded) return;
    dialogRef.current
      ?.querySelector<HTMLElement>("fieldset[aria-label]")
      ?.focus();
  }, [expanded]);

  const outcome = stats
    ? `+${stats.new ?? 0} ~${stats.merged ?? 0} −${stats.rejected ?? 0}`
    : `+${r.items_new ?? 0}`;
  const outcomeTitle = stats
    ? `${vi ? "Mới" : "New"} ${stats.new ?? 0} · ${vi ? "Gộp" : "Merged"} ${
        stats.merged ?? 0
      } · ${vi ? "Loại" : "Rejected"} ${stats.rejected ?? 0}`
    : undefined;
  const tokenLabel = tokens !== null ? formatTokens(tokens) : "—";

  return (
    <li
      id={runAnchorId(r.id)}
      aria-current={highlighted ? "true" : undefined}
      className={[
        "scroll-mt-24",
        highlighted ? "bg-muted/60 ring-1 ring-inset ring-ring/60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-xs md:gap-x-4 ${RUN_ROW_GRID} ${
          canExpand ? "cursor-pointer hover:bg-muted/40" : ""
        }`}
        onClick={() => {
          if (canExpand) openFrom(tokenRef.current);
        }}
      >
        {/* Status */}
        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.pill}`}
          title={status === "error" ? formatSafeError(r.error) : undefined}
        >
          <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
          {STATUS_LABEL[status][lang]}
        </span>

        {/* Started */}
        <span
          className="font-mono tabular-nums text-foreground"
          title={
            r.started_at
              ? new Date(r.started_at * 1000).toLocaleString()
              : undefined
          }
          suppressHydrationWarning
        >
          {r.started_at ? timeAgo(r.started_at, Date.now(), lang) : "—"}
        </span>

        {/* Duration */}
        <span className="hidden md:block">
          <span className="font-mono tabular-nums text-foreground">
            {formatDuration(r.started_at, r.finished_at)}
          </span>
          {sec ? (
            <span
              className="mt-1 block h-1 rounded-full bg-accent"
              style={{ width: `${pct}%`, maxWidth: "4rem" }}
              title={`${sec}s`}
            />
          ) : null}
        </span>

        {/* Items */}
        <span className="col-span-3 min-w-0 md:col-span-1">
          <span className="font-mono tabular-nums text-foreground">
            {r.items_fetched ?? 0}
          </span>
          <span className="text-muted-foreground">
            {" "}
            {vi ? "lấy về" : "fetched"} ·{" "}
          </span>
          <span
            className="font-mono tabular-nums text-foreground"
            title={outcomeTitle}
          >
            {outcome}
          </span>
          {sourceLine ? (
            <span
              className="block truncate text-[10px] text-muted-foreground"
              title={sourceLine}
            >
              {sourceLine}
            </span>
          ) : null}
          {badges.length > 0 ? (
            <span className="mt-0.5 flex flex-wrap gap-1">
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
        </span>

        {/* Models */}
        <span className="col-span-2 min-w-0 md:col-span-1">
          <RunModelsCell llm={llm} />
        </span>

        {/* Tokens / LLM time: the details trigger */}
        <span className="text-right font-mono tabular-nums">
          {canExpand ? (
            <button
              ref={tokenRef}
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={`${disclosureLabel} · ${tokenLabel} ${
                vi ? "token" : "tokens"
              }`}
              className="min-h-8 touch-manipulation rounded-sm px-1 text-foreground underline decoration-dotted underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={(e) => {
                e.stopPropagation();
                openFrom(e.currentTarget);
              }}
            >
              {tokenLabel}
            </button>
          ) : (
            <span className="text-foreground">{tokenLabel}</span>
          )}
          <span className="block text-[10px] text-muted-foreground">
            {llm ? formatMs(llm.durationMs) : "—"}
            {tokenSummary.cached !== null && tokenSummary.cached > 0 ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                {" "}
                · {formatTokens(tokenSummary.cached)} {vi ? "đệm" : "cached"}
              </span>
            ) : null}
          </span>
        </span>
      </div>

      {expanded && canExpand ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            tabIndex={-1}
            aria-label={runDisclosureLabel(lang, true)}
            className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
            onClick={close}
          />
          <div
            ref={dialogRef}
            id={detailsId}
            role="dialog"
            aria-modal="true"
            aria-label={vi ? "Chi tiết lần chạy" : "Run details"}
            className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-border bg-background shadow-xl"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.pill}`}
              >
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${style.dot}`}
                />
                {STATUS_LABEL[status][lang]}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {vi ? "Lần chạy" : "Run"}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {r.id.slice(0, 8)}
                </span>
              </p>
              <span
                className="font-mono text-xs tabular-nums text-muted-foreground"
                suppressHydrationWarning
              >
                {r.started_at ? timeAgo(r.started_at, Date.now(), lang) : ""}
              </span>
              <button
                type="button"
                aria-label={runDisclosureLabel(lang, true)}
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={close}
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <RunDetails
                run={r}
                lang={lang}
                attemptsState={attemptsState}
                attempts={attempts}
                attemptsTruncated={attemptsTruncated}
                onClose={onToggle}
                triggerRef={activeTriggerRef}
              />
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
