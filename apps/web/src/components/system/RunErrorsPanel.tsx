import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { COPY } from "./run-details-copy";
import {
  type fallbackTransitions,
  formatSafeDetail,
  formatSafeError,
  runFallbackKindLabel,
  shortModel,
  type stepFallbackNotes,
} from "./run-format";

/** Errors panel: run error, model fallbacks, step notes, failed attempts. */
export function RunErrorsPanel({
  run,
  lang,
  failedAttempts,
  fallback,
  stepNotes,
}: {
  run: WorkflowRunRow;
  lang: "en" | "vi";
  failedAttempts: LlmCallRow[];
  fallback: ReturnType<typeof fallbackTransitions>;
  stepNotes: ReturnType<typeof stepFallbackNotes>;
}) {
  const copy = COPY[lang];
  const hasFallback = fallback.length > 0;
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {copy.errors}
      </p>
      {run.error ||
      failedAttempts.length > 0 ||
      hasFallback ||
      stepNotes.length > 0 ? (
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
          {stepNotes.length > 0 ? (
            <div className="break-words">
              <p>{copy.fromSteps}:</p>
              <ul className="ml-3 list-disc">
                {stepNotes.map((note, index) => (
                  <li key={`${note.step}-${note.kind}-${index}`}>
                    <span className="font-medium text-foreground">
                      {note.step}: {runFallbackKindLabel(note.kind, lang)}
                    </span>{" "}
                    — {note.detail}
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
  );
}
