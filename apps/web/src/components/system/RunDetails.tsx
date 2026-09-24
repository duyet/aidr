import { Badge, Skeleton } from "@aidr/ui";
import { AlertTriangle, ArrowRight, Check, Circle } from "lucide-react";
import type { ReactNode } from "react";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { RunAttemptRows } from "./RunAttemptRows";
import {
  bySourceSubline,
  formatDuration,
  formatSafeDetail,
  formatSafeError,
  formatTimestamp,
  formatTokenValue,
  safeRunSteps,
  shortModel,
  statusVariant,
  tokenBreakdown,
} from "./run-format";

interface RunDetailsProps {
  run: WorkflowRunRow;
  lang: "en" | "vi";
  loadingAttempts: boolean;
  attempts: LlmCallRow[];
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
    models: "Models",
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
  },
} as const;

function statusForRun(
  run: WorkflowRunRow
): "ok" | "error" | "empty" | "unknown" {
  if (run.error) return "error";
  if (run.items_fetched === 0) return "empty";
  if (run.items_fetched == null) return "unknown";
  return "ok";
}

function statusLabel(
  status: ReturnType<typeof statusForRun>,
  lang: "en" | "vi"
): string {
  const copy = COPY[lang];
  if (status === "ok") return copy.ok;
  if (status === "error") return copy.error;
  if (status === "empty") return copy.empty;
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
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
          ) : null}
          <a
            href={anyrouterModelUrl(model)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-accent"
            title={model}
          >
            {shortModel(model)}
          </a>
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
  loadingAttempts,
  attempts,
}: RunDetailsProps) {
  const copy = COPY[lang];
  const llm = run.llm;
  const stats = run.stats;
  const steps = safeRunSteps(stats);
  const status = statusForRun(run);
  const source = stats ? bySourceSubline(stats) : null;
  const breakdown = tokenBreakdown(attempts, stats, llm);
  const failedAttempts = attempts.filter(
    (attempt) => !attempt.ok && attempt.error
  );
  const hasFallback = Boolean(
    llm && (llm.failures > 0 || llm.models.length > 1)
  );
  const regionLabel = copy.summary;

  return (
    <section className="space-y-3 text-left" aria-label={regionLabel}>
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
              variant={statusVariant(status === "ok", status === "empty")}
              className="mt-0.5 px-1.5 py-0 text-[10px] font-normal"
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
                <p className="break-words">
                  {copy.fallback}:{" "}
                  {llm?.models.map(shortModel).join(" → ") ?? "—"}
                </p>
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
        {loadingAttempts ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <RunAttemptRows attempts={attempts} lang={lang} />
        )}
      </div>
    </section>
  );
}
