import { Badge, Skeleton } from "@aidr/ui";
import { AlertTriangle, Check, Circle } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { anyrouterModelUrl, isValidAnyrouterModel } from "../../lib/anyrouter";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { RunAttemptRows } from "./RunAttemptRows";
import {
  bySourceSubline,
  fallbackTransitions,
  formatDuration,
  formatSafeDetail,
  formatSafeError,
  formatTimestamp,
  formatTokenValue,
  type RunAttemptsState,
  runStatus,
  safeRunSteps,
  shortModel,
  statusVariant,
  tokenBreakdown,
} from "./run-format";

interface RunDetailsProps {
  run: WorkflowRunRow;
  lang: "en" | "vi";
  attemptsState: RunAttemptsState;
  attempts: LlmCallRow[];
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

const COPY = {
  en: {
    summary: "Run summary",
    started: "Started",
    ended: "Ended",
    duration: "Duration",
    status: "Status",
    source: "Sources",
    tokens: "Token usage",
    total: "Total",
    input: "Input",
    output: "Output",
    cached: "Cached",
    models: "Models used",
    workflow: "Workflow steps",
    attempts: "LLM attempts",
    noAttempts: "No per-attempt data available.",
    noModels: "No model data available.",
    noWorkflow: "No workflow step detail available.",
    errors: "Errors / fallback",
    fallback: "Fallback chain",
    noErrors: "No error recorded.",
    ok: "OK",
    error: "Error",
    empty: "Empty",
    unknown: "Unknown",
    inProgress: "In progress",
    attemptsLoading: "Loading attempt details…",
    attemptsUnavailable: "Attempt details are unavailable.",
    attemptsError: "Could not load attempt details.",
    attemptsEmpty: "No LLM calls recorded for this run.",
  },
  vi: {
    summary: "Tóm tắt lần chạy",
    started: "Bắt đầu",
    ended: "Kết thúc",
    duration: "Thời lượng",
    status: "Trạng thái",
    source: "Nguồn",
    tokens: "Mức dùng token",
    total: "Tổng",
    input: "Đầu vào",
    output: "Đầu ra",
    cached: "Đệm",
    models: "Mô hình",
    workflow: "Các bước",
    attempts: "Các lần gọi LLM",
    noAttempts: "Chưa có dữ liệu từng lần gọi.",
    noModels: "Chưa có dữ liệu mô hình.",
    noWorkflow: "Chưa có dữ liệu bước xử lý.",
    errors: "Lỗi / fallback",
    fallback: "Chuỗi fallback",
    noErrors: "Không ghi nhận lỗi.",
    ok: "OK",
    error: "Lỗi",
    empty: "Trống",
    unknown: "Không rõ",
    inProgress: "Đang chạy",
    attemptsLoading: "Đang tải chi tiết lần gọi…",
    attemptsUnavailable: "Không có chi tiết lần gọi.",
    attemptsError: "Không thể tải chi tiết lần gọi.",
    attemptsEmpty: "Không ghi nhận lần gọi LLM cho lần chạy này.",
  },
} as const;

function statusLabel(
  status: ReturnType<typeof runStatus>,
  lang: "en" | "vi"
): string {
  const copy = COPY[lang];
  if (status === "ok") return copy.ok;
  if (status === "error") return copy.error;
  if (status === "empty") return copy.empty;
  if (status === "in_progress") return copy.inProgress;
  return copy.unknown;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-xs text-foreground">{children}</dd>
    </div>
  );
}

function ModelLinks({ models }: { models: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
      {models.map((model, index) => (
        <span
          key={`${model}-${index}`}
          className="inline-flex items-center gap-1"
        >
          {index > 0 ? (
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
          ) : null}
          {isValidAnyrouterModel(model) ? (
            <a
              href={anyrouterModelUrl(model)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-accent"
              title={formatSafeDetail(model, 160)}
            >
              {shortModel(formatSafeDetail(model, 160))}
            </a>
          ) : (
            <span title={formatSafeDetail(model, 160)}>
              {shortModel(formatSafeDetail(model, 160))}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function StepList({ steps }: { steps: ReturnType<typeof safeRunSteps> }) {
  return (
    <ol className="space-y-1.5 text-xs">
      {steps.map((step, index) => {
        const action = formatSafeDetail(step.action, 160);
        const isSkipped = /skip|no eligible|already_sent/i.test(action);
        const isFailure = /fail|error/i.test(action);
        return (
          <li
            key={`${step.name}-${index}`}
            className="flex min-w-0 items-start gap-1.5"
          >
            {isFailure ? (
              <AlertTriangle
                className="mt-0.5 h-3 w-3 shrink-0 text-destructive"
                aria-hidden
              />
            ) : isSkipped ? (
              <Circle
                className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : (
              <Check
                className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
            )}
            <span className="min-w-0">
              <span className="font-medium text-foreground">
                {formatSafeDetail(step.name, 80)}
              </span>
              <span className="text-muted-foreground"> — {action}</span>
              {step.reason ? (
                <span className="block text-[11px] text-muted-foreground">
                  {formatSafeDetail(step.reason, 200)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RunDetails({
  run,
  lang,
  attemptsState,
  attempts,
  onClose,
  triggerRef,
}: RunDetailsProps) {
  const copy = COPY[lang];
  const llm = run.llm;
  const stats = run.stats;
  const steps = safeRunSteps(stats);
  const status = runStatus(run);
  const source = stats ? bySourceSubline(stats) : null;
  const breakdown = tokenBreakdown(attempts, stats, llm);
  const failedAttempts = attempts.filter((attempt) => !attempt.ok);
  const fallback = fallbackTransitions(attempts);
  const hasFallback = fallback.length > 0;
  const regionLabel = copy.summary;

  return (
    <fieldset
      className="min-w-0 space-y-3 border-0 p-0 text-left"
      tabIndex={-1}
      aria-label={regionLabel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          triggerRef.current?.focus();
        }
      }}
    >
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {copy.summary}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Detail label={copy.started}>
            {formatTimestamp(run.started_at, lang)}
          </Detail>
          <Detail label={copy.ended}>
            {formatTimestamp(run.finished_at, lang)}
          </Detail>
          <Detail label={copy.duration}>
            {formatDuration(run.started_at, run.finished_at)}
          </Detail>
          <Detail label={copy.status}>
            <Badge
              variant={statusVariant(status !== "error", status === "empty")}
              className={`mt-0.5 px-1.5 py-0 text-[10px] font-normal ${
                status === "in_progress"
                  ? "border-border bg-muted text-muted-foreground"
                  : ""
              }`}
            >
              {statusLabel(status, lang)}
            </Badge>
          </Detail>
          <Detail label={copy.source}>{source ?? "—"}</Detail>
          <Detail label={copy.tokens}>
            <span className="font-mono tabular-nums">
              {copy.total}: {formatTokenValue(breakdown.total)}
            </span>
          </Detail>
          <Detail label={copy.input}>
            <span className="font-mono tabular-nums">
              {formatTokenValue(breakdown.input)}
            </span>
          </Detail>
          <Detail label={copy.output}>
            <span className="font-mono tabular-nums">
              {formatTokenValue(breakdown.output)}
            </span>
          </Detail>
          <Detail label={copy.cached}>
            <span className="font-mono tabular-nums">
              {formatTokenValue(breakdown.cached)}
            </span>
          </Detail>
        </dl>
      </div>

      <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {copy.models}
          </p>
          {llm && llm.models.length > 0 ? (
            <ModelLinks models={llm.models} />
          ) : (
            <p className="text-xs text-muted-foreground">{copy.noModels}</p>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {copy.errors}
          </p>
          {run.error || failedAttempts.length > 0 || hasFallback ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              {run.error ? (
                <p className="break-words text-destructive">
                  {formatSafeError(run.error)}
                </p>
              ) : null}
              {hasFallback ? (
                <div className="break-words">
                  <p>{copy.fallback}:</p>
                  <ul className="ml-3 list-disc">
                    {fallback.map((transition) => (
                      <li
                        key={`${transition.task}-${transition.from}-${transition.to}`}
                      >
                        {transition.task}: {shortModel(transition.from)} →{" "}
                        {shortModel(transition.to)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {failedAttempts.length > 0 ? (
                <ul className="space-y-0.5">
                  {failedAttempts.map((attempt, index) => (
                    <li key={`${attempt.ts}-${attempt.model}-${index}`}>
                      <span className="font-medium text-foreground">
                        {formatSafeDetail(attempt.task, 80)}
                      </span>
                      {" · "}
                      {formatSafeError(attempt.error)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{copy.noErrors}</p>
          )}
        </div>
      </div>

      {steps.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {copy.workflow}
          </p>
          <StepList steps={steps} />
        </div>
      ) : (
        <div className="border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">{copy.noWorkflow}</p>
        </div>
      )}

      <div className="border-t border-border/60 pt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {copy.attempts}
        </p>
        {attemptsState === "loading" ? (
          <>
            <Skeleton className="h-16 w-full" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {copy.attemptsLoading}
            </p>
          </>
        ) : attemptsState === "ready" ? (
          <RunAttemptRows attempts={attempts} lang={lang} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {attemptsState === "empty"
              ? copy.attemptsEmpty
              : attemptsState === "error"
                ? copy.attemptsError
                : attemptsState === "unavailable"
                  ? copy.attemptsUnavailable
                  : copy.noAttempts}
          </p>
        )}
      </div>
    </fieldset>
  );
}
