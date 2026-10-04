import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { ModelLogo } from "./ModelLogo";
import { COPY } from "./run-details-copy";
import {
  type fallbackTransitions,
  formatSafeError,
  groupFailedAttempts,
  groupFallbackTransitions,
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
              <p className="mb-0.5">{copy.fallback}:</p>
              <ul className="space-y-1">
                {groupFallbackTransitions(fallback).map((t) => (
                  <li
                    key={`${t.task}-${t.from}-${t.to}`}
                    className="flex items-baseline gap-2"
                  >
                    <span className="shrink-0 rounded bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {t.count}×
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">
                        {t.task}
                      </span>
                      {" · "}
                      <span className="inline-flex flex-wrap items-center gap-x-1 font-mono text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          <ModelLogo model={t.from} />
                          {shortModel(t.from)}
                        </span>
                        <span aria-hidden>→</span>
                        <span className="inline-flex items-center gap-1">
                          <ModelLogo model={t.to} />
                          {shortModel(t.to)}
                        </span>
                      </span>
                    </span>
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
            <ul className="space-y-1">
              {groupFailedAttempts(failedAttempts).map((group) => (
                <li
                  key={`${group.task}-${group.model}-${group.errorCode}-${group.error}`}
                  className="flex items-baseline gap-2"
                >
                  <span className="shrink-0 rounded bg-destructive/10 px-1.5 font-mono text-[10px] tabular-nums text-destructive">
                    {group.count}×
                  </span>
                  <span className="min-w-0 break-words">
                    <span className="font-medium text-foreground">
                      {group.task}
                    </span>
                    {" · "}
                    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                      <ModelLogo model={group.model} />
                      {shortModel(group.model)}
                    </span>
                    {" · "}
                    {group.error}
                    {group.errorCode ? (
                      <span className="ml-1 font-mono text-[10px]">
                        {group.errorCode}
                      </span>
                    ) : null}
                  </span>
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
