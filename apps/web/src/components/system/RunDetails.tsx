import { Badge, Skeleton } from "@aidr/ui";
import type { ReactNode, RefObject } from "react";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { RunAttemptRows } from "./RunAttemptRows";
import { RunErrorsPanel } from "./RunErrorsPanel";
import { RunModelLinks } from "./RunModelLinks";
import { RunWorkflowGraph } from "./RunWorkflowGraph";
import { COPY, statusLabel } from "./run-details-copy";
import {
  bySourceSubline,
  distinctModels,
  fallbackTransitions,
  formatDuration,
  formatTimestamp,
  formatTokenValue,
  isPreIdentityRun,
  type RunAttemptsState,
  runModelsDisclosure,
  runStatus,
  safeRunSteps,
  statusVariant,
  stepFallbackNotes,
  tokenBreakdown,
} from "./run-format";

interface RunDetailsProps {
  run: WorkflowRunRow;
  lang: "en" | "vi";
  attemptsState: RunAttemptsState;
  attempts: LlmCallRow[];
  /** The per-run read hit its cap; more calls exist than are shown. */
  attemptsTruncated?: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
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

export function RunDetails({
  run,
  lang,
  attemptsState,
  attempts,
  attemptsTruncated = false,
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
  // #189: a run with no attributable attempts still explains provider
  // failures in its own step reasons — mirror those (scrubbed) instead of
  // reporting "No error recorded." next to a chain-exhausted tldr step.
  const stepNotes = stepFallbackNotes(steps);
  const preIdentity = isPreIdentityRun(stats, llm, attempts);
  // The list payload carries the model inventory, but a run whose list row
  // had none can still have models in the attempts fetched on expand. Prefer
  // the summary (it is complete) and fall back to the fetched rows.
  const models =
    llm && llm.models.length > 0 ? llm.models : distinctModels(attempts);
  // #189 review: the Models panel may only blame run-id tracking once a
  // lookup has completed and returned zero rows. A failed/unsupported/
  // in-flight lookup gets its own state so the panel never contradicts the
  // Attempts panel directly below it.
  const modelsState = runModelsDisclosure(
    attemptsState,
    models,
    stats,
    llm,
    attempts
  );
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
          {models.length > 0 ? (
            <RunModelLinks models={models} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {modelsState === "pre_identity"
                ? copy.preIdentityModels
                : modelsState === "unavailable"
                  ? copy.modelsUnavailable
                  : modelsState === "pending"
                    ? copy.modelsLoading
                    : copy.noModels}
            </p>
          )}
        </div>
        <RunErrorsPanel
          run={run}
          lang={lang}
          failedAttempts={failedAttempts}
          fallback={fallback}
          stepNotes={stepNotes}
        />
      </div>

      {steps.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {copy.workflow}
          </p>
          <RunWorkflowGraph steps={steps} attempts={attempts} />
        </div>
      ) : (
        <div className="border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">{copy.noWorkflow}</p>
        </div>
      )}

      <details className="group border-t border-border/60 pt-3">
        <summary className="mb-1.5 cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
          <span
            aria-hidden
            className="mr-1 inline-block transition-transform group-open:rotate-90"
          >
            ›
          </span>
          {copy.attempts}
          {attempts.length > 0 ? ` · ${attempts.length}` : ""}
        </summary>
        {attemptsState === "loading" ? (
          <>
            <Skeleton className="h-16 w-full" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {copy.attemptsLoading}
            </p>
          </>
        ) : attemptsState === "ready" ? (
          <>
            <RunAttemptRows attempts={attempts} lang={lang} />
            {attemptsTruncated ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {copy.attemptsTruncated}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {attemptsState === "empty"
              ? preIdentity
                ? copy.attemptsPreIdentity
                : copy.attemptsEmpty
              : attemptsState === "error"
                ? copy.attemptsError
                : attemptsState === "unavailable"
                  ? copy.attemptsUnavailable
                  : copy.noAttempts}
          </p>
        )}
      </details>
    </fieldset>
  );
}
